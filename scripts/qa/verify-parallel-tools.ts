// Real provider + isolated PostgreSQL acceptance. No mocked network or forced
// tool plan in the natural Agent scenario. Direct-tool benchmarks are separate.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { agentCreditContext, executionTrace } from "../../src/lib/agent-credit-context";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { sendMessage, conversationDetails } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, failJob, withJobLease, type JobHandler } from "../../src/lib/workspace/jobs";
import { owned } from "../../src/lib/workspace/database";
import { createAgentTools, type AgentToolContext } from "../../src/lib/workspace/agent-tools";
import { assistantReply } from "../../src/lib/workspace/agent-runtime";
import { flushPendingLlmUsageEvents } from "../../src/lib/search/persistence";
import type { Job } from "../../src/lib/workspace/types";
import { costToCreditUnits } from "../../src/lib/agent-credit-pricing";

const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port !== "15432" && url.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
const directory = process.env.WORKSPACE_QA_EVIDENCE_DIR;
assert.ok(directory, "Set WORKSPACE_QA_EVIDENCE_DIR");
initializeGlobalOutboundProxy();
const owner = randomUUID();
const transport: Array<{job_id?: string; path: string; start: number; end?: number; status?: number}> = [];
const actualFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "api.deepseek.com" || !url.pathname.startsWith("/v1/tools/")) return actualFetch(input, init);
  const event = {job_id: agentCreditContext.getStore()?.id, path: url.pathname, start: Date.now()} as typeof transport[number];
  transport.push(event);
  try {
    const response = await actualFetch(input, init);
    event.status = response.status;
    // Observe the complete real response without changing its body or timing.
    await response.clone().arrayBuffer();
    return response;
  } finally {event.end = Date.now();}
};

