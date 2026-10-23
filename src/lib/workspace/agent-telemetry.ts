import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { agentCreditContext } from "@/lib/agent-credit-context";
import { getLogger } from "@/lib/logger";
import { json, rows } from "./database";
import { LostLease } from "./jobs";
import type { Job } from "./types";

export type AgentTraceContext = {
  execution_id: string;
  job_attempt: number;
  step?: number;
  model_call_id?: string;
  tool_call_id?: string;
  parent_job_id?: string;
};

export function executionTrace(job: Job): AgentTraceContext {
  return {execution_id: randomUUID(), job_attempt: job.attempts};
}

// Append under the active lease. Never replace a preceding execution's evidence.
// Events contain identifiers, timing and structural outcomes only.
export async function appendAgentEvidence(job: Job, field: "agent_events" | "agent_steps", evidence: Record<string, unknown>) {
  const updated = await rows(sql`UPDATE hirelix_private_jobs
    SET result=jsonb_set(coalesce(result,'{}'::jsonb),ARRAY[${field}],coalesce(result->${field},'[]'::jsonb)||${json([evidence])}),updated_at=now()
    WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='running'
      AND lease_token=${job.lease_token}::uuid AND lease_until>now() RETURNING id`);
  if (!updated.length) throw new LostLease();
}

export async function observeAgentTool<T>(job: Job, tool: string, toolCallId: string, queueMs: number, execute: () => Promise<T>) {
  const parent = agentCreditContext.getStore();
  const trace = {...parent?.trace, tool_call_id: toolCallId};
  const started = Date.now();
  const base = {...trace, tool, started_at: new Date(started).toISOString(), queue_ms: queueMs};
  await appendAgentEvidence(job, "agent_events", {...base, event: "tool_started"});
  let outcome: Record<string, unknown> = {status: "error"};
  try {
    const output = await agentCreditContext.run({...job, signal: parent?.signal, trace}, execute);
    const result = output as {ok?: boolean; error?: {code?: number}};
    outcome = {status: result?.ok === false ? "error" : "success", ...(typeof result?.error?.code === "number" ? {error_code: result.error.code} : {})};
    return output;
  } catch (error) {
    outcome = {status: error instanceof LostLease || parent?.signal?.aborted ? "interrupted" : "error", error_type: error instanceof Error ? error.name : "Unknown"};
    throw error;
  } finally {
    const event = {...base, event: "tool_finished", ...outcome, duration_ms: Date.now()-started};
    getLogger({component: "workspace_agent_tool"}).info({job_id: job.id, ...event}, "Agent tool execution finished");
    // A cancelled/lost lease cannot write further; its unmatched start remains
    // explicit evidence of interruption, and the process log records the end.
    await appendAgentEvidence(job, "agent_events", event).catch(error => {if (!(error instanceof LostLease)) throw error;});
  }
}
