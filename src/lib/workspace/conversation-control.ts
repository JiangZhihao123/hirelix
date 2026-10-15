import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { json, owned, rows, WorkspaceError, type Runner } from "./database";
import { reserveAgentCredits } from "@/lib/agent-access";
import { cancelJobInTransaction } from "./jobs";
import type { Conversation, Job } from "./types";

export async function nextConversationPriority(
  userId: string,
  conversationId: string,
  tx: Runner,
) {
  const [row] = await rows<{ priority: number }>(
    sql`SELECT coalesce(max((payload->>'priority')::int),0)+1 AS priority FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${conversationId} AND status='queued'`,
    tx,
  );
  return row.priority;
}

// Caller holds the conversation lock. Revoke the old lease before accepting a correction.
export async function interruptConversation(
  userId: string,
  conversationId: string,
  tx: Runner,
  paused: boolean,
) {
  const jobs = await rows<Job>(
    sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${conversationId} AND (status='running' OR (status='queued' AND payload->>'resuming'='true') OR (status IN ('cancelled','error') AND result->>'paused'='true')) ORDER BY created_at DESC,id DESC`,
    tx,
  );
  let previous: Job | undefined;
  for (const job of jobs) {
    const cancelled = ["running", "queued"].includes(job.status)
      ? await cancelJobInTransaction(userId, job.id, tx)
      : job;
    previous ||= cancelled;
    await tx.execute(
      sql`UPDATE hirelix_private_jobs SET result=coalesce(result,'{}'::jsonb)||${json({ paused })} WHERE id=${job.id}::uuid AND user_id=${userId}::uuid`,
    );
  }
  await tx.execute(
    sql`UPDATE hirelix_private_conversations SET stopped=${paused},updated_at=clock_timestamp() WHERE id=${conversationId}::uuid AND user_id=${userId}::uuid`,
  );
  return previous;
}

const controlInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("remove"), job_id: z.uuid() }),
  z.object({
    action: z.literal("edit"),
    job_id: z.uuid(),
    message: z.string().trim().min(1).max(50000),
  }),
  z.object({ action: z.literal("immediate"), job_id: z.uuid() }),
]);
export async function controlConversation(
  userId: string,
  id: string,
  value: unknown,
) {
  const input = controlInput.parse(value);
  return db.transaction(async (tx) => {
    const conversation = await owned<Conversation>(
      userId,
      "conversation",
      id,
      tx,
      true,
    );
    if (input.action === "stop") {
      await interruptConversation(userId, id, tx, true);
      // Delegated work in this conversation must stop too; queued follow-ups stay saved.
      const work = await rows<Job>(
        sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='deliverable' AND payload->>'conversation_id'=${id} AND status IN ('running','queued')`,
        tx,
      );
      for (const job of work) await cancelJobInTransaction(userId, job.id, tx);
      return { ok: true };
    }
    if (input.action === "resume") {
      if (!conversation.stopped) return { ok: true };
      const [paused] = await rows<Job>(
        sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${id} AND (status IN ('cancelled','error') AND result->>'paused'='true') ORDER BY updated_at DESC,id DESC LIMIT 1 FOR UPDATE`,
        tx,
      );
      if (paused) {
        if (!(await reserveAgentCredits(userId, paused.id, tx)))
          throw new WorkspaceError(
            "Your AI credit allowance has ended. Open Settings to continue.",
            402,
          );
        const result = {
          ...paused.result,
          paused: false,
          previous_parts: paused.result?.parts,
          receipt_message_id:
            paused.result?.receipt_message_id || paused.result?.message_id,
        };
        for (const key of [
          "parts",
          "live_reply",
          "message_id",
          "stream_epoch",
          "stream_sequence",
          "cancelled_lease_token",
          "cancelled_sequence",
          "phase",
          "waiting_for_input",
        ])
          delete (result as Record<string, unknown>)[key];
        await tx.execute(
          sql`UPDATE hirelix_private_jobs SET status='queued',payload=payload || ${json({ priority: await nextConversationPriority(userId, id, tx), resuming: true })},result=${json(result)},error=NULL,progress='Queued to continue',attempts=0,updated_at=clock_timestamp() WHERE id=${paused.id}::uuid`,
        );
      }
      await tx.execute(
        sql`UPDATE hirelix_private_conversations SET stopped=false,updated_at=clock_timestamp() WHERE id=${id}::uuid AND user_id=${userId}::uuid`,
      );
      return { ok: true };
    }
    const job = await owned<Job>(userId, "job", input.job_id, tx, true);
    if (job.kind !== "chat" || job.payload.conversation_id !== id)
      throw new WorkspaceError("This queued message was not found", 404);
    if (job.status !== "queued" || job.payload.resuming === true)
      throw new WorkspaceError(
        "This message has already started. Refresh the conversation.",
        409,
      );
    if (input.action === "remove") {
      await tx.execute(
        sql`UPDATE hirelix_private_jobs SET status='cancelled',result=coalesce(result,'{}'::jsonb)||'{"removed":true}'::jsonb,progress='Removed from queue',updated_at=clock_timestamp() WHERE id=${job.id}::uuid`,
      );
      await tx.execute(
        sql`UPDATE hirelix_agent_messages SET metadata=metadata||'{"delivery":"removed"}'::jsonb WHERE id=${job.payload.message_id as string}::uuid AND user_id=${userId}::uuid`,
      );
    } else if (input.action === "edit") {
      const request = {
        ...(job.payload.request as object),
        message: input.message,
      };
      await tx.execute(
        sql`UPDATE hirelix_private_jobs SET payload=payload||${json({ request })},updated_at=clock_timestamp() WHERE id=${job.id}::uuid`,
      );
      await tx.execute(
        sql`UPDATE hirelix_agent_messages SET content=${input.message} WHERE id=${job.payload.message_id as string}::uuid AND user_id=${userId}::uuid`,
      );
    } else {
      const previous = await interruptConversation(userId, id, tx, false);
      await tx.execute(
        sql`UPDATE hirelix_private_jobs SET payload=payload||${json({ priority: await nextConversationPriority(userId, id, tx), continuation_job_id: previous?.id ?? null })},result=coalesce(result,'{}'::jsonb)||${json({ tool_receipts: previous?.result?.tool_receipts || {} })},updated_at=clock_timestamp() WHERE id=${job.id}::uuid`,
      );
    }
    return { ok: true };
  });
}
