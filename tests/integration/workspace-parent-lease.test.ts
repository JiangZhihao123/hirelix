import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { enqueue, owned } from "../../src/lib/workspace/database";
import { sendMessage } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat, reclaimJobs, LostLease, processJob, cancelJob } from "../../src/lib/workspace/jobs";
import { completeAgentWork } from "../../src/lib/workspace/agent-execution";
import { agentCreditContext } from "../../src/lib/agent-credit-context";
import { setTimeout as delay } from "node:timers/promises";
import type { Job } from "../../src/lib/workspace/types";

const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port !== "15432" && url.pathname.startsWith("/hirelix_workspace_qa_"));
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real PG: child work cannot renew or commit under a replacement parent lease", async () => {
  const sent = await sendMessage(owner, { message: "Save the internal briefing", request_key: randomUUID() });
  const parent = await claimJob(["chat"], { id: sent.job.id, userId: owner });
  assert(parent);
  const child = await enqueue(owner, "import", randomUUID(), { parent_chat_job_id: parent.id });
  const active = await claimJob(["import"], { id: child.id, userId: owner });
  assert(active);
  await db.execute(sql`UPDATE hirelix_private_jobs SET lease_until=now()-interval '1 second' WHERE id=${parent.id}::uuid`);
  await reclaimJobs();
  const replacement = await claimJob(["chat"], { id: parent.id, userId: owner });
  assert(replacement);
  assert.notEqual(replacement.lease_token, parent.lease_token);
  let applied = false;
  await assert.rejects(() => finishJob(active, { result: {}, apply: async () => { applied = true; } }), LostLease);
  assert.equal(applied, false);
  await assert.rejects(() => heartbeat(active), LostLease);
  await db.execute(sql`UPDATE hirelix_private_jobs SET lease_until=now()-interval '1 second' WHERE id=${child.id}::uuid`);
  await reclaimJobs();
  const resumed = await claimJob(["import"], { id: child.id, userId: owner });
  assert(resumed);
  await finishJob(resumed, { result: { recovered: true } });
  await finishJob(replacement, { result: {} });
  assert.equal((await owned<Job>(owner, "job", child.id)).status, "done");
});

test("real PG: child remains queued while its parent is waiting for a worker", async () => {
  const sent = await sendMessage(owner, { message: "Prepare a briefing", request_key: randomUUID() });
  const child = await enqueue(owner, "import", randomUUID(), { parent_chat_job_id: sent.job.id });
  assert.equal(await claimJob(["import"], { id: child.id, userId: owner }), null);
  const parent = await claimJob(["chat"], { id: sent.job.id, userId: owner });
  assert(parent);
  const active = await claimJob(["import"], { id: child.id, userId: owner });
  assert(active);
  await finishJob(active, { result: {} });
  await finishJob(parent, { result: {} });
});

test("real PG, controlled handler: parent and inline child survive 125 seconds without progress or repeated work", { timeout: 145000 }, async () => {
  const sent = await sendMessage(owner, { message: "Prepare an internal briefing", request_key: randomUUID() });
  let executions = 0, applies = 0, childId = "";
  const samples: Array<{parent: Job; child: Job}> = [];
  let sampling: Promise<void> | undefined;
  const sample = setInterval(() => {
    if (!childId || sampling) return;
    sampling = (async () => {
      await reclaimJobs();
      samples.push({parent: await owned<Job>(owner, "job", sent.job.id), child: await owned<Job>(owner, "job", childId)});
    })().finally(() => { sampling = undefined; });
  }, 1000);
  try {
    await processJob({ chat: async parent => {
      const child = await enqueue(owner, "import", randomUUID(), { parent_chat_job_id: parent.id });
      childId = child.id;
      const work = await completeAgentWork(parent, child.id, async () => {
        executions++;
        await delay(125000, undefined, { signal: agentCreditContext.getStore()!.signal });
        return { result: { prepared: true }, apply: async tx => {
          applies++;
          await tx.execute(sql`INSERT INTO hirelix_private_records(user_id,kind,title,content) VALUES(${owner}::uuid,'note',${`lease-proof:${child.id}`},'Completed after 125 seconds')`);
        } };
      }, agentCreditContext.getStore()!.signal!);
      assert.equal(work.status, "done");
      return { result: { child_id: child.id } };
    } });
  } finally { clearInterval(sample); await sampling; }
  assert.equal(executions, 1);
  assert.equal(applies, 1);
  assert.ok(samples.length >= 120);
  assert.ok(samples.every(({parent,child}) => parent.status === "running" && child.status === "running" && parent.attempts === 1 && child.attempts === 1));
  assert.ok(new Set(samples.map(s => s.parent.lease_until)).size >= 4);
  assert.ok(new Set(samples.map(s => s.child.lease_until)).size >= 4);
  assert.equal((await owned<Job>(owner, "job", sent.job.id)).status, "done");
  assert.equal((await owned<Job>(owner, "job", childId)).status, "done");
});

test("real PG, controlled handler: child lease loss aborts in-flight work before its apply", { timeout: 40000 }, async () => {
  const sent = await sendMessage(owner, { message: "Prepare a briefing", request_key: randomUUID() });
  const parent = await claimJob(["chat"], { id: sent.job.id, userId: owner });
  assert(parent);
  const child = await enqueue(owner, "import", randomUUID(), { parent_chat_job_id: parent.id });
  let entered!: () => void, applied = false, aborted = false;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const running = completeAgentWork(parent, child.id, async () => {
    entered();
    try { await delay(90000, undefined, { signal: agentCreditContext.getStore()!.signal }); }
    catch (error) { aborted = true; throw error; }
    return { result: {}, apply: async () => { applied = true; } };
  }, new AbortController().signal);
  const rejected = assert.rejects(running, LostLease);
  await ready;
  await db.execute(sql`UPDATE hirelix_private_jobs SET lease_until=now()-interval '1 second' WHERE id=${child.id}::uuid`);
  await rejected;
  assert.equal(aborted, true);
  assert.equal(applied, false);
  await cancelJob(owner, parent.id);
});

test("real PG, controlled handler: queued worker also propagates lost renewal into its handler", { timeout: 40000 }, async () => {
  const job = await enqueue(owner, "assessment", randomUUID(), {});
  let entered!: () => void, applied = false, aborted = false;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const running = processJob({ assessment: async () => {
    entered();
    try { await delay(90000, undefined, { signal: agentCreditContext.getStore()!.signal }); }
    catch (error) { aborted = true; throw error; }
    return { result: {}, apply: async () => { applied = true; } };
  } });
  await ready;
  await db.execute(sql`UPDATE hirelix_private_jobs SET lease_token=${randomUUID()}::uuid WHERE id=${job.id}::uuid`);
  await running;
  assert.equal(aborted, true);
  assert.equal(applied, false);
});
