import { sql } from "drizzle-orm";
import { z } from "zod";
import { owned, rows, textArray, WorkspaceError } from "./database";
import { MAX_CONVERSATION_FILES } from "./attachments";
import { viewedSourceInput } from "./source-context";
import { conversationExcerpt } from "./conversation-excerpt";
import { hydrateEmailReceipts } from "./conversation-email";
import type { ConversationEmail } from "./email-contract";
import type { ConversationQuestion } from "./conversation-questions";
import type { Conversation, Message, Job, Deliverable, Role } from "./types";
import { recommendationFeedbackInput } from "./recommendation-feedback-contract";
import type { Reminder } from "./reminders";
import type { MemoryReceipt } from "./memories";
import type { AssistantWorkReceipt, AssistantScheduleReceipt } from "./assistant-work";
export { acceptAction } from "./conversation-actions";
export { assistantReply } from "./agent-runtime";

export const conversationInput = z.object({
  message: z.string().trim().max(50000),
  delivery: z.enum(["queue", "immediate"]).default("queue"),
  resume_after_mailbox_message_id: z.uuid().nullable().default(null),
  email_confirmation_message_id: z.uuid().nullable().default(null),
  question_message_id: z.uuid().nullable().default(null),
  file_ids: z.array(z.uuid()).max(MAX_CONVERSATION_FILES).default([]),
  role_ids: z.array(z.uuid()).max(20).default([]),
  candidate_ids: z.array(z.uuid()).max(20).default([]),
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
  document_reference?: {id: string; title: string; version: number; href: string};
  recommendation_feedback?: {
    person_name: string; response: "interview" | "hold" | "decline" | "comment";
    comment: string; submitted_name: string; href: string;
  };
  recommendation_links?: Array<{document_id: string; version: number; href: string; expires_at: string}>;
  document_edits?: Array<{id:string;title:string;version:number;href:string}>;
  exports?: { document_id: string; formats: Array<"pdf" | "docx"> };
  gmail?: {connected:boolean;email:string|null;provider?:"google"|"microsoft"};
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
    sql`SELECT c.*,
      EXISTS(SELECT 1 FROM hirelix_private_notifications n WHERE n.user_id=c.user_id AND n.read_at IS NULL AND n.href='/app?conversation='||c.id::text) AS unread,
      EXISTS(SELECT 1 FROM hirelix_private_jobs j WHERE j.user_id=c.user_id
        AND j.payload->>'conversation_id'=c.id::text AND j.kind IN ('chat','deliverable')
        AND j.status IN ('queued','running') AND NOT c.stopped) AS running
      FROM hirelix_private_conversations c WHERE c.user_id=${userId}::uuid
      ORDER BY c.updated_at DESC,c.id LIMIT 100`,
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
  // Preserve PostgreSQL's full timestamp precision for read acknowledgements.
  const [conversation] = await rows<Conversation & { notifications_through: string }>(sql`SELECT *,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS notifications_through FROM hirelix_private_conversations WHERE user_id=${userId}::uuid AND id=${id}::uuid`);
  if (!conversation) throw new WorkspaceError("This item was not found", 404);
  const [messages, jobs, work] = await Promise.all([
    rows<Message>(
      sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${id}::uuid ORDER BY created_at,id`,
    ),
    rows<Job>(
      sql`WITH conversation_jobs AS NOT MATERIALIZED (SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${id} AND result->>'removed' IS DISTINCT FROM 'true') SELECT * FROM conversation_jobs WHERE status IN ('queued','running') OR id=(SELECT id FROM conversation_jobs WHERE status NOT IN ('queued','running') ORDER BY updated_at DESC,id DESC LIMIT 1) ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,CASE WHEN status='queued' THEN coalesce((payload->>'priority')::int,0) END DESC,CASE WHEN status='queued' THEN created_at END ASC,updated_at DESC,id DESC`,
    ),
    rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='deliverable' AND payload->>'conversation_id'=${id} ORDER BY created_at DESC,id DESC LIMIT 100`),
  ]);
  await Promise.all([hydrateEmailReceipts(userId, messages), hydrateRecommendationFeedback(userId, messages)]);
  // Older messages saved their selected candidate as person_id. Resolve only
  // that message's stored reference, never the conversation's current binding.
  const referencedIds = [...new Set(messages.filter(message => message.role === "user" && !message.metadata.candidate_references && typeof message.metadata.person_id === "string").map(message => String(message.metadata.person_id)))];
  if (referencedIds.length) {
    const people = await rows<{id: string; name: string}>(sql`SELECT id,name FROM hirelix_agent_people WHERE user_id=${userId}::uuid AND id::text=ANY(${textArray(referencedIds)})`);
    for (const message of messages) {
      if (message.role !== "user" || message.metadata.candidate_references) continue;
      const person = people.find(person => person.id === message.metadata.person_id);
      if (person) message.metadata.candidate_references = [person];
    }
  }
  // Resolve old messages from their own saved selection, never from the conversation's current role.
  const messageRoleId = (message: Message) => {
    const viewed = viewedSourceInput.safeParse(message.metadata.viewed_source);
    return viewed.success && viewed.data.kind === "role" ? viewed.data.id : typeof message.metadata.role_id === "string" ? message.metadata.role_id : null;
  };
  const roleIds = [...new Set(messages.filter(message => message.role === "user" && !message.metadata.role_reference).map(messageRoleId).filter((id): id is string => !!id))];
  if (roleIds.length) {
    const roles = await rows<Pick<Role, "id" | "title" | "client_name">>(sql`SELECT id,title,client_name FROM hirelix_private_roles WHERE user_id=${userId}::uuid AND id::text=ANY(${textArray(roleIds)})`);
    for (const message of messages) {
      if (message.role !== "user" || message.metadata.role_reference) continue;
      const role = roles.find(role => role.id === messageRoleId(message));
      if (role) message.metadata.role_reference = role;
    }
  }
  work.reverse();
  const latestWork = [...work].reverse().find(item => item.status === "done" && item.result?.deliverable_id);
  const deliveredMessages = messages.filter(message => !["queued","removed"].includes(String(message.metadata.delivery)));
  const selected = [...deliveredMessages].reverse().find(message => message.role === "user" && typeof message.metadata.work_document_id === "string");
  const documentId = selected && (!latestWork || new Date(selected.created_at) > new Date(latestWork.created_at)) ? selected.metadata.work_document_id : latestWork?.result?.deliverable_id || deliveredMessages.find(message => message.role === "user" && typeof message.metadata.document_id === "string")?.metadata.document_id;
  const document = documentId ? await owned<Deliverable>(userId, "deliverable", z.uuid().parse(documentId)) : null;
  const active = jobs.find(job => job.status === "running");
  const queued = jobs.filter(job => job.status === "queued");
  const stoppedJob = jobs.find(job => job.status === "cancelled" && job.result?.paused === true);
  const current = active || (conversation.stopped ? stoppedJob : queued[0]) || jobs.find(job => !["queued", "running"].includes(job.status)) || null;
  return { conversation, messages: messages.filter(message => message.metadata.delivery !== "removed" && (message.metadata.delivery !== "queued" || message.id === current?.payload.message_id)), document, work, job: current,
    queue: queued.filter(job => conversation.stopped || job.id !== current?.id) };
}
// Render feedback from its saved structured receipt, without parsing generated prose.
async function hydrateRecommendationFeedback(userId: string, messages: Message[]) {
  const ids = messages.flatMap(message => message.role === "assistant" && typeof message.metadata.feedback_record_id === "string" ? [message.metadata.feedback_record_id] : []);
  if (!ids.length) return;
  const records = await rows<{ id: string; role_id: string; person_name: string; request: unknown }>(sql`
    SELECT r.id,r.role_id,p.name AS person_name,r.details->'feedback_request' AS request
    FROM hirelix_private_records r
    JOIN hirelix_agent_people p ON p.id=r.person_id AND p.user_id=r.user_id
    WHERE r.user_id=${userId}::uuid AND r.id::text=ANY(${textArray(ids)})
      AND r.kind='feedback' AND r.details->>'source'='recommendation_link'
  `);
  const feedback = new Map(records.map(record => [record.id, record]));
  for (const message of messages) {
    const record = feedback.get(String(message.metadata.feedback_record_id));
    if (!record) continue;
    const request = recommendationFeedbackInput.safeParse(record.request);
    if (!request.success) continue;
    (message.metadata as AssistantMeta).recommendation_feedback = {
      person_name: record.person_name, response: request.data.response,
      comment: request.data.comment, submitted_name: request.data.name,
      href: `/app/roles/${record.role_id}?tab=activity&record=${record.id}`,
    };
  }
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
