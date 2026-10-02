import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { reserveAgentCredits } from "@/lib/agent-access";
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
): Promise<Job> {
  if (runner === db) return db.transaction((tx) => enqueue(userId, kind, key, payload, tx));
  const inserted = await rows<Job>(
    sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload) VALUES(${userId}::uuid,${kind},${key},${json(payload)}) ON CONFLICT(user_id,request_key) DO NOTHING RETURNING *`,
    runner,
  );
  const job = inserted[0] || (await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND request_key=${key}`, runner))[0];
  const [same] = await rows<{ matches: boolean }>(
    sql`SELECT payload=${json(payload)} AND kind=${kind} AS matches FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND id=${job.id}::uuid`,
    runner,
  );
  if (!same.matches)
    throw new WorkspaceError(
      "This request key was already used for a different operation",
      409,
    );
  // Internal indexing and a chat's follow-on import are included in the parent task.
  if (inserted.length && !(await isIncludedTask(job, runner))) {
    const reserved = await reserveAgentCredits(userId, job.id, runner);
    if (reserved === false) throw new WorkspaceError("Your AI credit allowance has ended. Your saved work is still available. Open Settings → Billing to subscribe or check your allowance.", 402);
  }
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

// Only an internal import linked to its real parent chat is included for free.
export async function isIncludedTask(job: Job, runner: Runner = db): Promise<boolean> {
  if (job.kind === "index") return true;
  if (job.kind !== "import" || !job.request_key.startsWith("assistant-import:")) return false;
  const parentId = job.request_key.slice("assistant-import:".length).split(":")[0];
  const parents = await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${job.user_id}::uuid AND id::text=${parentId} AND kind='chat' AND payload->>'message_id'=${String(job.payload.source_message_id || "")} AND payload->>'conversation_id'=${String(job.payload.conversation_id || "")}`, runner);
  return parents.length > 0;
}
