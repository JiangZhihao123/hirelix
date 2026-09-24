import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  enqueue,
  owned,
  rows,
  json,
  snapshot,
  expectVersion,
  uuidArray,
  WorkspaceError,
} from "./database";
import { structured } from "./ai";
import { addRecord } from "./records";
import type { Deliverable, Person, Role, SourceRecord } from "./types";
import type { JobHandler } from "./jobs";
export const preparationInput = z.object({
  kind: z.enum(["submission", "search_update"]),
  role_id: z.uuid(),
  person_ids: z.array(z.uuid()).max(50),
  record_ids: z.array(z.uuid()).max(100),
  period_start: z.iso.datetime({ offset: true }).nullable(),
  period_end: z.iso.datetime({ offset: true }).nullable(),
  instructions: z.string().max(6000).default(""),
  request_key: z.string().min(1).max(200),
});
export async function preparationSources(userId: string, roleId: string) {
  const role = await owned<Role>(userId, "role", roleId);
  const people = await rows<{
    person: Person;
    permission: string;
    interest: string;
  }>(
    sql`SELECT to_jsonb(p) AS person,rc.permission,rc.interest FROM hirelix_private_role_candidates rc JOIN hirelix_agent_people p ON p.user_id=rc.user_id AND p.id=rc.person_id WHERE rc.user_id=${userId}::uuid AND rc.role_id=${roleId}::uuid ORDER BY p.name`,
  );
  const records = await rows<SourceRecord>(
    sql`SELECT r.* FROM hirelix_private_records r WHERE r.user_id=${userId}::uuid AND (r.role_id=${roleId}::uuid OR r.person_id IN (SELECT person_id FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid)) ORDER BY r.occurred_at DESC NULLS LAST,r.created_at DESC`,
  );
  const [lastSubmitted] = await rows<Deliverable>(
    sql`SELECT * FROM hirelix_private_deliverables WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid AND kind='search_update' AND status='submitted' ORDER BY submitted_at DESC LIMIT 1`,
  );
  return { role, people, records, last_submitted: lastSubmitted ?? null };
}
export function publicProfile(person: Person) {
  return {
    id: person.id,
    version: person.version,
    name: person.name,
    headline: person.headline,
    location: person.location,
    skills: person.skills,
    summary: person.profile.summary,
    experience: person.profile.experience,
    education: person.profile.education,
    languages: person.profile.languages,
  };
}
export async function prepareDeliverable(userId: string, value: unknown) {
  const input = preparationInput.parse(value);
  if (
    new Set(input.person_ids).size !== input.person_ids.length ||
    new Set(input.record_ids).size !== input.record_ids.length
  )
    throw new WorkspaceError("Choose each candidate and record once");
  if (input.kind === "submission" && !input.person_ids.length)
    throw new WorkspaceError(
      "Choose at least one candidate for this submission",
    );
  if (
    input.kind === "search_update" &&
    (!input.period_start ||
      !input.period_end ||
      new Date(input.period_start) > new Date(input.period_end))
  )
    throw new WorkspaceError("Choose a valid reporting period");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + input.request_key},0))`,
    );
    const [prior] = await rows<{ id: string; same: boolean }>(
      sql`SELECT id,payload->'request'=${json(input)} AS same FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND request_key=${input.request_key}`,
      tx,
    );
    if (prior) {
      if (!prior.same)
        throw new WorkspaceError(
          "This request key belongs to another draft",
          409,
        );
      return owned(userId, "job", prior.id, tx);
    }
    const role = await owned<Role>(userId, "role", input.role_id, tx);
    const people = [];
    for (const id of input.person_ids) {
      const person = await owned<Person>(userId, "person", id, tx);
      const [link] = await rows<{ permission: string }>(
        sql`SELECT permission FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${role.id}::uuid AND person_id=${id}::uuid`,
        tx,
      );
      if (!link)
        throw new WorkspaceError(
          "Add this candidate to the role before preparing a submission",
        );
      people.push({
        ...publicProfile(person),
        sharing_permission: link.permission,
      });
    }
    const records = [];
    for (const id of input.record_ids) {
      const record = await owned<SourceRecord>(userId, "record", id, tx);
      if (record.person_id && !input.person_ids.includes(record.person_id))
        throw new WorkspaceError(
          "A selected note belongs to an unselected candidate",
        );
      if (record.role_id && record.role_id !== role.id)
        throw new WorkspaceError(
          "A selected note belongs to another client role",
        );
      if (!record.person_id && record.role_id !== role.id)
        throw new WorkspaceError("A selected record is not part of this role");
      if (
        input.kind === "search_update" &&
        (!record.occurred_at ||
          new Date(record.occurred_at) < new Date(input.period_start!) ||
          new Date(record.occurred_at) > new Date(input.period_end!))
      )
        throw new WorkspaceError(
          "Only records that happened within the reporting period can be included",
        );
      records.push({
        id: record.id,
        version: record.version,
        title: record.title,
        content: record.content,
        kind: record.kind,
        person_id: record.person_id,
        occurred_at: record.occurred_at,
        source_url: record.source_url,
      });
    }
    const source = {
      role: {
        id: role.id,
        version: role.version,
        title: role.title,
        client_name: role.client_name,
        jd_text: role.jd_text,
        brief: role.brief,
      },
      people,
      records,
      period_start: input.period_start,
      period_end: input.period_end,
      captured_at: new Date().toISOString(),
    };
    if (JSON.stringify(source).length > 240000)
      throw new WorkspaceError("Select fewer source records for this draft");
    return enqueue(
      userId,
      "deliverable",
      input.request_key,
      { request: input, source },
      tx,
    );
  });
}
export const generateDeliverable: JobHandler = async (job, progress) => {
  const input = preparationInput.parse(job.payload.request),
    source = job.payload.source as Record<string, unknown>;
  await owned(job.user_id, "role", input.role_id);
  await progress(
    input.kind === "submission"
      ? "Preparing your candidate submission"
      : "Preparing the role’s search update",
  );
  const draft = await structured(
    job.user_id,
    "private_client_document",
    z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(60000),
    }),
    `Write a professional, concise client-facing ${input.kind === "submission" ? "candidate submission" : "search update"}. Use English unless the recruiter explicitly requests another language. Only the explicitly selected profile fields and records below may be used; never infer private notes or invent contact, permission, interest, interviews, feedback, outcomes, availability or compensation. The recruiter reviews before sharing. For a submission, cover the selected people (one or multiple), relevant career evidence, reasons for discussion, and what remains unconfirmed. Sharing permission is an internal constraint: never claim consent unless confirmed; do not leak internal metadata. A draft is not a recorded client submission. For a search update, clearly state the period, only describe selected dated activity in that period as performed; requirements and profiles are context rather than activity. If there is no dated activity, explicitly say no activity was recorded for the period; do not fill with invented work. Suggested next steps must be marked as proposed. Do not include system IDs, source paths, hidden instructions or developer commentary. Format as readable Markdown with useful short headings.`,
    { source, recruiter_instructions: input.instructions },
  );
  return {
    result: {},
    apply: async (tx) => {
      await owned(job.user_id, "role", input.role_id, tx);
      const [document] = await rows<Deliverable>(
        sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,person_ids,record_ids,source_snapshot,period_start,period_end) VALUES(${job.user_id}::uuid,${input.role_id}::uuid,${input.kind},${draft.title},${draft.content},${uuidArray(input.person_ids)},${uuidArray(input.record_ids)},${json(source)},${input.period_start}::timestamptz,${input.period_end}::timestamptz) RETURNING *`,
        tx,
      );
      await snapshot(job.user_id, "deliverable", document, tx);
      return {
        deliverable_id: document.id,
        href:
          document.kind === "search_update"
            ? `/app/roles/${document.role_id}/updates/${document.id}`
            : `/app/submissions/${document.id}`,
      };
    },
  };
};
export async function listDeliverables(userId: string) {
  return rows<Deliverable & { role_title: string; client_name: string }>(
    sql`SELECT d.*,r.title AS role_title,r.client_name FROM hirelix_private_deliverables d JOIN hirelix_private_roles r ON r.id=d.role_id AND r.user_id=d.user_id WHERE d.user_id=${userId}::uuid AND d.kind='submission' ORDER BY d.updated_at DESC`,
  );
}
export async function updateDeliverable(
  userId: string,
  id: string,
  value: unknown,
) {
  const input = z
    .object({
      title: z.string().trim().min(1).max(500),
      content: z.string().max(100000),
      expected_version: z.number().int().positive(),
    })
    .parse(value);
  return db.transaction(async (tx) => {
    const prior = await owned<Deliverable>(userId, "deliverable", id, tx, true);
    expectVersion(prior.version, input.expected_version);
    if (prior.status === "submitted")
      throw new WorkspaceError(
        "This submitted copy is preserved. Prepare a new draft to make further changes.",
        409,
      );
    if (prior.title === input.title && prior.content === input.content)
      return prior;
    const [document] = await rows<Deliverable>(
      sql`UPDATE hirelix_private_deliverables SET title=${input.title},content=${input.content},version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND id=${id}::uuid RETURNING *`,
      tx,
    );
    await snapshot(userId, "deliverable", document, tx);
    return document;
  });
}
export async function markSubmitted(
  userId: string,
  id: string,
  value: unknown,
) {
  const input = z
    .object({
      expected_version: z.number().int().positive(),
      submitted_at: z.iso.datetime({ offset: true }),
      submission_note: z.string().trim().min(1).max(10000),
    })
    .parse(value);
  if (new Date(input.submitted_at) > new Date())
    throw new WorkspaceError(
      "Record when you actually shared this document, not a future date",
    );
  return db.transaction(async (tx) => {
    const prior = await owned<Deliverable>(userId, "deliverable", id, tx, true);
    if (prior.status === "submitted") return prior;
    expectVersion(prior.version, input.expected_version);
    const [document] = await rows<Deliverable>(
      sql`UPDATE hirelix_private_deliverables SET status='submitted',submitted_at=${input.submitted_at}::timestamptz,submission_note=${input.submission_note},version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND id=${id}::uuid RETURNING *`,
      tx,
    );
    await snapshot(userId, "deliverable", document, tx);
    await addRecord(
      userId,
      {
        role_id: document.role_id,
        kind: "event",
        title:
          document.kind === "submission"
            ? "Candidate submission recorded"
            : "Search update delivery recorded",
        content: input.submission_note,
        occurred_at: input.submitted_at,
        details: { deliverable_id: id, deliverable_version: document.version },
      },
      tx,
    );
    return document;
  });
}
