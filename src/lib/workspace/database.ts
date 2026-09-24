import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import type { Job, JobKind } from "./types";

export type Runner = Pick<typeof db, "execute">;
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}
export async function rows<T>(query: SQL, runner: Runner = db): Promise<T[]> {
  return (await runner.execute(query)) as unknown as T[];
}
export function json(value: unknown) {
  return sql`${JSON.stringify(value)}::jsonb`;
}
export function uuidArray(ids: string[]) {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
}
export function textArray(values: string[]) {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}
export const tables = {
  person: "hirelix_agent_people",
  role: "hirelix_private_roles",
  record: "hirelix_private_records",
  deliverable: "hirelix_private_deliverables",
  conversation: "hirelix_private_conversations",
  file: "hirelix_private_files",
  job: "hirelix_private_jobs",
  role_candidate: "hirelix_private_role_candidates",
} as const;
export type EntityKind = keyof typeof tables;
export async function owned<T>(
  userId: string,
  kind: EntityKind,
  id: string,
  runner: Runner = db,
  lock = false,
): Promise<T> {
  const [item] = await rows<T>(
    sql`SELECT * FROM ${sql.identifier(tables[kind])} WHERE user_id=${userId}::uuid AND id=${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`,
    runner,
  );
  if (!item) throw new WorkspaceError("This item was not found", 404);
  return item;
}
export function expectVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new WorkspaceError(
      "This item changed in another window. Reload it before saving; your edits have been kept.",
      409,
    );
}
export async function snapshot(
  userId: string,
  kind: "person" | "role" | "record" | "deliverable" | "role_candidate",
  item: { id: string; version: number },
  runner: Runner = db,
) {
  await runner.execute(
    sql`INSERT INTO hirelix_private_versions(user_id,entity_type,entity_id,version,snapshot) VALUES(${userId}::uuid,${kind},${item.id}::uuid,${item.version},${json(item)}) ON CONFLICT DO NOTHING`,
  );
}
export async function enqueue(
  userId: string,
  kind: JobKind,
  key: string,
  payload: Record<string, unknown>,
  runner: Runner = db,
) {
  const [job] = await rows<Job>(
    sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload) VALUES(${userId}::uuid,${kind},${key},${json(payload)}) ON CONFLICT(user_id,request_key) DO UPDATE SET request_key=excluded.request_key RETURNING *`,
    runner,
  );
  const [same] = await rows<{ matches: boolean }>(
    sql`SELECT payload=${json(payload)} AND kind=${kind} AS matches FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND id=${job.id}::uuid`,
    runner,
  );
  if (!same.matches)
    throw new WorkspaceError(
      "This request key was already used for a different operation",
      409,
    );
  return job;
}
export async function listVersions(
  userId: string,
  kind: "person" | "role" | "record" | "deliverable" | "role_candidate",
  id: string,
) {
  await owned(userId, kind, id);
  return rows<{
    id: string;
    version: number;
    snapshot: Record<string, unknown>;
    created_at: string;
  }>(
    sql`SELECT id,version,snapshot,created_at FROM hirelix_private_versions WHERE user_id=${userId}::uuid AND entity_type=${kind} AND entity_id=${id}::uuid ORDER BY version DESC`,
  );
}
