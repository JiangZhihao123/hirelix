import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  enqueue,
  expectVersion,
  json,
  owned,
  rows,
  snapshot,
  WorkspaceError,
  type Runner,
} from "./database";
import { recordInput, type SourceRecord } from "./types";
import type { Deliverable } from "./types";
import { recommendationFeedbackContext } from "./recommendation-feedback-contract";

export async function addRecord(
  userId: string,
  value: unknown,
  runner?: Runner,
) {
  const input = recordInput.parse(value);
  if (!input.person_id && !input.role_id)
    throw new WorkspaceError("Choose a candidate or role for this record");
  const run = async (tx: Runner) => {
    if (input.person_id) await owned(userId, "person", input.person_id, tx);
    if (input.role_id) await owned(userId, "role", input.role_id, tx);
    if (input.file_id) {
      // File ownership is enough here; loading the original bytes for every
      // record would repeatedly transfer large source files during a batch.
      const [file] = await rows<{id: string}>(sql`SELECT id FROM hirelix_private_files WHERE user_id=${userId}::uuid AND id=${input.file_id}::uuid AND upload_id IS NULL`, tx);
      if (!file) throw new WorkspaceError("This item was not found", 404);
    }
    if (input.details.recommendation_id) {
      const feedback = recommendationFeedbackContext.parse(input.details);
      const document = await owned<Deliverable>(userId, "deliverable", feedback.recommendation_id, tx);
      if (input.kind !== "feedback" || document.kind !== "submission" || !input.person_id || input.role_id !== document.role_id || !document.person_ids.includes(input.person_id) || document.source_snapshot.audience === "internal")
        throw new WorkspaceError("Feedback must refer to a candidate in this client recommendation and its role.");
    }
    const [record] = await rows<SourceRecord>(
      sql`INSERT INTO hirelix_private_records(user_id,person_id,role_id,file_id,kind,title,content,source_url,occurred_at,details) VALUES(${userId}::uuid,${input.person_id}::uuid,${input.role_id}::uuid,${input.file_id}::uuid,${input.kind},${input.title},${input.content},${input.source_url},${input.occurred_at}::timestamptz,${json(input.details)}) RETURNING *`,
      tx,
    );
    await snapshot(userId, "record", record, tx);
    if (input.person_id)
      await enqueue(
        userId,
        "index",
        `index:${input.person_id}:${randomUUID()}`,
        { person_id: input.person_id },
        tx,
      );
    if (record.role_id && !record.person_id) await enqueue(userId, "index", `role-index:${record.role_id}:${randomUUID()}`, { role_id: record.role_id }, tx);
    return record;
  };
  return runner ? run(runner) : db.transaction(run);
}
export async function updateRecord(
  userId: string,
  id: string,
  value: unknown,
  expectedVersion: number,
  runner?: Runner,
) {
  const input = recordInput.parse(value);
  const run = async (tx: Runner) => {
    const prior = await owned<SourceRecord>(userId, "record", id, tx, true);
    expectVersion(prior.version, expectedVersion);
    if (
      input.person_id !== prior.person_id ||
      input.role_id !== prior.role_id ||
      input.file_id !== prior.file_id
    )
      throw new WorkspaceError(
        "A source's association cannot be changed while editing its text",
      );
    const [record] = await rows<SourceRecord>(
      sql`UPDATE hirelix_private_records SET kind=${input.kind},title=${input.title},content=${input.content},source_url=${input.source_url},occurred_at=${input.occurred_at}::timestamptz,details=${json(input.details)},version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND id=${id}::uuid RETURNING *`,
      tx,
    );
    await snapshot(userId, "record", record, tx);
    if (record.person_id)
      await enqueue(
        userId,
        "index",
        `index:${record.person_id}:${randomUUID()}`,
        { person_id: record.person_id },
        tx,
      );
    if (record.role_id && !record.person_id) await enqueue(userId, "index", `role-index:${record.role_id}:${randomUUID()}`, { role_id: record.role_id }, tx);
    return record;
  };
  return runner ? run(runner) : db.transaction(run);
}

/** Reuse an observed original resume source; do not import or rewrite the person. */
export async function registerCandidateCv(userId: string, personId: string, recordId: string, expectedVersion: number, tx: Runner) {
  await owned(userId, "person", personId, tx);
  const record = await owned<SourceRecord>(userId, "record", recordId, tx, true);
  expectVersion(record.version, expectedVersion);
  if (record.person_id !== personId || !["profile", "cv", "attachment"].includes(record.kind) || !record.file_id)
    throw new WorkspaceError("Choose this candidate's saved resume source with its original file.");
  const [file] = await rows<{name:string;media_type:string}>(sql`SELECT name,media_type FROM hirelix_private_files WHERE user_id=${userId}::uuid AND id=${record.file_id}::uuid`,tx);
  if (!file) throw new WorkspaceError("This original file was not found",404);
  if (!["pdf", "docx", "txt", "md"].includes(file.name.split(".").pop()?.toLowerCase() || "") &&
      !(!file.name.includes(".") && file.media_type === "application/pdf"))
    throw new WorkspaceError("Original CV attachments support PDF, DOCX, TXT or Markdown files.");
  if (record.kind === "cv") return record;
  return updateRecord(userId,record.id,{
    ...record, kind:"cv", title:file.name,
    occurred_at:record.occurred_at ? new Date(record.occurred_at).toISOString() : null,
  },record.version,tx);
}
