import { sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { db } from "@/db/client";
import {
  expectVersion,
  json,
  owned,
  rows,
  snapshot,
  WorkspaceError,
} from "./database";
import { addRecord } from "./records";
import {
  roleInput,
  type Role,
  type RoleCandidate,
  type SourceRecord,
  type Deliverable,
  type Schedule,
} from "./types";

export async function listRoles(userId: string) {
  return rows<Role & { candidate_count: number; submission_count: number }>(
    sql`SELECT r.*,(SELECT count(*)::int FROM hirelix_private_role_candidates c WHERE c.user_id=r.user_id AND c.role_id=r.id) AS candidate_count,(SELECT count(*)::int FROM hirelix_private_deliverables d WHERE d.user_id=r.user_id AND d.role_id=r.id AND d.kind='submission' AND d.status='submitted') AS submission_count FROM hirelix_private_roles r WHERE r.user_id=${userId}::uuid ORDER BY r.updated_at DESC,r.id`,
  );
}
export async function roleDetails(userId: string, id: string) {
  const role = await owned<Role>(userId, "role", id);
  const [people, records, deliverables, schedules] = await Promise.all([
    rows<RoleCandidate>(
      sql`SELECT rc.*,to_jsonb(p) AS person FROM hirelix_private_role_candidates rc JOIN hirelix_agent_people p ON p.user_id=rc.user_id AND p.id=rc.person_id WHERE rc.user_id=${userId}::uuid AND rc.role_id=${id}::uuid ORDER BY rc.created_at`,
    ),
    rows<SourceRecord>(
      sql`SELECT * FROM hirelix_private_records WHERE user_id=${userId}::uuid AND role_id=${id}::uuid ORDER BY occurred_at DESC NULLS LAST,created_at DESC`,
    ),
    rows<Deliverable>(
      sql`SELECT * FROM hirelix_private_deliverables WHERE user_id=${userId}::uuid AND role_id=${id}::uuid ORDER BY created_at DESC`,
    ),
    rows<Schedule>(
      sql`SELECT * FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND role_id=${id}::uuid`,
    ),
  ]);
  return {
    role,
    people,
    records,
    deliverables,
    schedule: schedules[0] ?? null,
  };
}
export async function createRole(userId: string, value: unknown) {
  const input = roleInput.parse(value);
  return db.transaction(async (tx) => {
    const [role] = await rows<Role>(
      sql`INSERT INTO hirelix_private_roles(user_id,title,client_name,jd_text,brief,client_contact,status) VALUES(${userId}::uuid,${input.title},${input.client_name},${input.jd_text},${json(input.brief)},${json(input.client_contact)},${input.status}) RETURNING *`,
      tx,
    );
    await snapshot(userId, "role", role, tx);
    await addRecord(
      userId,
      {
        role_id: role.id,
        kind: "jd",
        title: "Original JD",
        content: input.jd_text,
        details: { role_version: 1 },
      },
      tx,
    );
    return role;
  });
}
export async function updateRole(
  userId: string,
  id: string,
  value: unknown,
  expectedVersion: number,
) {
  const input = roleInput.parse(value);
  return db.transaction(async (tx) => {
    const prior = await owned<Role>(userId, "role", id, tx, true);
    expectVersion(prior.version, expectedVersion);
    const [role] = await rows<Role>(
      sql`UPDATE hirelix_private_roles SET title=${input.title},client_name=${input.client_name},jd_text=${input.jd_text},brief=${json(input.brief)},client_contact=${json(input.client_contact)},status=${input.status},version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND id=${id}::uuid RETURNING *`,
      tx,
    );
    await snapshot(userId, "role", role, tx);
    if (
      prior.jd_text !== role.jd_text ||
      !isDeepStrictEqual(prior.brief, role.brief)
    ) {
      await addRecord(
        userId,
        {
          role_id: id,
          kind: "jd",
          title: `Role requirements updated · Version ${role.version}`,
          content: role.jd_text,
          occurred_at: new Date().toISOString(),
          details: { role_version: role.version, brief: role.brief },
        },
        tx,
      );
    }
    if (prior.status !== role.status)
      await addRecord(
        userId,
        {
          role_id: id,
          kind: "event",
          title: `Role ${role.status}`,
          content: `The recruiter changed this role from ${prior.status} to ${role.status}.`,
          occurred_at: new Date().toISOString(),
        },
        tx,
      );
    // Schedules remain configured; the dispatcher checks current role status before every run.
    return role;
  });
}
export async function linkPerson(
  userId: string,
  roleId: string,
  personId: string,
) {
  return db.transaction(async (tx) => {
    await owned(userId, "role", roleId, tx);
    await owned(userId, "person", personId, tx);
    const [link] = await rows<RoleCandidate>(
      sql`INSERT INTO hirelix_private_role_candidates(user_id,role_id,person_id) VALUES(${userId}::uuid,${roleId}::uuid,${personId}::uuid) ON CONFLICT(user_id,role_id,person_id) DO UPDATE SET person_id=excluded.person_id RETURNING *`,
      tx,
    );
    await snapshot(userId, "role_candidate", link, tx);
    return link;
  });
}
export const relationshipInput = z.object({
  permission: z.enum(["unknown", "confirmed", "declined"]),
  permission_record_id: z.uuid().nullable(),
  interest: z.string().max(5000),
  notes: z.string().max(20000),
  expected_version: z.number().int().positive(),
});
export async function updateRelationship(
  userId: string,
  roleId: string,
  personId: string,
  value: unknown,
) {
  const input = relationshipInput.parse(value);
  return db.transaction(async (tx) => {
    const [prior] = await rows<RoleCandidate>(
      sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid AND person_id=${personId}::uuid FOR UPDATE`,
      tx,
    );
    if (!prior)
      throw new WorkspaceError("Candidate is not linked to this role", 404);
    expectVersion(prior.version, input.expected_version);
    if (input.permission !== "unknown" && !input.permission_record_id)
      throw new WorkspaceError(
        "Add the record supporting this sharing decision",
      );
    if (input.permission_record_id) {
      const source = await owned<SourceRecord>(
        userId,
        "record",
        input.permission_record_id,
        tx,
      );
      if (source.person_id !== personId || source.role_id !== roleId)
        throw new WorkspaceError(
          "Use a record for this candidate and this role",
        );
    }
    const [link] = await rows<RoleCandidate>(
      sql`UPDATE hirelix_private_role_candidates SET permission=${input.permission},permission_record_id=${input.permission_record_id}::uuid,interest=${input.interest},notes=${input.notes},version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid AND person_id=${personId}::uuid RETURNING *`,
      tx,
    );
    await snapshot(userId, "role_candidate", link, tx);
    return link;
  });
}
