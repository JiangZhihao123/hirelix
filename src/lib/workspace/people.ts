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
  textArray,
  WorkspaceError,
  type Runner,
} from "./database";
import { personInput, type Person, type SourceRecord } from "./types";
import { addRecord } from "./records";

export async function listPeople(
  userId: string,
  query = "",
  page = 1,
  location = "",
  expertise = "",
) {
  const match = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const conditions = sql`p.user_id=${userId}::uuid AND (${!query} OR concat_ws(' ',p.name,p.headline,p.email,p.location,p.note,p.skills::text,p.profile::text) ILIKE ${match} OR EXISTS(SELECT 1 FROM hirelix_private_records r WHERE r.user_id=p.user_id AND r.person_id=p.id AND r.content ILIKE ${match})) AND (${!location} OR p.location=${location}) AND (${!expertise} OR ${expertise}=ANY(p.skills))`;
  const [count] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_agent_people p WHERE ${conditions}`,
  );
  const people = await rows<Person & { last_contact: string | null }>(
    sql`SELECT p.*,(SELECT max(r.occurred_at) FROM hirelix_private_records r WHERE r.user_id=p.user_id AND r.person_id=p.id AND r.kind IN ('call','email')) AS last_contact FROM hirelix_agent_people p WHERE ${conditions} ORDER BY p.updated_at DESC,p.id LIMIT 50 OFFSET ${(page - 1) * 50}`,
  );
  return { people, total: count.total, page, page_size: 50 };
}
export async function personDetails(userId: string, id: string) {
  const person = await owned<Person>(userId, "person", id);
  const [records, roles] = await Promise.all([
    rows<SourceRecord>(
      sql`SELECT * FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${id}::uuid ORDER BY occurred_at DESC NULLS LAST,created_at DESC`,
    ),
    rows(
      sql`SELECT rc.*,r.title,r.client_name,r.version AS current_role_version,r.status AS role_status FROM hirelix_private_role_candidates rc JOIN hirelix_private_roles r ON r.user_id=rc.user_id AND r.id=rc.role_id WHERE rc.user_id=${userId}::uuid AND rc.person_id=${id}::uuid ORDER BY rc.updated_at DESC`,
    ),
  ]);
  return { person, records, roles };
}
export async function createPerson(
  userId: string,
  value: unknown,
  runner?: Runner,
) {
  const input = personInput.parse(value);
  const run = async (tx: Runner) => {
    const [person] = await rows<Person>(
      sql`INSERT INTO hirelix_agent_people(user_id,name,headline,location,email,phone,skills,profile_url,note,profile,source_evidence) VALUES(${userId}::uuid,${input.name},${input.headline},${input.location},${input.email},${input.phone},${textArray(input.skills)},${input.profile_url},${input.note},${json(input.profile)},${json({ kind: "recruiter_entry" })}) RETURNING *`,
      tx,
    );
    await snapshot(userId, "person", person, tx);
    if (input.note)
      await addRecord(
        userId,
        {
          person_id: person.id,
          kind: "note",
          title: "Recruiter note",
          content: input.note,
        },
        tx,
      );
    await enqueue(
      userId,
      "index",
      `index:${person.id}:${randomUUID()}`,
      { person_id: person.id },
      tx,
    );
    return person;
  };
  return runner ? run(runner) : db.transaction(run);
}
export async function updatePerson(
  userId: string,
  id: string,
  value: unknown,
  expectedVersion: number,
  runner?: Runner,
) {
  const input = personInput.parse(value);
  const run = async (tx: Runner) => {
    const prior = await owned<Person>(userId, "person", id, tx, true);
    expectVersion(prior.version, expectedVersion);
    const [person] = await rows<Person>(
      sql`UPDATE hirelix_agent_people SET name=${input.name},headline=${input.headline},location=${input.location},email=${input.email},phone=${input.phone},skills=${textArray(input.skills)},profile_url=${input.profile_url},note=${input.note},profile=${json(input.profile)},version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND id=${id}::uuid RETURNING *`,
      tx,
    );
    await snapshot(userId, "person", person, tx);
    if (input.note && input.note !== prior.note)
      await addRecord(
        userId,
        {
          person_id: id,
          kind: "note",
          title: "Updated recruiter note",
          content: input.note,
        },
        tx,
      );
    await enqueue(
      userId,
      "index",
      `index:${id}:${randomUUID()}`,
      { person_id: id },
      tx,
    );
    return person;
  };
  return runner ? run(runner) : db.transaction(run);
}

// The caller chooses the fields to retain. Identity similarity never performs an automatic merge.
export async function mergePeople(
  userId: string,
  targetId: string,
  sourceId: string,
  value: unknown,
  expectedVersion: number,
  sourceVersion: number,
) {
  if (targetId === sourceId)
    throw new WorkspaceError("Choose two different candidates");
  return db.transaction(async (tx) => {
    // Lock in stable order to avoid opposite concurrent merges deadlocking.
    const ordered = [targetId, sourceId].sort();
    for (const id of ordered) await owned(userId, "person", id, tx, true);
    const source = await owned<Person>(userId, "person", sourceId, tx);
    expectVersion(source.version, sourceVersion);
    const target = await updatePerson(
      userId,
      targetId,
      value,
      expectedVersion,
      tx,
    );
    await tx.execute(
      sql`UPDATE hirelix_private_records SET person_id=${targetId}::uuid,updated_at=now() WHERE user_id=${userId}::uuid AND person_id=${sourceId}::uuid`,
    );
    const links = await rows<{ role_id: string }>(
      sql`SELECT role_id FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND person_id=${sourceId}::uuid`,
      tx,
    );
    for (const link of links) {
      const [prior] = await rows(
        sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND person_id=${sourceId}::uuid AND role_id=${link.role_id}::uuid`,
        tx,
      );
      await tx.execute(
        sql`INSERT INTO hirelix_private_records(user_id,person_id,role_id,kind,title,content,details) VALUES(${userId}::uuid,${targetId}::uuid,${link.role_id}::uuid,'note','Merged candidate role context',${JSON.stringify(prior)},${json({ merged_from: sourceId })})`,
      );
    }
    await tx.execute(
      sql`INSERT INTO hirelix_private_role_candidates(user_id,role_id,person_id,assessment,assessed_role_version,permission,permission_record_id,interest,notes) SELECT user_id,role_id,${targetId}::uuid,assessment,assessed_role_version,permission,permission_record_id,interest,notes FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND person_id=${sourceId}::uuid ON CONFLICT DO NOTHING`,
    );
    await tx.execute(
      sql`DELETE FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND person_id=${sourceId}::uuid`,
    );
    await tx.execute(
      sql`UPDATE hirelix_private_conversations SET person_id=${targetId}::uuid WHERE user_id=${userId}::uuid AND person_id=${sourceId}::uuid`,
    );
    await tx.execute(
      sql`UPDATE hirelix_private_import_rows SET target_person_id=${targetId}::uuid WHERE user_id=${userId}::uuid AND target_person_id=${sourceId}::uuid`,
    );
    await tx.execute(
      sql`INSERT INTO hirelix_private_records(user_id,person_id,kind,title,content,details) VALUES(${userId}::uuid,${targetId}::uuid,'profile','Merged candidate archive',${JSON.stringify(source)},${json({ merged_from: sourceId })})`,
    );
    // Preserve all previous profile versions under the surviving candidate as source material.
    const history = await rows(
      sql`SELECT version,snapshot,created_at FROM hirelix_private_versions WHERE user_id=${userId}::uuid AND entity_type='person' AND entity_id=${sourceId}::uuid ORDER BY version`,
      tx,
    );
    if (history.length)
      await tx.execute(
        sql`INSERT INTO hirelix_private_records(user_id,person_id,kind,title,content) VALUES(${userId}::uuid,${targetId}::uuid,'profile','Merged profile history',${JSON.stringify(history)})`,
      );
    await tx.execute(
      sql`DELETE FROM hirelix_private_versions WHERE user_id=${userId}::uuid AND entity_type='person' AND entity_id=${sourceId}::uuid`,
    );
    await tx.execute(
      sql`DELETE FROM hirelix_agent_people WHERE user_id=${userId}::uuid AND id=${sourceId}::uuid`,
    );
    await enqueue(
      userId,
      "index",
      `index:${targetId}:${randomUUID()}`,
      { person_id: targetId },
      tx,
    );
    return target;
  });
}

