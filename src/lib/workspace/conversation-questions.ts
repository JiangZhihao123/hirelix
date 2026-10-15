import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { json, owned, rows, WorkspaceError, type Runner } from "./database";
import { activeAgentJob } from "./agent-execution";
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
    await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=metadata || ${json({question: {...question,status:"cancelled"}})} WHERE id=${message.id}::uuid AND user_id=${userId}::uuid`);
    return {ok: true};
  });
}

// Called only when execution starts. A queued answer remains editable/removable.
export async function resolveQueuedQuestion(job: Job) {
  if(typeof job.payload.pending_question_id !== "string") return;
  await db.transaction(async tx => {
    await owned(job.user_id,"conversation",String(job.payload.conversation_id),tx,true);
    await activeAgentJob(job,tx,true);
    const [message] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${job.user_id}::uuid AND id=${String(job.payload.message_id)}::uuid FOR UPDATE`,tx);
    if(message.metadata.continuation) return;
    const continuation = await consumeQuestion(job.user_id,String(job.payload.conversation_id),String(job.payload.pending_question_id),message.content,message.id,tx);
    if(continuation) await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=metadata || ${json({continuation})} WHERE id=${message.id}::uuid AND user_id=${job.user_id}::uuid`);
  });
}
