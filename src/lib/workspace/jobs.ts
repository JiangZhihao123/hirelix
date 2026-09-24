import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { json, owned, rows, WorkspaceError, type Runner } from "./database";
import type { Job, JobKind } from "./types";

const LEASE_SECONDS = 120;
export type PreparedJob = {
  result: Record<string, unknown>;
  apply?: (tx: Runner) => Promise<Record<string, unknown> | void>;
};
export type JobHandler = (
  job: Job,
  progress: (message: string) => Promise<void>,
) => Promise<PreparedJob>;
export class LostLease extends Error {
  constructor() {
    super("This task was taken over by another worker");
  }
}
export async function claimJob(kinds: JobKind[]): Promise<Job | null> {
  if (!kinds.length) return null;
  return db.transaction(async (tx) => {
    const [job] = await rows<Job>(
      sql`SELECT * FROM hirelix_private_jobs WHERE status='queued' AND kind IN (${sql.join(
        kinds.map((kind) => sql`${kind}`),
        sql`, `,
      )}) ORDER BY CASE WHEN kind='index' THEN 1 ELSE 0 END,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,
      tx,
    );
    if (!job) return null;
    const [claimed] = await rows<Job>(
      sql`UPDATE hirelix_private_jobs SET status='running',progress='Starting',attempts=attempts+1,lease_token=${randomUUID()}::uuid,lease_until=now()+${LEASE_SECONDS}*interval '1 second',error=NULL,updated_at=now() WHERE id=${job.id}::uuid RETURNING *`,
      tx,
    );
    return claimed;
  });
}
export async function heartbeat(job: Job, message?: string) {
  const updated = await rows(
    sql`UPDATE hirelix_private_jobs SET lease_until=now()+${LEASE_SECONDS}*interval '1 second',progress=coalesce(${message ?? null},progress),updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='running' AND lease_token=${job.lease_token}::uuid AND lease_until>now() RETURNING id`,
  );
  if (!updated.length) throw new LostLease();
}
export async function finishJob(job: Job, prepared: PreparedJob) {
  return db.transaction(async (tx) => {
    const current = await owned<Job>(job.user_id, "job", job.id, tx, true);
    if (
      current.status !== "running" ||
      current.lease_token !== job.lease_token ||
      !current.lease_until ||
      new Date(current.lease_until).getTime() <= Date.now()
    )
      throw new LostLease();
    const applied = await prepared.apply?.(tx);
    const result = { ...prepared.result, ...applied };
    await tx.execute(
      sql`UPDATE hirelix_private_jobs SET status='done',result=${json(result)},progress='Complete',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid`,
    );
    return result;
  });
}
export async function failJob(job: Job, message: string) {
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET status='error',error=${message},progress='Needs attention',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='running' AND lease_token=${job.lease_token}::uuid`,
  );
}
export async function reclaimJobs() {
  return rows<{ id: string; status: string }>(
    sql`UPDATE hirelix_private_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'error' END,progress=CASE WHEN attempts<3 THEN 'Resuming interrupted task' ELSE 'Needs attention' END,error=CASE WHEN attempts<3 THEN NULL ELSE 'This task was interrupted repeatedly. Retry it when the worker is available.' END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status='running' AND lease_until<=now() RETURNING id,status`,
  );
}
export async function retryJob(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const job = await owned<Job>(userId, "job", id, tx, true);
    if (job.status !== "error")
      throw new WorkspaceError("Only failed tasks can be retried", 409);
    const [result] = await rows<Job>(
      sql`UPDATE hirelix_private_jobs SET status='queued',progress='Queued for retry',error=NULL,attempts=0,updated_at=now() WHERE id=${id}::uuid AND user_id=${userId}::uuid RETURNING *`,
      tx,
    );
    return result;
  });
}
export async function processJob(
  handlers: Partial<Record<JobKind, JobHandler>>,
) {
  const job = await claimJob(Object.keys(handlers) as JobKind[]);
  if (!job) return false;
  let leaseLost = false,
    heartbeatRunning = false;
  const timer = setInterval(async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      await heartbeat(job);
    } catch {
      leaseLost = true;
    } finally {
      heartbeatRunning = false;
    }
  }, 30000);
  try {
    const prepared = await handlers[job.kind]!(job, async (message) => {
      if (leaseLost) throw new LostLease();
      await heartbeat(job, message);
    });
    if (leaseLost) throw new LostLease();
    await finishJob(job, prepared);
  } catch (error) {
    if (!(error instanceof LostLease))
      await failJob(
        job,
        error instanceof WorkspaceError
          ? error.message
          : "This task could not finish. Your source material is saved. Retry the task or review the input.",
      );
  } finally {
    clearInterval(timer);
  }
  return true;
}
