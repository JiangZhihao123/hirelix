import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { enqueue, rows } from "../../src/lib/workspace/database";
import { claimJob, finishJob } from "../../src/lib/workspace/jobs";
import { createPerson } from "../../src/lib/workspace/people";
import { createRole } from "../../src/lib/workspace/roles";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real PG: concurrent pending index requests coalesce without losing a successor to running work", async () => {
  const person = await createPerson(owner, {name: `Index queue ${owner}`});
  const jobs = await Promise.all(Array.from({length: 20}, () => enqueue(owner, "index", randomUUID(), {person_id: person.id})));
  assert.equal(new Set(jobs.map(job => job.id)).size, 1);
  const first = jobs[0];
  let locked!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => {locked = resolve;});
  const gate = new Promise<void>(resolve => {release = resolve;});
  const held = db.transaction(async tx => {
    const queued = await enqueue(owner, "index", randomUUID(), {person_id: person.id}, tx);
    assert.equal(queued.id, first.id);
    locked();
    await gate;
  });
  await ready;
  assert.equal(await claimJob(["index"], {id: first.id, userId: owner}), null, "a worker cannot claim an index before the source transaction commits");
  release();
  await held;
  const running = await claimJob(["index"], {id: first.id, userId: owner});
  assert.ok(running);
  const successors = await Promise.all(Array.from({length: 10}, () => enqueue(owner, "index", randomUUID(), {person_id: person.id})));
  assert.equal(new Set(successors.map(job => job.id)).size, 1);
  assert.notEqual(successors[0].id, running.id, "a running snapshot must have a queued successor");
  await finishJob(running, {result: {tested: true}});
  const [pending] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued' AND payload->>'person_id'=${person.id}`);
  assert.equal(pending.count, 1);
  const role = await createRole(owner, {title: `Index role ${owner}`, client_name: "QA", jd_text: "Role description"});
  const [rolePending] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued' AND payload->>'role_id'=${role.id}`);
  assert.equal(rolePending.count, 1, "the role and its source share one queued indexing job");
});
