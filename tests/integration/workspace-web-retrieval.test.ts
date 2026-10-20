import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { getGlobalDispatcher } from "undici";
import { closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { sendMessage, assistantReply, conversationDetails } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { rows } from "../../src/lib/workspace/database";
import { closeTurnChannel } from "../../src/lib/workspace/turn-channel";
import { flushPendingLlmUsageEvents } from "../../src/lib/search/persistence";
import { agentCreditContext } from "../../src/lib/agent-credit-context";
import { costToCreditUnits, DEEPSEEK_WEB_REQUEST_COST_USD } from "../../src/lib/agent-credit-pricing";
import { searchWeb, fetchWeb } from "../../src/lib/workspace/web-search";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
after(async () => { await closeTurnChannel(); await flushPendingLlmUsageEvents(); await closeDb(); await getGlobalDispatcher().close(); });

test("real Search and Fetch with PostgreSQL: request-based charges, page content and no fabricated tokens", {timeout: 240000}, async () => {
  const owner = randomUUID();
  const sent = await sendMessage(owner, {message: "Public web retrieval API verification", request_key: randomUUID()});
  const job = await claimJob(["chat"], {id: sent.job.id, userId: owner}); assert(job);
  const timer = setInterval(() => void heartbeat(job), 20000);
  try {
    await agentCreditContext.run(job, async () => {
      const result = await searchWeb("DeepSeek Search Fetch API site:api-docs.deepseek.com", new AbortController().signal, {count: 3, need_content: true});
      assert.ok(result.sources.length > 0);
      assert.ok(result.sources.some(source => new URL(source.href).hostname === "api-docs.deepseek.com"));
      const page = await fetchWeb("https://api-docs.deepseek.com/guides/search/", new AbortController().signal);
      assert.match(page.content.replace(/\\\//g, "/"), /\/v1\/tools\/search/);
      assert.match(page.content.replace(/\\\//g, "/"), /\/v1\/tools\/fetch/);
      const [ledger] = await rows<{cost_nano_usd: string; consumed_units: string; pricing_snapshot: Array<{stage: string; billing_unit: string; requests: number; cost_usd: number}>}>(sql`SELECT * FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
      assert.equal(Number(ledger.cost_nano_usd), Math.round(2 * DEEPSEEK_WEB_REQUEST_COST_USD * 1e9));
      assert.equal(Number(ledger.consumed_units), 2 * costToCreditUnits(DEEPSEEK_WEB_REQUEST_COST_USD));
      assert.deepEqual(ledger.pricing_snapshot.map(s => [s.stage, s.billing_unit, s.requests]), [["private_web_search", "successful_request", 1], ["private_web_fetch", "successful_request", 1]]);
      assert.equal((await rows(sql`SELECT id FROM hirelix_llm_usage_events WHERE job_id=${job.id}::uuid`)).length, 0);
      console.log(JSON.stringify({job_id: job.id, sources: result.sources.map(s => ({href:s.href, content_length:s.content.length})), fetched_characters: page.content.length, ledger}));
    });
    await finishJob(job, {result: {retrieval_verified: true}});
  } finally { clearInterval(timer); }
});

test("real Agent: search then verify an original page, preserve citations and request costs", {timeout: 300000}, async () => {
  const owner = randomUUID();
  const sent = await sendMessage(owner, {message: "请联网查 DeepSeek 官方新 Search 和 Fetch API 的用途与价格，再打开官方文档核对原文。用中文简短说明区别、两个接口地址和有效请求的收费条件，并附来源链接。只做公开资料研究，不保存业务资料。", locale: "zh", timezone: "Asia/Shanghai", request_key: randomUUID()});
  const job = await claimJob(["chat"], {id: sent.job.id, userId: owner}); assert(job);
  const timer = setInterval(() => void heartbeat(job), 20000);
  try { await finishJob(job, await assistantReply(job, () => heartbeat(job))); }
  finally { clearInterval(timer); }
  const details = await conversationDetails(owner, sent.conversation_id);
  const reply = details.messages.at(-1)!;
  const [saved] = await rows<{status: string; result: {parts: Array<{tool?: string; status?: string; sources?: Array<{href: string}>}>; agent_steps: Array<{tools: string[]; results: Array<{ok: boolean}>}>}}>(sql`SELECT status,result FROM hirelix_private_jobs WHERE id=${job.id}::uuid`);
  const tools = saved.result.agent_steps.flatMap(step => step.tools);
  assert.equal(saved.status, "done");
  assert.ok(tools.includes("web_search")); assert.ok(tools.includes("web_fetch"));
  assert.match(reply.content, /0\.75/);
  assert.match(reply.content, /api\.deepseek\.com\/v1\/tools\/search/);
  assert.match(reply.content, /api\.deepseek\.com\/v1\/tools\/fetch/);
  assert.ok(saved.result.parts.some(p => p.tool === "web_fetch" && p.status === "done" && p.sources?.some(s => s.href.includes("api-docs.deepseek.com"))));
  const [ledger] = await rows<{pricing_snapshot: Array<{stage: string; billing_unit?: string; cost_usd: number; requests?: number}>}>(sql`SELECT pricing_snapshot FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
  const retrieval = ledger.pricing_snapshot.filter(s => s.stage.startsWith("private_web_"));
  assert.ok(retrieval.length >= 2);
  assert.ok(retrieval.every(s => s.billing_unit === "successful_request" && s.cost_usd === (s.requests ? DEEPSEEK_WEB_REQUEST_COST_USD : 0)));
  console.log(JSON.stringify({conversation_id: sent.conversation_id, job_id: job.id, reply: reply.content, tools, retrieval}));
});

test("mock HTTP regression with real PostgreSQL: empty and failed requests consume no retrieval credits", {timeout: 30000}, async () => {
  const owner = randomUUID();
  const sent = await sendMessage(owner, {message: "Empty and failed web request accounting regression", request_key: randomUUID()});
  const job = await claimJob(["chat"], {id: sent.job.id, userId: owner}); assert(job);
  const originalFetch = globalThis.fetch;
  try {
    await agentCreditContext.run(job, async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({results: []}));
      assert.deepEqual((await searchWeb("empty", new AbortController().signal)).sources, []);
      globalThis.fetch = async () => new Response(JSON.stringify({title: "", content: ""}));
      assert.deepEqual((await fetchWeb("https://example.com/", new AbortController().signal)).sources, []);
      globalThis.fetch = async () => new Response("", {status: 403});
      await assert.rejects(() => fetchWeb("https://example.com/", new AbortController().signal), /HTTP 403/);
      globalThis.fetch = async () => new Response(JSON.stringify({results: [{title: "invalid"}]}));
      await assert.rejects(() => searchWeb("invalid", new AbortController().signal), /invalid response/);
      const [ledger] = await rows<{consumed_units: string; cost_nano_usd: string; pricing_snapshot: Array<{requests: number; cost_usd: number}>}>(sql`SELECT * FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
      assert.equal(Number(ledger.consumed_units), 0);
      assert.equal(Number(ledger.cost_nano_usd), 0);
      assert.equal(ledger.pricing_snapshot.length, 2);
      assert.ok(ledger.pricing_snapshot.every(s => s.requests === 0 && s.cost_usd === 0));
    });
    await finishJob(job, {result: {empty_and_failure_accounting_verified: true}});
  } finally { globalThis.fetch = originalFetch; }
});
