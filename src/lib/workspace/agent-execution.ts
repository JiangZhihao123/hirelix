import { workErrorDiagnostics } from "./error-diagnostics";
import { getLogger } from "@/lib/logger";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { json, owned, rows, WorkspaceError, type Runner } from "./database";
import {
  LostLease,
  claimJob,
  finishJob,
  heartbeat,
  failJob,
  type JobHandler,
} from "./jobs";
import { agentCreditContext, executionTrace } from "@/lib/agent-credit-context";
import type { Job, Message } from "./types";
import type { AssistantMeta } from "./conversations";

export async function activeAgentJob(
  job: Job,
  runner: Runner = db,
  lock = false,
) {
  const current = await owned<Job>(job.user_id, "job", job.id, runner, lock);
  if (
    current.status !== "running" ||
    current.lease_token !== job.lease_token ||
    !current.lease_until ||
    new Date(current.lease_until).getTime() <= Date.now()
  )
    throw new LostLease();
  return current;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !["authorization_quote", "source_authorization_quote"].includes(
              key,
            ),
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function agentToolKey(name: string, input: unknown) {
  return createHash("sha256")
    .update(JSON.stringify([name, canonical(input)]))
    .digest("hex");
}
export type ToolCommit = {
  output: unknown;
  metadata?: AssistantMeta & { import_job_ids?: string[] };
};
export type ToolReceipt = { name: string; output: unknown };

// Each successful domain transaction and its receipt commit together. A replay
// of the same tool arguments returns that receipt, even after a worker restart.
export async function commitAgentTool(
  job: Job,
  name: string,
  input: unknown,
  apply: (tx: Runner, key: string) => Promise<ToolCommit>,
) {
  const key = agentToolKey(name, input);
  return db.transaction(async (tx) => {
    const current = await activeAgentJob(job, tx, true);
    const prior = (current.result?.tool_receipts ?? {}) as Record<
      string,
      ToolReceipt
    >;
    if (prior[key]) return prior[key].output;
    if (Object.keys(prior).length >= 50)
      throw new WorkspaceError(
        "This request reached its tool limit. Completed work is saved; continue with a smaller request.",
      );
    const result = await apply(tx, key);
    let receiptMessageId = current.result?.receipt_message_id as
      string | undefined;
    if (result.metadata) {
      // Messages have their own user/conversation ownership boundary.
      const [message] = receiptMessageId
        ? await rows<Message>(
            sql`SELECT * FROM hirelix_agent_messages WHERE id=${receiptMessageId}::uuid AND user_id=${job.user_id}::uuid AND conversation_id=${job.payload.conversation_id as string}::uuid FOR UPDATE`,
            tx,
          )
        : [];
      const metadata: Record<string, unknown> = {
        ...message?.metadata,
        committed_tools: true,
        reply_request_key: job.request_key,
      };
      for (const [field, value] of Object.entries(result.metadata))
        metadata[field] = Array.isArray(value)
          ? [
              ...(Array.isArray(metadata[field])
                ? (metadata[field] as unknown[])
                : []),
              ...value,
            ]
          : value;
      if (message)
        await tx.execute(
          sql`UPDATE hirelix_agent_messages SET metadata=${json(metadata)} WHERE id=${message.id}::uuid AND user_id=${job.user_id}::uuid`,
        );
      else {
        const [saved] = await rows<{ id: string }>(
          sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content,metadata) VALUES(${job.user_id}::uuid,${job.payload.conversation_id as string}::uuid,'assistant','',${json(metadata)}) RETURNING id`,
          tx,
        );
        receiptMessageId = saved.id;
      }
    }
    await tx.execute(
      sql`UPDATE hirelix_private_jobs SET result=result || ${json({ tool_receipts: { ...prior, [key]: { name, output: result.output } }, ...(receiptMessageId ? { receipt_message_id: receiptMessageId } : {}) })},updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid`,
    );
    return result.output;
  });
}

// Work tools reuse the existing job handlers. Claiming the exact child lets a
// single-worker installation finish document/import work without deadlocking.
export async function completeAgentWork(
  parent: Job,
  id: string,
  handler: JobHandler,
  signal: AbortSignal,
) {
  const original = await owned<Job>(parent.user_id, "job", id);
  if (original.payload.parent_chat_job_id !== parent.id)
    throw new WorkspaceError("This work belongs to another request.", 403);
  const child = await claimJob([original.kind], { id, userId: parent.user_id });
  if (child) {
    const timer = setInterval(
      () => void heartbeat(child).catch(() => {}),
      20000,
    );
    let phase = "prepare";
    try {
      const prepared = await agentCreditContext.run({ ...child, signal, trace: executionTrace(child, agentCreditContext.getStore()?.trace) }, () =>
        handler(child, async (message) => {
          signal.throwIfAborted();
          await activeAgentJob(parent);
          await heartbeat(child, message);
          await heartbeat(parent, message);
        }),
      );
      signal.throwIfAborted();
      await activeAgentJob(parent);
      phase = "persist";
      await finishJob(child, prepared);
    } catch (error) {
      if (error instanceof LostLease || signal.aborted) throw error;
      getLogger({ component: "workspace_agent_work" }).error(
        {
          job_id: child.id,
          kind: child.kind,
          phase,
          ...workErrorDiagnostics(error),
          error_type: error instanceof Error ? error.name : "Unknown",
        },
        "Agent work tool failed",
      );
      await failJob(
        child,
        error instanceof WorkspaceError
          ? error.message
          : "This work could not finish. Review the input and retry.",
      );
      throw error instanceof WorkspaceError
        ? error
        : new WorkspaceError(
            "This work did not finish. Its original input is saved and can be retried using resume_work.",
            502,
          );
    } finally {
      clearInterval(timer);
    }
  }
  for (let attempt = 0; attempt < 240; attempt++) {
    signal.throwIfAborted();
    await activeAgentJob(parent);
    const work = await owned<Job>(parent.user_id, "job", id);
    if (work.status === "done")
      return { id: work.id, status: work.status, result: work.result };
    if (work.status === "error" || work.status === "cancelled")
      return { id: work.id, status: work.status, error: work.error };
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 1000);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  return {
    id,
    status: "running",
    message:
      "Work is still running. Read its status again before claiming completion.",
  };
}
