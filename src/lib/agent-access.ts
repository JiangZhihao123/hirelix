import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AGENT_PLAN, isAgentPlan, type AgentAccess, CREDIT_UNITS } from "./agent-plan";
import { subscriptionCreditPeriod } from "./agent-credit-period";
import type { Job } from "./workspace/types";

export class AgentCreditError extends Error {
  constructor() {
    super("Not enough AI credits for this work. Your saved work is still available. Open Settings → Billing to check your allowance.");
    this.name = "AgentCreditError";
  }
}

// Paid allowances come only from completed transactions; subscription updates can precede payment.
export async function getAgentAccess(userId: string, runner: Pick<typeof db, "execute"> = db): Promise<AgentAccess> {
  const result = await runner.execute(sql`
    SELECT a.trial_started_at, s.subscription_plan, s.subscription_status,
      s.subscription_renews_at, s.subscription_started_at, s.paddle_subscription_id, now() AS current_time,
      date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS month_start,
      (SELECT e.payload->'data'->'scheduled_change'->>'action' FROM hirelix_billing_events e
       WHERE e.event_type LIKE 'subscription.%' AND e.payload->'data'->>'id'=s.paddle_subscription_id
       ORDER BY e.payload->>'occurred_at' DESC LIMIT 1) AS scheduled_action,
      (SELECT coalesce(jsonb_agg(e.payload->'data'->'billing_period' ORDER BY e.payload->'data'->'billing_period'->>'starts_at' DESC), '[]'::jsonb)
       FROM hirelix_billing_events e
       WHERE e.event_type='transaction.completed'
         AND e.payload->'data'->>'subscription_id'=s.paddle_subscription_id
         AND e.payload->'data'->>'status'='completed'
         AND coalesce(e.payload->'data'->'custom_data'->>'purchase_type','') <> 'test_payment'
         AND e.payload->'data'->>'origin' IN ('web','api','subscription_recurring')) AS payments
    FROM (SELECT ${userId}::uuid AS id) u
    LEFT JOIN hirelix_agent_access a ON a.user_id=u.id
    LEFT JOIN hirelix_user_settings s ON s.user_id=u.id`);
  const item = result[0] as unknown as { trial_started_at: string | null; subscription_plan: string | null; subscription_status: string | null; subscription_renews_at: string | null; subscription_started_at: string | null; paddle_subscription_id: string | null; current_time: string; month_start: string; scheduled_action: string | null; payments: Array<{ starts_at?: string; ends_at?: string } | null> };
  const now = new Date(item.current_time);
  const active = ["active", "trialing"].includes(item.subscription_status || "") && (!item.subscription_renews_at || new Date(item.subscription_renews_at) > now);
  const agentPlan = isAgentPlan(item.subscription_plan || "");
  const legacy = active && !!item.subscription_plan && item.subscription_plan !== "free" && !agentPlan;
  // The subscription id establishes ownership even if a transaction arrived before
  // subscription.created and could not yet be associated with a user id.
  const paidPeriod = (agentPlan ? item.payments : []).map(period => {
    const window = subscriptionCreditPeriod(new Date(period?.starts_at || ""), new Date(period?.ends_at || ""), now, item.subscription_plan === "agent_annual", new Date(item.subscription_started_at || ""));
    return window ? { ...window, paidThrough: new Date(period!.ends_at!).toISOString() } : null;
  }).find(Boolean);
  const paid = agentPlan && !!paidPeriod && item.subscription_status === "active";
  let start = paid ? paidPeriod!.start : legacy ? new Date(item.month_start) : item.trial_started_at ? new Date(item.trial_started_at) : null;
  let end = paid ? paidPeriod!.end : start ? new Date(start) : null;
  if (end && !paid) { if (legacy) end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + AGENT_PLAN.trialDays); }
  // Once a subscription exists, an unpaid/expired period must not revive a trial.
  const state = legacy ? "legacy" : paid ? "paid" : agentPlan ? "expired" : !start ? "trial_ready" : end! <= now ? "expired" : "trial";
  if (agentPlan && !paid) { start = null; end = null; }
  const limit = agentPlan || legacy ? AGENT_PLAN.monthlyCredits : AGENT_PLAN.trialCredits;
  const counts = start ? await runner.execute(sql`
    SELECT coalesce(sum(u.consumed_units) FILTER (WHERE j.status='done'),0)::bigint AS used,
      coalesce(sum(u.reserved_units) FILTER (WHERE j.status IN ('queued','running')),0)::bigint AS reserved
    FROM hirelix_agent_credit_usage u JOIN hirelix_private_jobs j ON j.id=u.job_id
    WHERE u.user_id=${userId}::uuid AND u.charged_at>=${start.toISOString()}::timestamptz
      AND u.charged_at<${end!.toISOString()}::timestamptz`) : [{ used: 0, reserved: 0 }];
  const used = Number(counts[0]?.used || 0) / CREDIT_UNITS;
  const reserved = Number(counts[0]?.reserved || 0) / CREDIT_UNITS;
  const remaining = Math.max(0, Math.round((limit-used-reserved)*CREDIT_UNITS)) / CREDIT_UNITS;
  return { state, used, reserved, limit, remaining: state === "expired" ? 0 : remaining, periodStart: start?.toISOString() || null, periodEnd: end?.toISOString() || null, paidThrough: paid ? paidPeriod!.paidThrough : null, autoRenews: paid && !["cancel", "pause"].includes(item.scheduled_action || "") };
}

