import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AGENT_PLAN, isAgentPlan, type AgentAccess } from "./agent-plan";

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
  const limit = paid || legacy ? AGENT_PLAN.monthlyTasks : AGENT_PLAN.trialTasks;
  const counts = start ? await runner.execute(sql`SELECT count(*)::int AS used FROM hirelix_agent_task_usage u JOIN hirelix_private_jobs j ON j.id=u.job_id WHERE u.user_id=${userId}::uuid AND u.charged_at>=${start.toISOString()}::timestamptz AND u.charged_at<${end!.toISOString()}::timestamptz AND j.status NOT IN ('error','cancelled')`) : [{ used: 0 }];
  const used = Number(counts[0]?.used || 0);
  return { state, used, limit, remaining: state === "expired" ? 0 : Math.max(0, limit-used), periodStart: start?.toISOString() || null, periodEnd: end?.toISOString() || null };
}

export async function reserveAgentTask(userId: string, jobId: string, runner: Pick<typeof db, "execute">) {
  // Serialize allowance checks across all concurrent submissions for this user.
  await runner.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${userId}`}, 0))`);
  await runner.execute(sql`INSERT INTO hirelix_agent_access(user_id) VALUES(${userId}::uuid) ON CONFLICT DO NOTHING`);
  const access = await getAgentAccess(userId, runner);
  if (access.state === "legacy") return; // Preserve existing paid access during migration.
  if (!access.remaining) return false;
  await runner.execute(sql`INSERT INTO hirelix_agent_task_usage(job_id,user_id) VALUES(${jobId}::uuid,${userId}::uuid) ON CONFLICT(job_id) DO UPDATE SET charged_at=now()`);
  return true;
}
