import { sql } from "drizzle-orm";
import { z } from "zod";
import { owned, rows } from "./database";
import { MAX_CONVERSATION_FILES } from "./attachments";
import { viewedSourceInput } from "./source-context";
import { conversationExcerpt } from "./conversation-excerpt";
import { hydrateEmailReceipts } from "./conversation-email";
import type { ConversationEmail } from "./email-contract";
import type { ConversationQuestion } from "./conversation-questions";
import type { Conversation, Message, Job, Deliverable } from "./types";
import type { Reminder } from "./reminders";
import type { MemoryReceipt } from "./memories";
import type { AssistantWorkReceipt, AssistantScheduleReceipt } from "./assistant-work";
export { acceptAction } from "./conversation-actions";
export { assistantReply } from "./agent-runtime";

export const conversationInput = z.object({
  message: z.string().trim().max(50000),
  email_confirmation_message_id: z.uuid().nullable().default(null),
  question_message_id: z.uuid().nullable().default(null),
  file_ids: z.array(z.uuid()).max(MAX_CONVERSATION_FILES).default([]),
  locale: z.enum(["en", "zh"]).default("en"),
  timezone: z.string().max(100).refine(zone => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }).default("UTC"),
  request_key: z.string().min(1).max(200),
  conversation_id: z.uuid().nullable().default(null),
  role_id: z.uuid().nullable().default(null),
  person_id: z.uuid().nullable().default(null),
  document_id: z.uuid().nullable().default(null),
  work_document_id: z.uuid().nullable().default(null),
  viewed_source: viewedSourceInput.nullable().default(null),
});
export type AssistantAction = {
  id: string;
  kind:
    | "create_candidate"
    | "update_candidate"
    | "create_role"
    | "update_role_brief"
    | "update_role_details"
    | "add_record"
    | "update_record"
    | "update_sharing_permission"
    | "update_relationship"
    | "record_submission"
    | "submission"
    | "search_update";
  title: string;
  status: "pending" | "saved";
  role_id: string | null;
  person_id: string | null;
  fields: Record<string, unknown>;
  direct_save_quote?: string | null;
  href?: string;
};
export type AssistantMeta = {
  document_edits?: Array<{id:string;title:string;version:number;href:string}>;
  exports?: { document_id: string; formats: Array<"pdf" | "docx"> };
  gmail?: {connected:boolean;email:string|null};
  email?: ConversationEmail;
  email_result?: ConversationEmail & {preview_message_id:string};
  question?: ConversationQuestion;
  reminders?: Reminder[];
  work?: AssistantWorkReceipt[];
  schedules?: AssistantScheduleReceipt[];
  actions?: AssistantAction[];
  sources?: Array<{ title: string; href: string }>;
  coverage?: Record<string, unknown>;
  memories?: MemoryReceipt[];
  revision?: { document_id: string; job_id: string };
};
export async function listConversations(userId: string) {
  return rows<Conversation>(
    sql`SELECT c.*,EXISTS(SELECT 1 FROM hirelix_private_notifications n WHERE n.user_id=c.user_id AND n.read_at IS NULL AND n.href='/app?conversation='||c.id::text) AS unread FROM hirelix_private_conversations c WHERE c.user_id=${userId}::uuid ORDER BY c.updated_at DESC,c.id LIMIT 100`,
  );
}
export type ConversationSearchResult = Conversation & {
  excerpt: string | null;
};
export async function searchConversations(userId: string, value: string) {
  const query = value.trim().slice(0, 100);
  if (!query) return [];
  const matches = await rows<Conversation & {
    match_content: string | null;
  }>(sql`
    SELECT c.*, hit.content AS match_content
    FROM hirelix_private_conversations c
    LEFT JOIN LATERAL (
      SELECT m.content
      FROM hirelix_agent_messages m
      WHERE m.user_id=${userId}::uuid AND m.conversation_id=c.id
        AND position(lower(${query}) in lower(m.content)) > 0
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) hit ON true
    WHERE c.user_id=${userId}::uuid
      AND (position(lower(${query}) in lower(c.title)) > 0 OR hit.content IS NOT NULL)
    ORDER BY CASE WHEN position(lower(${query}) in lower(c.title)) > 0 THEN 0 ELSE 1 END,
      c.updated_at DESC, c.id
    LIMIT 30
  `);
  return matches.map(({ match_content, ...conversation }): ConversationSearchResult => {
    const excerpt = match_content ? conversationExcerpt(match_content, query) : null;
    return { ...conversation, excerpt };
  });
}
export async function conversationDetails(userId: string, id: string) {
  const conversation = await owned<Conversation>(userId, "conversation", id);
  const [messages, jobs, work] = await Promise.all([
    rows<Message>(
      sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${id}::uuid ORDER BY created_at,id`,
    ),
    rows<Job>(
      sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${id} ORDER BY created_at DESC LIMIT 1`,
    ),
    rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='deliverable' AND payload->>'conversation_id'=${id} ORDER BY created_at DESC,id DESC LIMIT 100`),
  ]);
  await hydrateEmailReceipts(userId, messages);
  work.reverse();
  const latestWork = [...work].reverse().find(item => item.status === "done" && item.result?.deliverable_id);
  const selected = [...messages].reverse().find(message => message.role === "user" && typeof message.metadata.work_document_id === "string");
  const documentId = selected && (!latestWork || new Date(selected.created_at) > new Date(latestWork.created_at)) ? selected.metadata.work_document_id : latestWork?.result?.deliverable_id || messages.find(message => message.role === "user" && typeof message.metadata.document_id === "string")?.metadata.document_id;
  const document = documentId ? await owned<Deliverable>(userId, "deliverable", z.uuid().parse(documentId)) : null;
  return { conversation, messages, document, work, job: jobs[0] ?? null };
}
export async function renameConversation(
  userId: string,
  id: string,
  value: unknown,
) {
  const { title } = z
    .object({ title: z.string().trim().min(1).max(100) })
    .parse(value);
  await owned<Conversation>(userId, "conversation", id);
  const [conversation] = await rows<Conversation>(
    sql`UPDATE hirelix_private_conversations SET title=${title} WHERE user_id=${userId}::uuid AND id=${id}::uuid RETURNING *`,
  );
  return { conversation };
}
export { sendMessage } from "./conversation-send";
