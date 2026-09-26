import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { enqueue, json, owned, rows, WorkspaceError } from "./database";
import { structured } from "./ai";
import { listRoles } from "./roles";
import { listPeople, personDetails } from "./people";
import { retrieveCandidates } from "./retrieval";
import { addRecord } from "./records";
import { createRole, updateRole } from "./roles";
import {
  recordInput,
  roleInput,
  type Conversation,
  type Message,
  type Job,
  type Role,
  type Person,
  type SourceRecord,
} from "./types";
import type { JobHandler } from "./jobs";

export const conversationInput = z.object({
  message: z.string().trim().min(1).max(50000),
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
export async function sendMessage(userId: string, value: unknown) {
  const input = conversationInput.parse(value);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + input.request_key},0))`,
    );
    const [existing] = await rows<Job>(
      sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND request_key=${input.request_key}`,
      tx,
    );
    if (existing) {
      if (
        existing.kind !== "chat" ||
        JSON.stringify(existing.payload.request) !==
          JSON.stringify(JSON.parse(JSON.stringify(input)))
      ) {
        // JSONB key order is not stable; compare the original request in PostgreSQL.
        const [same] = await rows<{ same: boolean }>(
          sql`SELECT payload->'request'=${json(input)} AS same FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND id=${existing.id}::uuid`,
          tx,
        );
        if (existing.kind !== "chat" || !same.same)
          throw new WorkspaceError(
            "This request key was already used for another message",
            409,
          );
      }
      return {
        conversation_id: existing.payload.conversation_id,
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
        sql`INSERT INTO hirelix_private_conversations(user_id,title,role_id,person_id) VALUES(${userId}::uuid,${input.message.slice(0, 100)},${input.role_id}::uuid,${input.person_id}::uuid) RETURNING *`,
        tx,
      );
    }
    const [message] = await rows<Message>(
      sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${userId}::uuid,'user',${input.message},${conversation.id}::uuid,${json({ role_id: conversation.role_id, person_id: conversation.person_id })}) RETURNING *`,
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
  source_refs: z.array(z.string()).max(30),
  actions: z
    .array(
      z.object({
        kind: z.enum([
          "create_role",
          "update_role_brief",
          "add_record",
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
      }),
    )
    .max(5),
});
export const assistantReply: JobHandler = async (job, progress) => {
  const id = z.uuid().parse(job.payload.conversation_id);
  const { conversation, messages } = await conversationDetails(job.user_id, id);
  const question = messages.find((m) => m.id === job.payload.message_id);
  if (!question)
    throw new WorkspaceError("This saved message is no longer available", 404);
  await progress("Reading your conversation and workspace");
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
    "Understand the headhunter’s requested work. Choose role references from the catalog only. For a named person, use exact lookup with only the name/email; for experience or background discovery use semantic. Use none if no candidate lookup is needed. You are planning candidate/role record keeping and client preparation, not defaulting to candidate assessment. If an explicitly selected candidate is sufficient, no lookup is needed.",
    {
      conversation_context: {
        role_id: conversation.role_id,
        person_id: conversation.person_id,
      },
      messages: history,
      conversation_imports: imports,
      catalog: roles.map((r, i) => ({
        ref: `role_${i + 1}`,
        id: r.id,
        title: r.title,
        client: r.client_name,
        status: r.status,
      })),
      history_scope:
        "Most recent 30 messages. Do not imply earlier messages have been reviewed.",
    },
  );
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
    const links = await rows(
      sql`SELECT person_id,permission,interest FROM hirelix_private_role_candidates WHERE user_id=${job.user_id}::uuid AND role_id=${role.id}::uuid`,
    );
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
    replySchema,
    `Help a professional headhunter maintain their candidate relationships, work on client roles, and prepare client material. Speak as their capable personal assistant: short, direct and useful. Respect requested brevity. For a routine save or update proposal, answer in at most 2 short sentences; put detailed changes in the review action rather than repeating every field. Do not append unsolicited reminders or statements about actions nobody requested. Never narrate job IDs, database versions, internal processing, or exact save timestamps unless explicitly asked for diagnostics. For import summaries, distinguish add versus merge using reviewed_rows.action, and describe the current saved profile (not empty fields in the original CSV) as the current state. A merged profile can retain existing private notes while keeping imported content as a separate source; this is a completed merge, not an unresolved one. Do not turn routine completion into an unsolicited checklist. Reply in the user's language. Candidate assessment is only an auxiliary role action when actually requested. Use source_refs for every source relied upon, from the provided registry; do not invent URLs. Distinguish recorded facts from recommendations and unanswered questions. Do not claim any action was performed: actions below are proposals requiring review. add_record preserves the user's original reported facts; occurred_at is null unless the message gives a definite date/time (resolve relative dates against current_time and supplied timezone only when explicit). When the user supplies changed client requirements, propose update_role_brief for the identified existing role. Its role_draft.brief is the complete proposed brief: preserve still-valid priorities, flexible requirements and unknowns, incorporate only the reported change, and remove superseded requirements. This proposal preserves the original JD and records the original feedback when accepted. Do not also propose add_record for the same feedback. Merely asking a question about requirements does not authorize an update proposal. create_role requires an actual JD and identified client; preserve original JD text, do not fabricate missing requirements. submission/search_update opens source selection and preparation, not a claim of a saved or sent draft. No email is sent by this assistant. If the person/role is ambiguous ask one concise clarification, do not attach records arbitrarily. Do not expose private notes in any proposed client prose; client documents are prepared in the separate source selection page. Use source refs such as role_N/person_N; null for irrelevant fields. Scope: latest 30 records per selected person, 50 per selected role, first 50 linked candidates, latest 30 conversation messages; make further investigation needs explicit.`,
    {
      current_time: new Date().toISOString(),
      timezone:
        "UTC (user timezone not supplied; ask if a relative local time matters)",
      history,
      coverage,
      conversation_imports: imports,
      imported_profile_scope:
        "Up to 50 saved candidates from this conversation. Unsaved import rows are not candidates in the pool. Search the full pool if a broader review is needed.",
      sources,
    },
  );
  const sourceMap = new Map(sources.map((s) => [s.ref, s]));
  const cited = reply.source_refs.map((ref) => {
    const source = sourceMap.get(ref);
    if (!source)
      throw new WorkspaceError(
        "The assistant returned an unavailable source. Retry the reply.",
      );
    return { title: source.title, href: source.href };
  });
  const actions: AssistantAction[] = reply.actions.map((action) => {
    const role = action.role_ref ? roleRegistry.get(action.role_ref) : null,
      person = action.person_ref ? persons.get(action.person_ref) : null;
    if ((action.role_ref && !role) || (action.person_ref && !person))
      throw new WorkspaceError(
        "The assistant returned an unavailable candidate or role. Retry the reply.",
      );
    let fields: Record<string, unknown> = {},
      href: string | undefined;
    if (action.kind === "create_role")
      fields = roleInput.parse(action.role_draft);
    if (action.kind === "update_role_brief") {
      if (!role || !action.role_draft)
        throw new WorkspaceError("Choose the role whose requirements changed.");
      fields = {
        title: role.title,
        brief: roleInput.shape.brief.parse(action.role_draft.brief),
        previous_brief: role.brief,
        expected_version: role.version,
        feedback: question.content,
        source_message_id: question.id,
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
      });
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
      title: action.title,
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
      const [message] = await rows<Message>(
        sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${job.user_id}::uuid,'assistant',${reply.answer},${id}::uuid,${json({ actions, sources: cited, coverage })}) RETURNING *`,
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
        input.file_id
      )
        throw new WorkspaceError(
          "The record association changed. Start a new record from the correct profile.",
        );
      const record = await addRecord(userId, input, tx);
      action.href = record.person_id
        ? `/app/candidates?person=${record.person_id}&record=${record.id}`
        : `/app/roles/${record.role_id}?tab=activity&record=${record.id}`;
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
