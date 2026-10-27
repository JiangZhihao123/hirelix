// Real PostgreSQL and runtime; the provider is an in-process controlled stream.
// Run with node --experimental-test-module-mocks --import tsx --test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, mock, test } from "node:test";
import { MockLanguageModelV3 } from "ai/test";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const owner = randomUUID();
let started!: () => void, observedAbort!: () => void;
const startedPromise = new Promise<void>(resolve => { started = resolve; });
const abortedPromise = new Promise<void>(resolve => { observedAbort = resolve; });
const model = new MockLanguageModelV3({
  doStream: async options => {
    assert.ok(options.abortSignal, "The provider must receive the active execution signal");
    started();
    return await new Promise((_resolve, reject) => {
      const abort = () => { observedAbort(); reject(options.abortSignal!.reason); };
      if (options.abortSignal!.aborted) abort();
      else options.abortSignal!.addEventListener("abort", abort, {once: true});
    });
  },
});
const ready = (async () => {
  mock.module("../../src/lib/workspace/agent-model.ts", {namedExports: {agentModel: () => model, agentProviderOptions: () => undefined}});
  const conversations = await import("../../src/lib/workspace/conversations");
  const jobs = await import("../../src/lib/workspace/jobs");
  const databaseModule = await import("../../src/lib/workspace/database");
  const connection = await import("../../src/db/client");
  const credits = await import("../../src/lib/agent-credit-context");
  const channel = await import("../../src/lib/workspace/turn-channel");
  const drizzle = await import("drizzle-orm");
  return {...conversations, ...jobs, ...databaseModule, ...connection, ...credits, ...channel, sql: drizzle.sql};
})();
after(async () => {
  const s = await ready;
  await s.db.execute(s.sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await s.closeTurnChannel();
  await s.closeDb();
  mock.restoreAll();
});

test("real PG: outer worker abort reaches the provider while the job lease is still valid", {timeout: 15000}, async () => {
  const s = await ready;
  const sent = await s.sendMessage(owner, {message: "Summarize this request.", request_key: randomUUID()});
  const job = await s.claimJob(["chat"], {id: sent.job.id, userId: owner});
  assert.ok(job);
  // Skip the unrelated conversation-title generation call.
  const runtimeJob = {...job, payload: {...job.payload, resuming: true}};
  const controller = new AbortController();
  const work = s.agentCreditContext.run({...runtimeJob, signal: controller.signal, trace: s.executionTrace(runtimeJob)}, () =>
    s.assistantReply(runtimeJob, async () => {})).then(value => value, error => error);
  await startedPromise;
  const before = await s.owned<{status: string}>(owner, "job", job.id);
  assert.equal(before.status, "running");
  const start = performance.now();
  controller.abort(new Error("Worker lease renewal aborted"));
  await Promise.race([abortedPromise, new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Provider did not receive the worker abort promptly")), 750))]);
  assert.ok(performance.now() - start < 750);
  const current = await s.owned<{status: string; lease_token: string; lease_until: string}>(owner, "job", job.id);
  assert.equal(current.status, "running");
  assert.equal(current.lease_token, job.lease_token);
  assert.ok(new Date(current.lease_until).getTime() > Date.now());
  assert.ok(await work instanceof Error);
});
