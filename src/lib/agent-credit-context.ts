import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentTraceContext } from "./workspace/agent-telemetry";
import type { Job } from "./workspace/types";

// One context per worker execution, including nested AI calls. A reclaimed
// execution receives a new lease; failed/interrupted attempts never bill twice.
export const agentCreditContext = new AsyncLocalStorage<Job & { signal?: AbortSignal; trace?: Partial<AgentTraceContext> }>();

export function executionTrace(job: Job, parent?: Partial<AgentTraceContext>): AgentTraceContext {
  parent ??= job.payload.parent_trace as Partial<AgentTraceContext> | undefined;
  return {execution_id: randomUUID(), job_attempt: job.attempts,
    ...(parent ? {parent_execution_id: parent.execution_id, parent_model_call_id: parent.model_call_id,
      parent_step: parent.step, tool_call_id: parent.tool_call_id,
      parent_job_id: String(job.payload.parent_chat_job_id ?? parent.parent_job_id ?? "")} : {}),
  };
}
