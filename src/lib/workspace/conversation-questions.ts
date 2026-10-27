import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { json, owned, rows, WorkspaceError, type Runner } from "./database";
import { activeAgentJob } from "./agent-execution";
import { lockScheduledChat, scheduledExecutionContext } from "./schedule-agent";
import { quotedAuthorization } from "./assistant-work";
import type { Job, Message } from "./types";

export const clarificationSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).max(4),
  recommendation: z.object({
    option: z.number().int().min(0).max(3).describe("Zero-based index of the recommended option"),
    reason: z.string().trim().min(1).max(500),
  }).optional(),
});
export type ConversationQuestion = z.infer<typeof clarificationSchema> & {
  status: "waiting" | "answered" | "cancelled";
  request: string;
  scheduled_job_id?: string;
  answer?: string;
  answer_message_id?: string;
};

export async function consumeQuestion(userId: string, conversationId: string, expectedId: string | null, answer: string, answerId: string, tx: Runner) {
  const [pending] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversationId}::uuid AND role='assistant' AND metadata->'question'->>'status'='waiting' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, tx);
  if (expectedId && pending?.id !== expectedId) throw new WorkspaceError("This question has already been answered or cancelled. Reload the conversation.", 409);
  if (!pending) return null;
  if (!answer.trim()) throw new WorkspaceError("Answer the question before continuing.");
  const question = pending.metadata.question as ConversationQuestion;
  await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=metadata || ${json({question: {...question, status: "answered", answer, answer_message_id: answerId}})} WHERE id=${pending.id}::uuid AND user_id=${userId}::uuid`);
  return { question_message_id: pending.id, request: `${question.request}\n\nUser clarification: ${answer}` };
}

export async function cancelQuestion(userId: string, conversationId: string, messageId: string) {
  return db.transaction(async tx => {
    await owned(userId, "conversation", conversationId, tx, true);
    const [message] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversationId}::uuid AND id=${messageId}::uuid AND role='assistant' FOR UPDATE`, tx);
    const question = message?.metadata.question as ConversationQuestion | undefined;
    if (!question) throw new WorkspaceError("Question not found", 404);
    if (question.status === "cancelled") return {ok: true};
    if (question.status !== "waiting") throw new WorkspaceError("This question has already been answered.",409);
    if (question.scheduled_job_id) {
      const old = await owned<Job>(userId,"job",z.uuid().parse(question.scheduled_job_id),tx);
      if (old.kind !== "chat" || old.payload.conversation_id !== conversationId || old.result?.message_id !== message.id || typeof old.payload.schedule_id !== "string")
        throw new WorkspaceError("This scheduled question is no longer available.",409);
      await rows(sql`SELECT id FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND id=${old.payload.schedule_id}::uuid FOR UPDATE`,tx);
      await owned(userId,"job",old.id,tx,true);
      await tx.execute(sql`UPDATE hirelix_private_jobs SET result=coalesce(result,'{}'::jsonb)||'{"waiting_for_input":false}'::jsonb WHERE user_id=${userId}::uuid AND id=${old.id}::uuid`);
    }
    await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=metadata || ${json({question: {...question,status:"cancelled"}})} WHERE id=${message.id}::uuid AND user_id=${userId}::uuid`);
    return {ok: true};
  });
}

// Called only when execution starts. A queued answer remains editable/removable.
export async function resolveQueuedQuestion(job: Job) {
  if(typeof job.payload.pending_question_id !== "string") return;
  await db.transaction(async tx => {
    await owned(job.user_id,"conversation",String(job.payload.conversation_id),tx,true);
    const [pending] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${job.user_id}::uuid AND conversation_id=${String(job.payload.conversation_id)}::uuid AND role='assistant' AND metadata->'question'->>'status'='waiting' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,tx);
    if (pending?.id !== job.payload.pending_question_id) throw new WorkspaceError("This question has already been answered or cancelled. Reload the conversation.",409);
    const scheduledId = (pending.metadata.question as ConversationQuestion).scheduled_job_id;
    let scheduledContinuation: Record<string, unknown> | null = null;
    if (scheduledId) {
      const previous = await owned<Job>(job.user_id,"job",z.uuid().parse(scheduledId),tx);
      const report = scheduledExecutionContext(previous);
      if (!report || previous.kind !== "chat" || previous.payload.conversation_id !== job.payload.conversation_id || previous.status !== "done" ||
          previous.result?.waiting_for_input !== true || previous.result.message_id !== pending.id || previous.payload.message_id !== report.authorization_message_id)
        throw new WorkspaceError("This scheduled report is no longer waiting for this answer.",409);
      await lockScheduledChat(previous,tx);
      await owned(job.user_id,"job",previous.id,tx,true);
      const messages = await rows<{id:string;content:string}>(sql`SELECT id,content FROM hirelix_agent_messages WHERE user_id=${job.user_id}::uuid
        AND (id=${report.authorization_message_id}::uuid OR id=${report.source_authorization_message_id}::uuid) AND conversation_id=${String(job.payload.conversation_id)}::uuid AND role='user'
        AND metadata->>'delivery' IS DISTINCT FROM 'queued' AND metadata->>'delivery' IS DISTINCT FROM 'removed'`,tx);
      const origin=messages.find(message=>message.id===report.authorization_message_id);
      const source=messages.find(message=>message.id===report.source_authorization_message_id);
      if (!origin || !quotedAuthorization(origin.content,report.authorization_quote) ||
          (report.source_authorization_quote && (!source || !quotedAuthorization(source.content,report.source_authorization_quote))))
        throw new WorkspaceError("The original scheduled report authorization is unavailable.",409);
      scheduledContinuation = {schedule_id:previous.payload.schedule_id, schedule_version:previous.payload.schedule_version,
        record_digest:previous.payload.record_digest, scheduled_report:previous.payload.scheduled_report, scheduled_origin_job_id:previous.id};
    }
    await activeAgentJob(job,tx,true);
    const [message] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${job.user_id}::uuid AND id=${String(job.payload.message_id)}::uuid FOR UPDATE`,tx);
    if(message.metadata.continuation) return;
    const continuation = await consumeQuestion(job.user_id,String(job.payload.conversation_id),String(job.payload.pending_question_id),message.content,message.id,tx);
    if(continuation) {
      if (scheduledContinuation) {
        await tx.execute(sql`UPDATE hirelix_private_jobs SET payload=payload || ${json(scheduledContinuation)} WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid`);
        await tx.execute(sql`UPDATE hirelix_private_schedules SET last_job_id=${job.id}::uuid,updated_at=now() WHERE user_id=${job.user_id}::uuid AND id=${String(scheduledContinuation.schedule_id)}::uuid`);
        job.payload = {...job.payload, ...scheduledContinuation};
      }
      const saved = scheduledContinuation ? {question_message_id:continuation.question_message_id, scheduled_job_id:scheduledId} : continuation;
      await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=metadata || ${json({continuation:saved})} WHERE id=${message.id}::uuid AND user_id=${job.user_id}::uuid`);
    }
  });
}