export async function reserveAgentCredits(userId: string, jobId: string, runner: Pick<typeof db, "execute">) {
  // Serialize allowance checks across all concurrent submissions for this user.
  await runner.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${userId}`}, 0))`);
  await runner.execute(sql`INSERT INTO hirelix_agent_access(user_id) VALUES(${userId}::uuid) ON CONFLICT DO NOTHING`);
  const access = await getAgentAccess(userId, runner);
  if (!access.remaining) return false;
  await runner.execute(sql`INSERT INTO hirelix_agent_credit_usage(job_id,user_id,reserved_units) VALUES(${jobId}::uuid,${userId}::uuid,${Math.min(CREDIT_UNITS, Math.round(access.remaining*CREDIT_UNITS))}) ON CONFLICT(job_id) DO UPDATE SET charged_at=now(),reserved_units=EXCLUDED.reserved_units,consumed_units=0,call_reservations='{}'::jsonb`);
  return true;
}

async function lockedCreditJob(job: Job, tx: Pick<typeof db, "execute">) {
  // Match claim/stop lock order: job before account billing lock.
  const current = await tx.execute(sql`SELECT id FROM hirelix_private_jobs
    WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='running'
      AND lease_token=${job.lease_token}::uuid AND lease_until>now() FOR UPDATE`);
  if (!current.length) throw new Error("AI credit execution lost its lease");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${job.user_id}`},0))`);
  const [record] = await tx.execute(sql`SELECT reserved_units,consumed_units,call_reservations
    FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
  if (!record) return null; // Included indexing/import.
  return { reserved: Number(record.reserved_units), consumed: Number(record.consumed_units), calls: record.call_reservations as Record<string, number> };
}

export type AgentCallReservation = { id: string; maxOutputTokens: number };

export async function reserveAgentCall(job: Job, inputUnits: number, maxOutputTokens: number, outputUnitsPerToken: number) {
  if (!Number.isSafeInteger(inputUnits) || inputUnits < 0 || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0 || !Number.isFinite(outputUnitsPerToken) || outputUnitsPerToken < 0)
    throw new Error("Invalid AI credit reservation");
  const id = randomUUID();
  return db.transaction(async (tx) => {
    const ledger = await lockedCreditJob(job, tx);
    if (!ledger) return {id, maxOutputTokens};
    const access = await getAgentAccess(job.user_id, tx);
    if (access.state === "expired") throw new AgentCreditError();
    // The enqueue period owns this reservation. Do not spend a new month's
    // allowance from an old queued job; the user can retry it in the new period.
    const [inPeriod] = await tx.execute(sql`SELECT charged_at>=${access.periodStart}::timestamptz AND charged_at<${access.periodEnd}::timestamptz AS valid FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
    if (!inPeriod?.valid) throw new AgentCreditError();
    const held = Object.values(ledger.calls).reduce((sum, units) => sum + units, 0);
    const capacity = Math.round(access.remaining*CREDIT_UNITS) + ledger.reserved - ledger.consumed - held;
    if (capacity < inputUnits) throw new AgentCreditError();
    const output = outputUnitsPerToken ? Math.min(maxOutputTokens, Math.floor((capacity-inputUnits)/outputUnitsPerToken)) : maxOutputTokens;
    if (output < Math.min(maxOutputTokens, 512)) throw new AgentCreditError();
    const units = inputUnits + Math.ceil(output*outputUnitsPerToken);
    await tx.execute(sql`UPDATE hirelix_agent_credit_usage SET reserved_units=${ledger.consumed + held + units},
      call_reservations=call_reservations || ${JSON.stringify({[id]: units})}::jsonb WHERE job_id=${job.id}::uuid`);
    return {id, maxOutputTokens: output};
  });
}

// Release only this call, including failures and empty results. Stale executions
// cannot release a successor's holds. Releasing an already settled call is harmless.
export async function releaseAgentCall(job: Job, call: AgentCallReservation) {
  await db.transaction(async tx => {
    const current = await tx.execute(sql`SELECT id FROM hirelix_private_jobs WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid
      AND status='running' AND lease_token=${job.lease_token}::uuid AND lease_until>now() FOR UPDATE`);
    if (!current.length) return;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${job.user_id}`},0))`);
    await tx.execute(sql`UPDATE hirelix_agent_credit_usage SET
      reserved_units=reserved_units-coalesce((call_reservations->>${call.id})::bigint,0),
      call_reservations=call_reservations-${call.id} WHERE job_id=${job.id}::uuid`);
  });
}

// Only a validated response consumes credits. Settlement cannot borrow another
// in-flight call's hold or settle the same call twice.
export async function consumeAgentCredits(job: Job, call: AgentCallReservation, units: number, costUsd: number, snapshot: Record<string, unknown>) {
  if (!Number.isSafeInteger(units) || units < 0 || !Number.isFinite(costUsd) || costUsd < 0) throw new Error("Invalid credit consumption");
  await db.transaction(async (tx) => {
    const ledger = await lockedCreditJob(job, tx);
    if (!ledger) return;
    const held = ledger.calls[call.id];
    if (held === undefined) throw new Error("AI credit call is not reserved or already settled");
    if (units > held) throw new AgentCreditError();
    await tx.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=consumed_units+${units},
      reserved_units=reserved_units-${held}+${units},call_reservations=call_reservations-${call.id},
      cost_nano_usd=cost_nano_usd+${Math.round(costUsd*1e9)},
      pricing_snapshot=pricing_snapshot || ${JSON.stringify([{...snapshot, reservation_id: call.id}])}::jsonb WHERE job_id=${job.id}::uuid`);
  });
}