async function run(message: string, handler: JobHandler) {
  const sent = await sendMessage(owner, {message, request_key: randomUUID()});
  const job = (await claimJob(["chat"], {id: sent.job.id, userId: owner}))!;
  const start = Date.now();
  try {
    await withJobLease(job, (signal, progress) => agentCreditContext.run({...job, signal, trace: executionTrace(job)}, async () => {
      const prepared = await handler(job, progress);
      await finishJob(job, prepared);
    }));
  } catch (error) {await failJob(job, error instanceof Error ? error.message : "QA failed"); throw error;}
  await flushPendingLlmUsageEvents();
  const saved = await owned<Job>(owner, "job", job.id);
  const [ledger] = await db.execute(sql`SELECT consumed_units,reserved_units,cost_nano_usd,pricing_snapshot,call_reservations FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
  const receipts = ledger.pricing_snapshot as Array<{cost_usd: number; multiplier: number; stage: string; requests?: number}>;
  assert.equal(saved.status, "done");
  assert.deepEqual(ledger.call_reservations, {});
  assert.equal(Number(ledger.reserved_units), Number(ledger.consumed_units));
  assert.equal(Number(ledger.consumed_units), receipts.reduce((sum, r) => sum + costToCreditUnits(r.cost_usd, r.multiplier), 0));
  assert.equal(Number(ledger.cost_nano_usd), receipts.reduce((sum, r) => sum + Math.round(r.cost_usd * 1e9), 0));
  const events = (saved.result?.agent_events || []) as Array<Record<string, unknown>>;
  const calls = events.filter(e => e.event === "tool_finished");
  const requests = transport.filter(e => e.job_id === job.id);
  const timeline = requests.flatMap(r => [{t: r.start, delta: 1}, {t: r.end!, delta: -1}]).sort((a, b) => a.t - b.t || a.delta - b.delta);
  let active = 0, peak = 0;
  for (const point of timeline) {active += point.delta; peak = Math.max(peak, active);}
  return {job_id: job.id, conversation_id: sent.conversation_id, elapsed_ms: Date.now() - start, peak_provider_requests: peak,
    calls, steps: saved.result?.agent_steps, ledger, requests, result: saved.result};
}

const inputs = [
  {tool: "web_search", input: {query: "PostgreSQL official database features", count: 5}},
  {tool: "web_search", input: {query: "Node.js official JavaScript runtime", count: 5}},
  {tool: "web_search", input: {query: "TypeScript official language documentation", count: 5}},
  {tool: "web_search", input: {query: "React official user interfaces documentation", count: 5}},
  {tool: "web_fetch", input: {url: "https://www.postgresql.org/about/"}},
  {tool: "web_fetch", input: {url: "https://nodejs.org/en/about"}},
  {tool: "list_candidates", input: {page: 1}},
  {tool: "list_roles", input: {page: 1}},
];

async function benchmark(concurrency: number) {
  process.env.WORKSPACE_TOOL_READ_CONCURRENCY = String(concurrency);
  return run("QA direct tool benchmark", async (job, progress) => {
    const details = await conversationDetails(owner, String(job.payload.conversation_id));
    const context: AgentToolContext = {job, conversation: details.conversation, question: details.messages[0], messages: details.messages,
      document: null, attachments: [], locale: "en", timezone: "Asia/Shanghai", signal: agentCreditContext.getStore()!.signal!,
      progress, sources: new Map(), clarification: null};
    const tools = createAgentTools(context);
    const outputs = await Promise.all(inputs.map(async ({tool, input}) => {
      const execute = tools[tool as keyof typeof tools].execute! as unknown as (input: unknown, options: {toolCallId: string; messages: []}) => Promise<{ok: boolean; result?: {sources?: unknown[]}; error?: unknown}>;
      const output = await execute(input, {toolCallId: randomUUID(), messages: []});
      assert.equal(output.ok, true, `${tool}: ${JSON.stringify(output.error)}`);
      if (tool.startsWith("web_")) assert.ok(output.result?.sources?.length, `${tool} returned no real sources`);
      return {tool, ok: output.ok, sources: output.result?.sources?.length};
    }));
    return {result: {benchmark_concurrency: concurrency, outputs}};
  });
}

async function main() {
  await mkdir(directory!, {recursive: true});
  const evidence: Record<string, unknown> = {database: url.pathname, owner};
  const save = () => writeFile(`${directory}/real-chain.json`, JSON.stringify({...evidence, transport}, null, 2));
  const originalConcurrency = process.env.WORKSPACE_TOOL_READ_CONCURRENCY;
  try {
    const order = process.env.PARALLEL_QA_REVERSE_ORDER === "true" ? [6, 1] : [1, 6];
    for (const concurrency of order) {
      evidence[concurrency === 1 ? "serial" : "parallel"] = await benchmark(concurrency); await save();
    }
    process.env.WORKSPACE_TOOL_READ_CONCURRENCY = "6";
    assert.equal((evidence.serial as {peak_provider_requests: number}).peak_provider_requests, 1);
    assert.ok((evidence.parallel as {peak_provider_requests: number}).peak_provider_requests > 1);
    evidence.natural = await run("请查阅 OpenAI、Anthropic、DeepSeek 的公开官网资料，比较三家公司的主要产品和服务对象，给我简洁的对照说明并附来源。不需要保存或发送。", assistantReply);
    const natural = evidence.natural as {conversation_id: string};
    const details = await conversationDetails(owner, natural.conversation_id);
    evidence.answer = details.messages.filter(m => m.role === "assistant").map(m => ({content: m.content, metadata: m.metadata}));
    await save();
    console.log(JSON.stringify({evidence: `${directory}/real-chain.json`, jobs: [evidence.serial, evidence.parallel, evidence.natural].map(v => {
      const row = v as {job_id: string; elapsed_ms: number; peak_provider_requests: number};
      return {job_id: row.job_id, elapsed_ms: row.elapsed_ms, peak_provider_requests: row.peak_provider_requests};
    })}));
  } catch (error) {evidence.failure = error instanceof Error ? error.message : String(error); await save(); throw error;}
  finally {
    globalThis.fetch = actualFetch;
    if (originalConcurrency === undefined) delete process.env.WORKSPACE_TOOL_READ_CONCURRENCY; else process.env.WORKSPACE_TOOL_READ_CONCURRENCY = originalConcurrency;
    await flushPendingLlmUsageEvents(); await closeDb();
  }
}
// All receipts, evidence and database writes are awaited by main. Provider/SDK
// transport handles may otherwise keep this one-shot QA process alive.
void main().then(() => process.exit(0), error => {console.error(error); process.exit(1);});
