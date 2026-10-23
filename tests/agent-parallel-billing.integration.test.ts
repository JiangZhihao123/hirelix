import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { reserveAgentCall, releaseAgentCall, consumeAgentCredits, getAgentAccess } from "../src/lib/agent-access";
import { sendMessage } from "../src/lib/workspace/conversations";
import { claimJob, cancelJob, failJob, retryJob } from "../src/lib/workspace/jobs";
import { agentCreditContext } from "../src/lib/agent-credit-context";
import { searchWeb } from "../src/lib/workspace/web-search";

test("real PG: per-call holds survive out-of-order settlement, failure, duplicates, quota races and stale leases", {skip: process.env.AGENT_PARALLEL_INTEGRATION !== "true"}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port !== "15432" && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const owner = randomUUID();
  try {
    const sent = await sendMessage(owner, {message: "Parallel billing QA", request_key: randomUUID()});
    const job = (await claimJob(["chat"], {id: sent.job.id, userId: owner}))!;
    const ledger = async () => (await db.execute(sql`SELECT * FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`))[0];
    const calls = await Promise.all([1000, 2000, 3000].map(units => reserveAgentCall(job, units, 1, 0)));
    assert.equal(Number((await ledger()).reserved_units), 6000);
    await consumeAgentCredits(job, calls[1], 1500, 0.001, {test: "out-of-order"});
    assert.equal(Number((await ledger()).reserved_units), 5500);
    await assert.rejects(consumeAgentCredits(job, calls[0], 1001, 0.001, {}), /Not enough/);
    await Promise.all([releaseAgentCall(job, calls[0]), consumeAgentCredits(job, calls[2], 2500, 0.002, {})]);
    await releaseAgentCall(job, calls[0]);
    await assert.rejects(consumeAgentCredits(job, calls[1], 1500, 0.001, {}), /already settled/);
    const saved = await ledger();
    assert.equal(Number(saved.consumed_units), 4000); assert.equal(Number(saved.reserved_units), 4000);
    assert.equal(Number(saved.cost_nano_usd), 3000000); assert.deepEqual(saved.call_reservations, {});
    assert.equal((saved.pricing_snapshot as unknown[]).length, 2);

    // Failed transport must release its hold without releasing a sibling request.
    const sibling = await reserveAgentCall(job, 700, 1, 0);
    const original = globalThis.fetch, key = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "local-test";
    try {
      globalThis.fetch = async () => {throw new Error("controlled transport failure");};
      await assert.rejects(agentCreditContext.run(job, () => searchWeb("public QA", new AbortController().signal)), /Could not connect/);
      globalThis.fetch = async () => new Response(JSON.stringify({results: []}));
      const empty = await agentCreditContext.run(job, () => searchWeb("public QA", new AbortController().signal));
      assert.deepEqual(empty.sources, []);
      assert.equal(Number((await ledger()).consumed_units), 4000, "Empty searches do not consume credits");
      globalThis.fetch = async () => new Response(JSON.stringify({results: "invalid provider result"}));
      await assert.rejects(agentCreditContext.run(job, () => searchWeb("public QA", new AbortController().signal)), /invalid response/);
    } finally {globalThis.fetch = original; if (key === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = key;}
    assert.equal(Number((await ledger()).reserved_units), 4700);
    assert.deepEqual(Object.keys((await ledger()).call_reservations as object), [sibling.id]);
    await releaseAgentCall(job, sibling);

    const races = await Promise.allSettled([0, 1].map(() => reserveAgentCall(job, 1500000, 1, 0)));
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    const held = (races.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveAgentCall>>>).value;
    const remaining = await reserveAgentCall(job, 496000, 1, 0);
    assert.equal((await getAgentAccess(owner)).remaining, 0);
    let dispatched = false;
    const fetchBeforeQuota = globalThis.fetch;
    const keyBeforeQuota = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "local-test";
    try {
      globalThis.fetch = async () => {dispatched = true; throw new Error("must not dispatch");};
      await assert.rejects(agentCreditContext.run(job, () => searchWeb("public QA", new AbortController().signal)), /Not enough/);
      assert.equal(dispatched, false);
    } finally {
      globalThis.fetch = fetchBeforeQuota;
      if (keyBeforeQuota === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = keyBeforeQuota;
    }
    await releaseAgentCall(job, remaining);
    await failJob(job, "controlled QA failure"); await retryJob(owner, job.id);
    const next = (await claimJob(["chat"], {id: job.id, userId: owner}))!;
    const fresh = await reserveAgentCall(next, 800, 1, 0);
    await releaseAgentCall(job, held);
    await assert.rejects(consumeAgentCredits(job, held, 100, 0.001, {}), /lost its lease/);
    assert.deepEqual((await ledger()).call_reservations, {[fresh.id]: 800});
    await cancelJob(owner, next.id);
    assert.equal((await getAgentAccess(owner)).reserved, 0);
    await assert.rejects(consumeAgentCredits(next, fresh, 100, 0.001, {}), /lost its lease/);
  } finally { await closeDb(); }
});
