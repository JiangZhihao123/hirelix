import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { enqueue, json, owned, rows, WorkspaceError } from "./database";
import { structured } from "./ai";
import { listRoles, updateRelationship } from "./roles";
import { listPeople, personDetails } from "./people";
import { retrieveCandidates } from "./retrieval";
import { addRecord } from "./records";
import { createRole, updateRole } from "./roles";
import { readFile, saveFile } from "./files";
import { extractDocument } from "./imports";
import {
  recordInput,
  roleInput,
  type Conversation,
  type Message,
  type Job,
  type Role,
  type RoleCandidate,
  type Person,
  type SourceRecord,
} from "./types";
import type { JobHandler } from "./jobs";

export const conversationInput = z.object({
  message: z.string().trim().max(50000),
  locale: z.enum(["en", "zh"]).default("en"),
  request_key: z.string().min(1).max(200),
  conversation_id: z.uuid().nullable().default(null),
  role_id: z.uuid().nullable().default(null),
  person_id: z.uuid().nullable().default(null),
});
export type AssistantAction = {
  id: string;
  kind:
    | "create_role"
    | "update_role_brief"
    | "add_record"
    | "update_sharing_permission"
    | "submission"
    | "search_update";
  title: string;
  status: "pending" | "saved";
  role_id: string | null;
  person_id: string | null;
  fields: Record<string, unknown>;
  href?: string;
};
export type AssistantMeta = {
  actions?: AssistantAction[];
  sources?: Array<{ title: string; href: string }>;
  coverage?: Record<string, unknown>;
};
export async function listConversations(userId: string) {
  return rows<Conversation>(
    sql`SELECT * FROM hirelix_private_conversations WHERE user_id=${userId}::uuid ORDER BY updated_at DESC,id LIMIT 100`,
  );
}
const openingSchema = z.object({
  message: z.string().min(1).max(400),
  suggested_prompt: z.string().min(1).max(500),
  role_ref: z.string().nullable(),
});
function openingCopy(
  value: string,
  catalog: Array<{ ref: string; client: string; title: string }>,
  locale: "en" | "zh",
) {
  return value
    .replace(/\brole_[1-9]\d*\b/g, (ref) => {
      const role = catalog.find((entry) => entry.ref === ref);
      return role ? `${role.client} ${role.title}` : locale === "zh" ? "这个职位" : "this role";
    })
    .replace(/^(?:早上好|上午好|中午好|下午好|晚上好|good morning|good afternoon|good evening)[～~!！,.，。\s]*/i, "")
    .trim();
}
function assistantCopy(value: string, sources: Map<string, { title: string }>) {
  return value
    .replace(/[ \t]*[（(]\s*(?:role|person|source|attachment)_[1-9]\d*\s*[）)]/g, "")
    .replace(/\b(?:role|person|source|attachment)_[1-9]\d*\b/g, (ref) =>
      sources.get(ref)?.title || "",
    )
    .trim();
}
export async function assistantOpening(userId: string, locale: "en" | "zh") {
  const [roles, pending] = await Promise.all([
    listRoles(userId),
    rows<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM hirelix_private_import_rows r JOIN hirelix_private_jobs j ON j.id=r.job_id AND j.user_id=r.user_id WHERE r.user_id=${userId}::uuid AND r.status='review' AND j.kind='import'`,
    ),
  ]);
  const active = roles.filter((role) => role.status === "active").slice(0, 6);
  if (!active.length && !pending[0]?.total)
    return locale === "zh"
      ? {
          message: "把你正在处理的职位、候选人或客户消息交给我。我会先帮你理清重点，再一起推进下一步。",
          suggested_prompt: "我手头有一份材料，帮我看看下一步该怎么处理",
          role_id: null,
        }
      : {
          message: "Bring me the role, candidate, or client message on your mind. I'll help make sense of it and move the work forward.",
          suggested_prompt: "I have some material. Help me decide what to do next.",
          role_id: null,
        };
  const catalog = active.map((role, index) => ({
    ref: `role_${index + 1}`,
    client: role.client_name,
    title: role.title,
    unknowns: role.brief?.unknowns || [],
    updated_at: role.updated_at,
  }));
  const result = await structured(
    userId,
    "private_assistant_opening",
    openingSchema,
    "You are opening a professional headhunter's private assistant. In the requested language, proactively mention one concrete piece of work supported by the provided catalog, and ask one useful question or offer one specific action. Keep it warm, concise and natural, as a colleague who remembers the work. Prioritize actual pending candidate reviews only when present; otherwise use an active role with a real unknown. Only claim facts present in the catalog; the existence of a role does not prove its materials have been organized or its candidates reviewed. Do not fabricate urgency, recent conversations, client decisions, or work performed. Do not use time-of-day greetings because the recruiter's timezone is unknown. suggested_prompt is a natural first-person instruction the recruiter can send to continue exactly the single step in message. Do not append a second deliverable or related task. The role_N values are internal references: never display them in message or suggested_prompt; use the client and title instead. Use a role_ref only if the message is about that exact catalog role; otherwise null.",
    {
      locale,
      active_roles: catalog,
      candidates_awaiting_review: pending[0]?.total || 0,
    },
  );
  const selected = result.role_ref
    ? catalog.find((entry) => entry.ref === result.role_ref)
    : null;
  if (result.role_ref && !selected)
    throw new WorkspaceError("The assistant selected an unavailable role", 502);
  return {
    message: openingCopy(result.message, catalog, locale),
    suggested_prompt: openingCopy(result.suggested_prompt, catalog, locale),
    role_id: selected ? active[catalog.indexOf(selected)].id : null,
  };
}
export async function conversationDetails(userId: string, id: string) {
  const conversation = await owned<Conversation>(userId, "conversation", id);
  const [messages, jobs] = await Promise.all([
    rows<Message>(
      sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${id}::uuid ORDER BY created_at,id`,
    ),
    rows<Job>(
      sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${id} ORDER BY created_at DESC LIMIT 1`,
    ),
  ]);
  return { conversation, messages, job: jobs[0] ?? null };
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
export async function sendMessage(
  userId: string,
  value: unknown,
  file?: { name: string; type: string; bytes: Uint8Array },
) {
  const input = conversationInput.parse(value);
  if (!input.message && !file)
    throw new WorkspaceError("Write a message or attach a file");
  const attachmentHash = file
    ? createHash("sha256").update(file.bytes).digest("hex")
    : null;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + input.request_key},0))`,
    );
    const [existing] = await rows<Job>(
      sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND request_key=${input.request_key}`,
      tx,
    );
    if (existing) {
      const [same] = await rows<{ same: boolean }>(
        sql`SELECT payload->'request'=${json(input)} AND payload->>'attachment_sha256' IS NOT DISTINCT FROM ${attachmentHash} AS same FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND id=${existing.id}::uuid`,
        tx,
      );
      if (existing.kind !== "chat" || !same.same)
        throw new WorkspaceError(
          "This request key was already used for another message",
          409,
        );
      return {
        conversation_id: z.uuid().parse(existing.payload.conversation_id),
        job: existing,
      };
    }
    if (input.role_id) await owned(userId, "role", input.role_id, tx);
    if (input.person_id) await owned(userId, "person", input.person_id, tx);
    let conversation: Conversation;
    if (input.conversation_id) {
      conversation = await owned<Conversation>(
        userId,
        "conversation",
        input.conversation_id,
        tx,
        true,
      );
      const [pending] = await rows(
        sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${conversation.id} AND status IN ('queued','running','error') LIMIT 1`,
        tx,
      );
      if (pending)
        throw new WorkspaceError(
          "Finish or retry the previous reply before sending another message",
          409,
        );
    } else {
      [conversation] = await rows<Conversation>(
        sql`INSERT INTO hirelix_private_conversations(user_id,title,role_id,person_id) VALUES(${userId}::uuid,${(input.message || file?.name || "New conversation").slice(0, 100)},${input.role_id}::uuid,${input.person_id}::uuid) RETURNING *`,
        tx,
      );
    }
    const attachment = file ? await saveFile(userId, file, tx) : null;
    const [message] = await rows<Message>(
      sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${userId}::uuid,'user',${input.message},${conversation.id}::uuid,${json({ role_id: conversation.role_id, person_id: conversation.person_id, ...(attachment ? { attachment: { file_id: attachment.id, name: attachment.name, size: attachment.byte_size } } : {}) })}) RETURNING *`,
      tx,
    );
    await tx.execute(
      sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE id=${conversation.id}::uuid AND user_id=${userId}::uuid`,
    );
    const job = await enqueue(
      userId,
      "chat",
      input.request_key,
      {
        conversation_id: conversation.id,
        message_id: message.id,
        request: input,
        attachment_sha256: attachmentHash,
      },
      tx,
    );
    return { conversation_id: conversation.id, job };
  });
}
const planSchema = z.object({
  candidate_query: z.string().max(4000).nullable(),
  lookup: z.enum(["exact", "semantic", "none"]),
  role_refs: z.array(z.string()).max(5),
  greeting_or_open_request: z.boolean(),
  attachment_kind: z.enum([
    "candidate_cv",
    "candidate_list",
    "job_description",
    "conversation_note",
    "other",
    "unreadable",
    "none",
  ]),
  prepare_candidate_draft: z.boolean(),
  candidate_evidence_quote: z.string().max(500).nullable(),
  may_propose_role_creation: z.boolean(),
  may_propose_record: z.boolean(),
  sharing_permission_reported: z.boolean(),
});
const roleDraft = z.object({
  title: z.string(),
  client_name: z.string(),
  jd_text: z.string(),
  brief: z.object({
    priorities: z.array(z.string()),
    flexible: z.array(z.string()),
    unknowns: z.array(z.string()),
  }),
});
const replySchema = z.object({
  answer: z.string().min(1).max(25000),
  follow_up: z.string().max(500).nullable(),
  source_refs: z.array(z.string()).max(30),
  actions: z
    .array(
      z.object({
        kind: z.enum([
          "create_role",
          "update_role_brief",
          "add_record",
          "update_sharing_permission",
          "submission",
          "search_update",
        ]),
        title: z.string().max(300),
        role_ref: z.string().nullable(),
        person_ref: z.string().nullable(),
        role_draft: roleDraft.nullable(),
        record: z
          .object({
            kind: z.enum(["note", "call", "email", "feedback"]),
            title: z.string(),
            content: z.string(),
            occurred_at: z.iso.datetime({ offset: true }).nullable(),
          })
          .nullable(),
        sharing_permission: z.enum(["confirmed", "declined"]).nullable(),
      }),
    )
    .max(5),
});
const openRequestReplySchema = replySchema.extend({
  answer: z.string().min(1).max(600),
  follow_up: z.string().max(180).nullable(),
  actions: replySchema.shape.actions.max(1),
});
const sharingPermissionProposalSchema = z.object({
  actions: z.array(z.object({
    kind: z.literal("update_sharing_permission"),
    title: z.string().max(300),
    role_ref: z.string(),
    person_ref: z.string(),
    role_draft: z.null(),
    record: replySchema.shape.actions.element.shape.record.unwrap(),
    sharing_permission: z.enum(["confirmed", "declined"]),
  })).max(5),
  clarification: z.string().max(500).nullable(),
});
type ConversationAttachment = {
  file_id: string;
  name: string;
  size: number;
};
function attachmentFromMessage(message: Message): ConversationAttachment | null {
  const value = message.metadata.attachment;
  const parsed = z.object({
    file_id: z.uuid(),
    name: z.string(),
    size: z.number(),
  }).safeParse(value);
  return parsed.success ? parsed.data : null;
}
async function readConversationFile(userId: string, message: Message) {
  const attachment = attachmentFromMessage(message);
  if (!attachment) return null;
  const file = await readFile(userId, attachment.file_id);
  try {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const text = ["csv", "txt", "md"].includes(extension || "")
      ? new TextDecoder("utf-8", { fatal: true }).decode(file.bytes).replace(/^\uFEFF/, "")
      : await extractDocument(file);
    if (!text.trim())
      throw new WorkspaceError("This file has no readable text");
    return {
      ...attachment,
      text: text.slice(0, 100000),
      truncated: text.length > 100000,
      read_error: null as string | null,
    };
  } catch (cause) {
    return {
      ...attachment,
      text: "",
      truncated: false,
      read_error: cause instanceof Error ? cause.message : "Could not read this file",
    };
  }
}
function groundedQuote(text: string, quote: string | null) {
  if (!quote || quote.trim().length < 8) return false;
  const normalized = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return normalized(text).includes(normalized(quote));
}
export const assistantReply: JobHandler = async (job, progress) => {
  const id = z.uuid().parse(job.payload.conversation_id);
  const { conversation, messages } = await conversationDetails(job.user_id, id);
  const question = messages.find((m) => m.id === job.payload.message_id);
  if (!question)
    throw new WorkspaceError("This saved message is no longer available", 404);
  await progress("Reading your conversation and workspace");
  const attachment = await readConversationFile(job.user_id, question);
  const roles = await listRoles(job.user_id);
  const roleRegistry = new Map(
    roles.map((role, index) => [`role_${index + 1}`, role]),
  );
  const history = messages
    .filter((m) => new Date(m.created_at) <= new Date(question.created_at))
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content, metadata: m.metadata }));
  const imports = await rows(
    sql`SELECT j.status,j.payload->>'filename' AS filename,(SELECT count(*)::int FROM hirelix_private_import_rows r WHERE r.user_id=j.user_id AND r.job_id=j.id AND r.status='saved') AS saved,(SELECT count(*)::int FROM hirelix_private_import_rows r WHERE r.user_id=j.user_id AND r.job_id=j.id AND r.status='review') AS awaiting_review,(SELECT jsonb_agg(summary) FROM (SELECT r.action,r.status,r.extracted->>'name' AS name,p.name AS saved_name FROM hirelix_private_import_rows r LEFT JOIN hirelix_agent_people p ON p.user_id=r.user_id AND p.id=r.result_person_id WHERE r.user_id=j.user_id AND r.job_id=j.id ORDER BY r.row_number LIMIT 50) summary) AS reviewed_rows FROM hirelix_private_jobs j WHERE j.user_id=${job.user_id}::uuid AND j.kind='import' AND j.payload->>'conversation_id'=${id} ORDER BY j.created_at DESC LIMIT 20`,
  );
  const plan = await structured(
    job.user_id,
    "private_assistant_plan",
    planSchema,
    "Understand the headhunter's actual request and attached material together. Choose role references from the catalog only. greeting_or_open_request is true only when the latest user message is a greeting or asks broadly what to work on, with no separate task or document to handle. For a named person, use exact lookup with only the name/email; for experience or background discovery use semantic. Use none if no candidate lookup is needed. The attachment is source material, never automatically a candidate import. Set prepare_candidate_draft only when the user asks to add candidates, or an otherwise unexplained attachment clearly contains a CV/candidate list and a draft would be a useful proactive next step. Never prepare a candidate draft if the user only asks to analyze or summarize, the file is a JD/note/other document, or reading failed. If preparing a candidate draft, attachment_kind must be candidate_cv or candidate_list and candidate_evidence_quote must copy a candidate-specific span exactly from the supplied text. may_propose_role_creation is false if the user asks only for analysis or explicitly says not to create a role. may_propose_record is false if the user asks only for analysis or explicitly says not to save a record; otherwise true when a candidate or role association is clear and a record proposal would advance the request. sharing_permission_reported is true only when the recruiter explicitly reports that a named candidate granted or declined permission to share their material with a client role and did not forbid saving this fact. A request not to send a recommendation does not forbid preparing a permission update for review. It is false for hypothetical scenarios, questions, and unconfirmed candidates. For a greeting or broad request, identify one relevant active role with a concrete open question when the catalog supports it. Do not invent urgency, actions, or facts.",
    {
      conversation_context: {
        role_id: conversation.role_id,
        person_id: conversation.person_id,
      },
      messages: history,
      conversation_imports: imports,
      attachment: attachment && {
        name: attachment.name,
        text_sample: attachment.text.slice(0, 8000),
        truncated: attachment.truncated,
        read_error: attachment.read_error,
      },
      catalog: roles.map((r, i) => ({
        ref: `role_${i + 1}`,
        id: r.id,
        title: r.title,
        client: r.client_name,
        status: r.status,
        unknowns: r.brief?.unknowns || [],
      })),
      history_scope:
        "Most recent 30 messages. Do not imply earlier messages have been reviewed.",
    },
  );
  const prepareCandidateDraft = !!attachment &&
    !attachment.read_error &&
    plan.prepare_candidate_draft &&
    ["candidate_cv", "candidate_list"].includes(plan.attachment_kind) &&
    groundedQuote(attachment.text, plan.candidate_evidence_quote);
  const selectedRoles = new Map<string, Role>();
  if (conversation.role_id) {
    const role = await owned<Role>(job.user_id, "role", conversation.role_id);
    selectedRoles.set(role.id, role);
  }
  for (const ref of plan.role_refs) {
    const role = roleRegistry.get(ref);
    if (!role)
      throw new WorkspaceError(
        "The assistant could not identify the requested role. Retry with a role selected.",
      );
    selectedRoles.set(role.id, role);
  }
  if (plan.greeting_or_open_request && selectedRoles.size === 0) {
    const relevant = roles.find((role) => role.status === "active" && role.brief?.unknowns?.length) ||
      roles.find((role) => role.status === "active");
    if (relevant) selectedRoles.set(relevant.id, relevant);
  }
  const candidates = new Map<string, Person>();
  const importedPeople = await rows<Person>(
    sql`SELECT DISTINCT p.* FROM hirelix_agent_people p JOIN hirelix_private_import_rows ir ON ir.user_id=p.user_id AND ir.result_person_id=p.id JOIN hirelix_private_jobs j ON j.user_id=ir.user_id AND j.id=ir.job_id WHERE p.user_id=${job.user_id}::uuid AND j.kind='import' AND j.payload->>'conversation_id'=${id} AND ir.status='saved' ORDER BY p.updated_at DESC LIMIT 50`,
  );
  importedPeople.forEach((person) => candidates.set(person.id, person));
  let coverage: Record<string, unknown> = { lookup: "none" };
  if (conversation.person_id)
    candidates.set(
      conversation.person_id,
      await owned<Person>(job.user_id, "person", conversation.person_id),
    );
  if (plan.candidate_query && plan.lookup !== "none") {
    await progress("Finding candidates in your private pool");
    if (plan.lookup === "exact") {
      const result = await listPeople(job.user_id, plan.candidate_query);
      result.people.forEach((p) => candidates.set(p.id, p));
      coverage = {
        lookup: "exact",
        query: plan.candidate_query,
        total: result.total,
        returned: result.people.length,
      };
    } else {
      const result = await retrieveCandidates(job.user_id, {
        query: plan.candidate_query,
        limit: 20,
      });
      result.matches.forEach((m) => candidates.set(m.person.id, m.person));
      coverage = {
        lookup: "semantic",
        ...result.coverage,
        returned: result.matches.length,
        scope: result.scope,
      };
    }
  }
  // Explicit role relationships are useful for progress and drafting even without a pool search.
  for (const role of selectedRoles.values()) {
    const linked = await rows<Person>(
      sql`SELECT p.* FROM hirelix_agent_people p JOIN hirelix_private_role_candidates rc ON rc.user_id=p.user_id AND rc.person_id=p.id WHERE rc.user_id=${job.user_id}::uuid AND rc.role_id=${role.id}::uuid ORDER BY rc.created_at LIMIT 50`,
    );
    linked.forEach((p) => candidates.set(p.id, p));
  }
  const sources: Array<{
    ref: string;
    title: string;
    href: string;
    data: unknown;
  }> = [];
  const relationships = new Map<string, RoleCandidate>();
  if (attachment) {
    sources.push({
      ref: "attachment_1",
      title: attachment.name,
      href: `/api/workspace/files/${attachment.file_id}`,
      data: {
        extracted_text: attachment.text,
        truncated: attachment.truncated,
        read_error: attachment.read_error,
      },
    });
  }
  const persons = new Map<string, Person>();
  for (const person of candidates.values()) {
    const ref = `person_${persons.size + 1}`;
    persons.set(ref, person);
    sources.push({
      ref,
      title: person.name,
      href: `/app/candidates?person=${person.id}`,
      data: person,
    });
    const details = await personDetails(job.user_id, person.id);
    for (const record of details.records.slice(0, 30))
      sources.push({
        ref: `source_${sources.length + 1}`,
        title: `${person.name} · ${record.title}`,
        href: `/app/candidates?person=${person.id}&record=${record.id}`,
        data: record,
      });
  }
  for (const [ref, role] of roleRegistry) {
    if (!selectedRoles.has(role.id)) continue;
    const records = await rows<SourceRecord>(
      sql`SELECT * FROM hirelix_private_records WHERE user_id=${job.user_id}::uuid AND role_id=${role.id}::uuid ORDER BY created_at DESC LIMIT 50`,
    );
    const links = await rows<RoleCandidate>(
      sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${job.user_id}::uuid AND role_id=${role.id}::uuid`,
    );
    links.forEach((link) => relationships.set(`${role.id}:${link.person_id}`, link));
    const documents = await rows(
      sql`SELECT id,kind,title,status,submitted_at FROM hirelix_private_deliverables WHERE user_id=${job.user_id}::uuid AND role_id=${role.id}::uuid ORDER BY created_at DESC LIMIT 20`,
    );
    sources.push({
      ref,
      title: `${role.client_name} · ${role.title}`,
      href: `/app/roles/${role.id}`,
      data: { role, links, documents },
    });
    for (const record of records)
      sources.push({
        ref: `source_${sources.length + 1}`,
        title: record.title,
        href: `/app/roles/${role.id}?tab=activity&record=${record.id}`,
        data: record,
      });
  }
  // Do not silently truncate evidence and then imply a complete review.
  if (JSON.stringify({ history, sources }).length > 240000)
    throw new WorkspaceError(
      "There is too much source material for one reply. Start a conversation with a specific candidate or role.",
    );
  await progress("Preparing your reply and next steps");
  const reply = await structured(
    job.user_id,
    "private_assistant_reply",
    plan.greeting_or_open_request ? openRequestReplySchema : replySchema,
    `Help a professional headhunter maintain candidate relationships, work on client roles, and prepare client material. Be an attentive, proactive personal assistant, not a workflow navigator. Answer the request first, then look for the single most useful evidence-backed next move. When a key fact or association is missing, ask one specific question that lets the recruiter move forward; when a useful action can already be prepared, propose it instead of asking the recruiter to choose a process. Put that question in follow_up, or null when the work is genuinely complete or a question would be repetitive. For a greeting or open request, if an active role is in sources, reconnect the recruiter to one concrete unknown for that role. Keep it short: one focus, one useful question, no inventory of candidates or documents, and no repeated self-introduction. Do not ask a generic "how can I help" when grounded work context is available. Never add a checklist of speculative reminders. Respect requested brevity and the user's language; when the message has no language, use preferred_language. If an attached file is present, respond to its contents and the user's message together. An attachment is not automatically a CV. If it is unreadable, explain the actual limitation and offer one concrete way forward. If the file is unrelated to recruiting but the user requests a simple content task, help with that task in this conversation without creating a recruiter record. If no instruction accompanies a readable file, state what it appears to contain and proactively suggest one useful next step or ask one focused question. Candidate draft preparation is allowed only when candidate_draft_allowed is true; it is still a draft and is not saved to the pool. Do not propose add_record for an unsaved candidate draft: no candidate exists to attach a record to yet. For source material use source_refs from the registry and never invent URLs or imply the full file was read when truncated. Never narrate job IDs, database versions, internal processing, or exact save timestamps unless asked. For import summaries, distinguish add versus merge using reviewed_rows.action; a completed merge is not an unresolved one. Distinguish recorded facts from recommendations and unanswered questions. Do not claim an action was performed when it is only a proposal requiring review. add_record preserves the user's reported facts; occurred_at is null unless the message or file gives a definite date/time. When the user supplies changed client requirements, propose update_role_brief for the identified role. Its role_draft.brief is the complete proposed brief: preserve still-valid requirements and incorporate only supported changes. This preserves the original JD and records the feedback on acceptance; do not also propose add_record for the same feedback. Merely asking about requirements does not authorize an update proposal. create_role requires an actual JD and identified client; preserve original JD text, do not fabricate missing requirements. submission/search_update opens preparation, not a claim of a saved or sent draft. No email is sent by this assistant. If person or role identity is ambiguous, ask one concise clarification before attaching records. Do not expose private notes in proposed client prose. Use role_N/person_N/attachment_1 source refs where relevant. Scope: latest 30 records per selected person, 50 per selected role, first 50 linked candidates, latest 30 conversation messages, and at most the first 100000 characters of an attachment; make any material limit explicit.` +
    " Every action object must include sharing_permission, null except for update_sharing_permission. When the recruiter explicitly reports that a named candidate granted or declined permission to share with a named client role, propose update_sharing_permission for that exact person-role relationship. Its record must describe only that person's permission report, preserving whether it was oral or written and leaving occurred_at null if no date was given. Do not mix another person's status or a hold instruction into that person's evidence record. Do not propose add_record for the same permission fact. The proposed record and relationship update are both pending until the recruiter reviews and saves them; never say 已记录, 已保存, or 'I recorded it' in answer before acceptance. A request not to send means no submission action. Keep the answer focused on what changed and the next missing fact. In user-facing prose, never show role_N, person_N, source_N, enum names such as confirmed/unknown/draft, or internal processing narration. Ask one direct question about a missing fact; do not ask the recruiter to choose from a menu of assistant tasks.",
    {
      current_time: new Date().toISOString(),
      preferred_language: job.payload.request && typeof job.payload.request === "object"
        ? (job.payload.request as { locale?: string }).locale || "en"
        : "en",
      timezone:
        "UTC (user timezone not supplied; ask if a relative local time matters)",
      history,
      current_request: question.content,
      greeting_or_open_request: plan.greeting_or_open_request,
      sharing_permission_reported: plan.sharing_permission_reported,
      attachment_interpretation: attachment && {
        kind: plan.attachment_kind,
        candidate_draft_allowed: prepareCandidateDraft,
        read_error: attachment.read_error,
        truncated: attachment.truncated,
      },
      coverage,
      conversation_imports: imports,
      imported_profile_scope:
        "Up to 50 saved candidates from this conversation. Unsaved import rows are not candidates in the pool. Search the full pool if a broader review is needed.",
      sources,
    },
  );
  const validPermissionAction = (action: z.infer<typeof replySchema>["actions"][number]) => {
    if (action.kind !== "update_sharing_permission") return false;
    const role = action.role_ref && roleRegistry.get(action.role_ref);
    const person = action.person_ref && persons.get(action.person_ref);
    return !!role && !!person && !!action.sharing_permission && !!action.record &&
      relationships.has(`${role.id}:${person.id}`);
  };
  if (plan.sharing_permission_reported && !reply.actions.some(validPermissionAction)) {
    const linkedCandidates = [...relationships.values()].flatMap((link) => {
      const roleRef = [...roleRegistry].find(([, role]) => role.id === link.role_id)?.[0];
      const personEntry = [...persons].find(([, person]) => person.id === link.person_id);
      return roleRef && personEntry ? [{
        role_ref: roleRef,
        person_ref: personEntry[0],
        name: personEntry[1].name,
        client: roleRegistry.get(roleRef)?.client_name,
        title: roleRegistry.get(roleRef)?.title,
        current_permission: link.permission,
      }] : [];
    });
    const recovered = await structured(
      job.user_id,
      "private_assistant_permission_proposal",
      sharingPermissionProposalSchema,
      "The recruiter explicitly reported a candidate's permission decision, but the assistant reply did not include an actionable proposal. Prepare one reviewable permission action per unambiguous, explicitly confirmed or declined candidate-role pair from the latest user message. Use only the linked candidates in the catalog. Never treat an unconfirmed person's status as declined or confirmed. Preserve whether permission was oral or written in a short evidence record about that person only. A request not to send a recommendation does not prevent preparing this record and permission update for review. Do not propose a submission. If identity or role is ambiguous, return no actions and one precise clarification. role_ref and person_ref are internal selectors and must never appear in the user-facing title or clarification.",
      { latest_user_message: question.content, linked_candidates: linkedCandidates },
    );
    const prepared = recovered.actions.filter(validPermissionAction);
    reply.actions = reply.actions.filter((action) => action.kind !== "update_sharing_permission");
    if (prepared.length) reply.actions.push(...prepared);
    else {
      reply.answer = recovered.clarification ||
        (job.payload.request && typeof job.payload.request === "object" &&
          (job.payload.request as { locale?: string }).locale === "zh"
          ? "我还不能确定授权对应的候选人和职位。请补充姓名和职位，我再准备可审核的变更。"
          : "I cannot safely match that permission report to a candidate and role. Please clarify the person and role.");
      reply.follow_up = null;
    }
  }
  const sourceMap = new Map(sources.map((s) => [s.ref, s]));
  const cited = reply.source_refs.map((ref) => {
    const source = sourceMap.get(ref);
    if (!source)
      throw new WorkspaceError(
        "The assistant returned an unavailable source. Retry the reply.",
      );
    return { title: source.title, href: source.href };
  });
  const actions: AssistantAction[] = reply.actions
    .filter((action) => {
      if (action.kind === "create_role") return plan.may_propose_role_creation;
      if (action.kind === "add_record")
        return plan.may_propose_record && (!!action.role_ref || !!action.person_ref);
      if (action.kind === "update_sharing_permission") {
        return plan.sharing_permission_reported && validPermissionAction(action);
      }
      if (action.kind === "update_role_brief" || action.kind === "submission" || action.kind === "search_update")
        return !!action.role_ref;
      return true;
    })
    .map((action) => {
    const role = action.role_ref ? roleRegistry.get(action.role_ref) : null,
      person = action.person_ref ? persons.get(action.person_ref) : null;
    if ((action.role_ref && !role) || (action.person_ref && !person))
      throw new WorkspaceError(
        "The assistant returned an unavailable candidate or role. Retry the reply.",
      );
    let fields: Record<string, unknown> = {},
      href: string | undefined;
    if (action.kind === "create_role")
      fields = {
        ...roleInput.parse(action.role_draft),
        ...(attachment && plan.attachment_kind === "job_description" && !attachment.read_error
          ? { jd_text: attachment.text, source_file_id: attachment.file_id, source_file_name: attachment.name }
          : {}),
      };
    if (action.kind === "update_role_brief") {
      if (!role || !action.role_draft)
        throw new WorkspaceError("Choose the role whose requirements changed.");
      fields = {
        title: role.title,
        brief: roleInput.shape.brief.parse(action.role_draft.brief),
        previous_brief: role.brief,
        expected_version: role.version,
        feedback: attachment && !attachment.read_error ? attachment.text : question.content,
        source_message_id: question.id,
        ...(attachment && !attachment.read_error ? { source_file_id: attachment.file_id } : {}),
      };
    }
    if (action.kind === "add_record") {
      if (!role && !person)
        throw new WorkspaceError(
          "Select the candidate or role where this record belongs.",
        );
      fields = recordInput.parse({
        ...action.record,
        role_id: role?.id ?? null,
        person_id: person?.id ?? null,
        file_id: attachment && !attachment.read_error ? attachment.file_id : null,
      });
    }
    if (action.kind === "update_sharing_permission") {
      if (!role || !person || !action.sharing_permission || !action.record)
        throw new WorkspaceError("Choose a candidate already linked to this role.");
      const relationship = relationships.get(`${role.id}:${person.id}`);
      if (!relationship)
        throw new WorkspaceError("Choose a candidate already linked to this role.");
      fields = {
        ...recordInput.parse({
          ...action.record,
          role_id: role.id,
          person_id: person.id,
          file_id: attachment && !attachment.read_error ? attachment.file_id : null,
        }),
        permission: action.sharing_permission,
        relationship_id: relationship.id,
        expected_version: relationship.version,
        source_message_id: question.id,
      };
    }
    if (action.kind === "submission" || action.kind === "search_update") {
      if (!role)
        throw new WorkspaceError(
          "Select a client role before preparing this document.",
        );
      href =
        action.kind === "submission"
          ? `/app/submissions/new?role=${role.id}${person ? `&people=${person.id}` : ""}`
          : `/app/roles/${role.id}/updates/new`;
    }
    return {
      id: randomUUID(),
      kind: action.kind,
      title: assistantCopy(action.title, sourceMap),
      status: "pending",
      role_id: role?.id ?? null,
      person_id: person?.id ?? null,
      fields,
      ...(href ? { href } : {}),
    };
    });
  return {
    result: { conversation_id: id },
    apply: async (tx) => {
      await owned(job.user_id, "conversation", id, tx, true);
      const importJob = prepareCandidateDraft && attachment
        ? await enqueue(
            job.user_id,
            "import",
            `assistant-import:${job.id}`,
            {
              file_id: attachment.file_id,
              filename: attachment.name,
              conversation_id: id,
              source_message_id: question.id,
            },
            tx,
          )
        : null;
      const answerText = assistantCopy(reply.answer, sourceMap);
      const followUp = reply.follow_up && assistantCopy(reply.follow_up, sourceMap);
      const answer = answerText +
        (followUp && !answerText.includes(followUp) ? `\n\n${followUp}` : "");
      const [message] = await rows<Message>(
        sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${job.user_id}::uuid,'assistant',${answer},${id}::uuid,${json({ actions, sources: cited, coverage, ...(importJob ? { import_job_id: importJob.id } : {}) })}) RETURNING *`,
        tx,
      );
      await tx.execute(
        sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE user_id=${job.user_id}::uuid AND id=${id}::uuid`,
      );
      return { message_id: message.id };
    },
  };
};
export async function acceptAction(
  userId: string,
  conversationId: string,
  messageId: string,
  actionId: string,
  value: unknown,
) {
  return db.transaction(async (tx) => {
    await owned(userId, "conversation", conversationId, tx);
    const [message] = await rows<Message>(
      sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversationId}::uuid AND id=${messageId}::uuid AND role='assistant' FOR UPDATE`,
      tx,
    );
    if (!message) throw new WorkspaceError("This reply was not found", 404);
    const metadata = message.metadata as AssistantMeta,
      action = metadata.actions?.find((a) => a.id === actionId);
    if (!action)
      throw new WorkspaceError("This proposed action was not found", 404);
    if (action.status === "saved") return { href: action.href };
    if (action.kind === "create_role") {
      const role = await createRole(userId, roleInput.parse(value), tx);
      if (action.fields.source_file_id) {
        const fileId = z.uuid().parse(action.fields.source_file_id);
        await owned(userId, "file", fileId, tx);
        await addRecord(userId, {
          role_id: role.id,
          file_id: fileId,
          kind: "jd",
          title: String(action.fields.source_file_name || "Original job description"),
          content: String(action.fields.jd_text || ""),
        }, tx);
      }
      action.href = `/app/roles/${role.id}`;
      action.role_id = role.id;
      await tx.execute(
        sql`UPDATE hirelix_private_conversations SET role_id=coalesce(role_id,${role.id}::uuid),updated_at=now() WHERE user_id=${userId}::uuid AND id=${conversationId}::uuid`,
      );
    } else if (action.kind === "update_role_brief") {
      if (!action.role_id)
        throw new WorkspaceError("This role is unavailable", 404);
      const input = z.object({ brief: roleInput.shape.brief }).parse(value);
      const prior = await owned<Role>(userId, "role", action.role_id, tx, true);
      const role = await updateRole(
        userId,
        prior.id,
        { ...prior, brief: input.brief },
        z.number().int().positive().parse(action.fields.expected_version),
        tx,
      );
      await addRecord(
        userId,
        {
          role_id: role.id,
          file_id: action.fields.source_file_id || null,
          kind: "feedback",
          title: "Client requirements feedback",
          content: z.string().parse(action.fields.feedback),
          occurred_at: null,
          details: {
            source_message_id: action.fields.source_message_id,
            role_version: role.version,
          },
        },
        tx,
      );
      action.href = `/app/roles/${role.id}`;
    } else if (action.kind === "add_record") {
      const input = recordInput.parse(value);
      if (
        input.person_id !== action.person_id ||
        input.role_id !== action.role_id ||
        input.file_id !== (action.fields.file_id || null)
      )
        throw new WorkspaceError(
          "The record association changed. Start a new record from the correct profile.",
        );
      const record = await addRecord(userId, input, tx);
      action.href = record.person_id
        ? `/app/candidates?person=${record.person_id}&record=${record.id}`
        : `/app/roles/${record.role_id}?tab=activity&record=${record.id}`;
    } else if (action.kind === "update_sharing_permission") {
      const input = recordInput.parse(value);
      if (
        !action.role_id || !action.person_id ||
        input.role_id !== action.role_id ||
        input.person_id !== action.person_id ||
        input.file_id !== (action.fields.file_id || null)
      )
        throw new WorkspaceError("The candidate and role association changed.");
      const permission = z.enum(["confirmed", "declined"]).parse(action.fields.permission);
      const relationship = await owned<RoleCandidate>(
        userId,
        "role_candidate",
        z.uuid().parse(action.fields.relationship_id),
        tx,
        true,
      );
      if (relationship.role_id !== action.role_id || relationship.person_id !== action.person_id)
        throw new WorkspaceError("This candidate is no longer linked to the selected role.", 409);
      const record = await addRecord(userId, {
        ...input,
        details: { ...input.details, source_message_id: action.fields.source_message_id },
      }, tx);
      await updateRelationship(userId, action.role_id, action.person_id, {
        permission,
        permission_record_id: record.id,
        interest: relationship.interest,
        notes: relationship.notes,
        expected_version: z.number().int().positive().parse(action.fields.expected_version),
      }, tx);
      action.href = `/app/roles/${action.role_id}`;
    } else
      throw new WorkspaceError(
        "Open the document preparation page to continue",
      );
    action.status = "saved";
    await tx.execute(
      sql`UPDATE hirelix_agent_messages SET metadata=${json(metadata)} WHERE user_id=${userId}::uuid AND id=${message.id}::uuid`,
    );
    return { href: action.href };
  });
}