export async function deletePerson(
  userId: string,
  id: string,
  expectedVersion: number,
) {
  return db.transaction(async (tx) => {
    const person = await owned<Person>(userId, "person", id, tx, true);
    expectVersion(person.version, expectedVersion);
    await tx.execute(
      sql`DELETE FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND person_id=${id}::uuid`,
    );
    await tx.execute(
      sql`UPDATE hirelix_private_role_candidates SET permission_record_id=NULL,permission='unknown' WHERE user_id=${userId}::uuid AND permission_record_id IN (SELECT id FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${id}::uuid)`,
    );
    await tx.execute(
      sql`UPDATE hirelix_private_conversations SET person_id=NULL WHERE user_id=${userId}::uuid AND person_id=${id}::uuid`,
    );
    await tx.execute(
      sql`UPDATE hirelix_private_import_rows SET target_person_id=NULL,extracted='{}',raw_text='',matches='[]' WHERE user_id=${userId}::uuid AND (target_person_id=${id}::uuid OR result_person_id=${id}::uuid)`,
    );
    const files = await rows<{ file_id: string }>(
      sql`SELECT DISTINCT file_id FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${id}::uuid AND file_id IS NOT NULL`,
      tx,
    );
    await tx.execute(
      sql`DELETE FROM hirelix_private_versions WHERE user_id=${userId}::uuid AND ((entity_type='person' AND entity_id=${id}::uuid) OR (entity_type='record' AND entity_id IN (SELECT id FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${id}::uuid)))`,
    );
    await tx.execute(
      sql`DELETE FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${id}::uuid`,
    );
    await tx.execute(
      sql`DELETE FROM hirelix_agent_people WHERE user_id=${userId}::uuid AND id=${id}::uuid`,
    );
    for (const { file_id } of files) {
      const [used] = await rows<{ used: boolean }>(
        sql`SELECT EXISTS(SELECT 1 FROM hirelix_private_records WHERE user_id=${userId}::uuid AND file_id=${file_id}::uuid) AS used`,
        tx,
      );
      if (!used.used) {
        await tx.execute(
          sql`UPDATE hirelix_private_import_rows SET file_id=NULL WHERE user_id=${userId}::uuid AND file_id=${file_id}::uuid`,
        );
        await tx.execute(
          sql`DELETE FROM hirelix_private_files WHERE user_id=${userId}::uuid AND id=${file_id}::uuid`,
        );
      }
    }
    return { deleted: true };
  });
}
