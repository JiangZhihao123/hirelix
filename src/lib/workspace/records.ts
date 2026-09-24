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
    if (input.file_id) await owned(userId, "file", input.file_id, tx);
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
    return record;
  };
  return runner ? run(runner) : db.transaction(run);
}
export async function updateRecord(
  userId: string,
  id: string,
  value: unknown,
  expectedVersion: number,
) {
  const input = recordInput.parse(value);
  return db.transaction(async (tx) => {
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
    return record;
  });
}
