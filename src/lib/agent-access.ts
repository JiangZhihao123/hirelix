import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AGENT_PLAN, isAgentPlan, type AgentAccess, CREDIT_UNITS } from "./agent-plan";
import type { Job } from "./workspace/types";

export class AgentCreditError extends Error {
  constructor() {
    super("Not enough AI credits for this work. Your saved work is still available. Open Settings → Billing to check your allowance.");
    this.name = "AgentCreditError";
  }
}

// Calendar-month allowances are explicit, including for annual subscriptions.
export async function getAgentAccess(userId: string, runner: Pick<typeof db, "execute"> = db): Promise<AgentAccess> {
  const result = await runner.execute(sql`
    SELECT a.trial_started_at, s.subscription_plan, s.subscription_status,
      s.subscription_renews_at, s.subscription_started_at, now() AS current_time,
      date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS month_start
    FROM (SELECT ${userId}::uuid AS id) u
    LEFT JOIN hirelix_agent_access a ON a.user_id=u.id
    LEFT JOIN hirelix_user_settings s ON s.user_id=u.id`);
  const item = result[0] as unknown as { trial_started_at: string | null; subscription_plan: string | null; subscription_status: string | null; subscription_renews_at: string | null; subscription_started_at: string | null; current_time: string; month_start: string };
  const now = new Date(item.current_time);
  const active = ["active", "trialing"].includes(item.subscription_status || "") && (!item.subscription_renews_at || new Date(item.subscription_renews_at) > now);
  const paid = active && isAgentPlan(item.subscription_plan || "");
  const legacy = active && !!item.subscription_plan && item.subscription_plan !== "free" && !isAgentPlan(item.subscription_plan);
  let start = paid || legacy ? new Date(item.month_start) : item.trial_started_at ? new Date(item.trial_started_at) : null;
  const end = start ? new Date(start) : null;
  if (end) { if (paid || legacy) end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + AGENT_PLAN.trialDays); }
  if (paid && item.subscription_started_at && start && new Date(item.subscription_started_at) > start) start = new Date(item.subscription_started_at);
  const state = legacy ? "legacy" : paid ? "paid" : !start ? "trial_ready" : end! <= now ? "expired" : "trial";
  const limit = paid || legacy ? AGENT_PLAN.monthlyCredits : AGENT_PLAN.trialCredits;
  const counts = start ? await runner.execute(sql`
    SELECT coalesce(sum(u.consumed_units) FILTER (WHERE j.status='done'),0)::bigint AS used,
      coalesce(sum(u.reserved_units) FILTER (WHERE j.status IN ('queued','running')),0)::bigint AS reserved
    FROM hirelix_agent_credit_usage u JOIN hirelix_private_jobs j ON j.id=u.job_id
    WHERE u.user_id=${userId}::uuid AND u.charged_at>=${start.toISOString()}::timestamptz
      AND u.charged_at<${end!.toISOString()}::timestamptz`) : [{ used: 0, reserved: 0 }];
  const used = Number(counts[0]?.used || 0) / CREDIT_UNITS;
  const reserved = Number(counts[0]?.reserved || 0) / CREDIT_UNITS;
  const remaining = Math.max(0, Math.round((limit-used-reserved)*CREDIT_UNITS)) / CREDIT_UNITS;
  return { state, used, reserved, limit, remaining: state === "expired" ? 0 : remaining, periodStart: start?.toISOString() || null, periodEnd: end?.toISOString() || null };
}

export async function reserveAgentCredits(userId: string, jobId: string, runner: Pick<typeof db, "execute">) {
  // Serialize allowance checks across all concurrent submissions for this user.
  await runner.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${userId}`}, 0))`);
  await runner.execute(sql`INSERT INTO hirelix_agent_access(user_id) VALUES(${userId}::uuid) ON CONFLICT DO NOTHING`);
  const access = await getAgentAccess(userId, runner);
  if (!access.remaining) return false;
  await runner.execute(sql`INSERT INTO hirelix_agent_credit_usage(job_id,user_id,reserved_units) VALUES(${jobId}::uuid,${userId}::uuid,${Math.min(CREDIT_UNITS, Math.round(access.remaining*CREDIT_UNITS))}) ON CONFLICT(job_id) DO UPDATE SET charged_at=now(),reserved_units=EXCLUDED.reserved_units,consumed_units=0`);
  return true;
}

async function lockedCreditJob(job: Job, tx: Pick<typeof db, "execute">) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${job.user_id}`},0))`);
  const records = await tx.execute(sql`
    SELECT u.reserved_units,u.consumed_units FROM hirelix_private_jobs j
    LEFT JOIN hirelix_agent_credit_usage u ON u.job_id=j.id
    WHERE j.id=${job.id}::uuid AND j.user_id=${job.user_id}::uuid AND j.status='running'
      AND j.lease_token=${job.lease_token}::uuid AND j.lease_until>now() FOR UPDATE OF j`);
  if (!records.length) throw new Error("AI credit execution lost its lease");
  if (records[0].reserved_units === null) return null; // Included indexing/import.
  return { reserved: Number(records[0].reserved_units), consumed: Number(records[0].consumed_units) };
}

export async function reserveAgentCall(job: Job, inputUnits: number, maxOutputTokens: number, outputUnitsPerToken: number) {
  if (!Number.isSafeInteger(inputUnits) || inputUnits < 0 || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0 || !Number.isFinite(outputUnitsPerToken) || outputUnitsPerToken < 0)
    throw new Error("Invalid AI credit reservation");
  return db.transaction(async (tx) => {
    const ledger = await lockedCreditJob(job, tx);
    if (!ledger) return maxOutputTokens;
    const access = await getAgentAccess(job.user_id, tx);
    if (access.state === "expired") throw new AgentCreditError();
    // The enqueue period owns this reservation. Do not spend a new month's
    // allowance from an old queued job; the user can retry it in the new period.
    const [inPeriod] = await tx.execute(sql`SELECT charged_at>=${access.periodStart}::timestamptz AND charged_at<${access.periodEnd}::timestamptz AS valid FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
    if (!inPeriod?.valid) throw new AgentCreditError();
    const capacity = Math.round(access.remaining*CREDIT_UNITS) + ledger.reserved - ledger.consumed;
    if (capacity < inputUnits) throw new AgentCreditError();
    const output = outputUnitsPerToken ? Math.min(maxOutputTokens, Math.floor((capacity-inputUnits)/outputUnitsPerToken)) : maxOutputTokens;
    if (output < Math.min(maxOutputTokens, 512)) throw new AgentCreditError();
    await tx.execute(sql`UPDATE hirelix_agent_credit_usage SET reserved_units=${ledger.consumed + inputUnits + Math.ceil(output*outputUnitsPerToken)} WHERE job_id=${job.id}::uuid`);
    return output;
  });
}

// Only a validated response consumes credits. An invalid format is a product
// retry; its provider usage stays in the diagnostic log, not the customer bill.
export async function consumeAgentCredits(job: Job, units: number, costUsd: number, snapshot: Record<string, unknown>) {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error("Invalid credit consumption");
  await db.transaction(async (tx) => {
    const ledger = await lockedCreditJob(job, tx);
    if (!ledger) return;
    if (ledger.consumed + units > ledger.reserved) throw new AgentCreditError();
    await tx.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=consumed_units+${units},reserved_units=consumed_units+${units},cost_nano_usd=cost_nano_usd+${Math.round(costUsd*1e9)},pricing_snapshot=pricing_snapshot || ${JSON.stringify([snapshot])}::jsonb WHERE job_id=${job.id}::uuid`);
  });
}
