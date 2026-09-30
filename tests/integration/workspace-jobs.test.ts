import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { enqueue, owned, rows } from "../../src/lib/workspace/database";
import {
  claimJob,
  finishJob,
  reclaimJobs,
  retryJob,
  LostLease,
  heartbeat,
  failJob,
  processJob,
} from "../../src/lib/workspace/jobs";
import type { Job } from "../../src/lib/workspace/types";
const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_")
)
  throw new Error("Use an isolated local workspace QA database");
const owner = randomUUID();
after(async () => {
  await closeDb();
});

test("real queue: concurrent claims are distinct; expired worker cannot commit or renew", async () => {
  const jobs = await Promise.all([
    enqueue(owner, "retrieval", randomUUID(), { query: "one" }),
    enqueue(owner, "retrieval", randomUUID(), { query: "two" }),
  ]);
  const [first, second] = await Promise.all([
    claimJob(["retrieval"]),
    claimJob(["retrieval"]),
  ]);
  assert(first && second);
  assert.notEqual(first.id, second.id);
  assert(jobs.some((job) => job.id === first.id));
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET lease_until=now()-interval '1 second' WHERE id=${first.id}::uuid`,
  );
  await assert.rejects(() => heartbeat(first), LostLease);
  let wrote = false;
  await assert.rejects(
    () =>
      finishJob(first, {
        result: {},
        apply: async () => {
          wrote = true;
        },
      }),
    LostLease,
  );
  assert.equal(wrote, false);
  const reclaimed = await reclaimJobs();
  assert(
    reclaimed.some((job) => job.id === first.id && job.status === "queued"),
  );
  const resumed = await claimJob(["retrieval"]);
  assert(resumed);
  assert.equal(resumed.id, first.id);
  assert.notEqual(resumed.lease_token, first.lease_token);
  await finishJob(resumed, { result: { message: "Recovered" } });
  await failJob(first, "Stale worker error");
  assert.equal((await owned<Job>(owner, "job", first.id)).status, "done");
  await finishJob(second, { result: { message: "Second complete" } });
  await assert.rejects(() => retryJob(owner, first.id));
});

test("real queue: repeated interruption is visible and manual retry keeps the same identity", async () => {
  const created = await enqueue(owner, "retrieval", randomUUID(), {
    query: "retry",
  });
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET status='running',attempts=3,lease_token=${randomUUID()}::uuid,lease_until=now()-interval '1 second' WHERE id=${created.id}::uuid`,
  );
  await reclaimJobs();
  const failed = await owned<Job>(owner, "job", created.id);
  assert.equal(failed.status, "error");
  assert(failed.error);
  await assert.rejects(() => retryJob(randomUUID(), created.id));
  const retried = await retryJob(owner, created.id);
  assert.equal(retried.id, created.id);
  assert.equal(retried.status, "queued");
  assert.equal(retried.attempts, 0);
  const claimed = await claimJob(["retrieval"]);
  assert(claimed);
  await finishJob(claimed, { result: { recovered: true } });
  const [count] = await rows<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND request_key=${created.request_key}`,
  );
  assert.equal(count.count, 1);
});

test("real queue: handler failure preserves a safe visible error and can be retried once", async () => {
  const created = await enqueue(owner, "assessment", randomUUID(), {});
  await processJob({ assessment: async () => {
    throw new Error("QA_SECRET_PROVIDER_PAYLOAD_DO_NOT_LOG");
  } });
  const failed = await owned<Job>(owner, "job", created.id);
  assert.equal(failed.status, "error");
  assert.equal(failed.lease_token, null);
  assert.equal(failed.lease_until, null);
  assert.match(failed.error ?? "", /source material is saved/);
  assert.doesNotMatch(failed.error ?? "", /QA_SECRET/);
  const retried = await retryJob(owner, created.id);
  assert.equal(retried.id, created.id);
  await processJob({ assessment: async () => ({ result: { recovered: true } }) });
  const recovered = await owned<Job>(owner, "job", created.id);
  assert.equal(recovered.status, "done");
  assert.deepEqual(recovered.result, { recovered: true });
});
