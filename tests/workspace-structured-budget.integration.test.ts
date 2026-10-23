import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, closeDb } from "../src/db/client";
import { agentCreditContext } from "../src/lib/agent-credit-context";
import { structured, DOCUMENT_OUTPUT_TOKENS, DOCUMENT_GENERATION_OPTIONS } from "../src/lib/workspace/ai";
import { sendMessage } from "../src/lib/workspace/conversations";
import { claimJob } from "../src/lib/workspace/jobs";
import { flushPendingLlmUsageEvents } from "../src/lib/search/persistence";

test("mock provider + real PG: document ceiling, truncation retry, format failure and quota release", {skip: process.env.STRUCTURED_BUDGET_INTEGRATION !== "true"}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.port !== "15432" && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const originalFetch = globalThis.fetch, originalEnv = {...process.env};
  const owner = randomUUID();
  try {
    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_MODEL = "deepseek-flash";
    process.env.OPENROUTER_BASE_URL = "https://api.deepseek.com";
    const sent = await sendMessage(owner,{message:"Budget QA",request_key:randomUUID()});
    const job = (await claimJob(["chat"],{id:sent.job.id,userId:owner}))!;
    let responses: Array<{text: string; finish: string}>=[], ceilings: number[]=[], modes: string[]=[];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)); ceilings.push(body.max_tokens); modes.push(body.thinking.type);
      const next = responses.shift(); assert.ok(next,"Unexpected provider retry");
      return new Response(JSON.stringify({choices:[{message:{content:next.text},finish_reason:next.finish}],usage:{prompt_tokens:100,completion_tokens:next.finish === "length" ? body.max_tokens : 100,total_tokens:200,completion_tokens_details:{reasoning_tokens:80}}}),{headers:{"content-type":"application/json"}});
    };
    const run = (maxOutputTokens?: number) => agentCreditContext.run(job,()=>structured(owner,"private_budget_qa",z.object({answer:z.string()}),"QA",{},undefined,[],maxOutputTokens === DOCUMENT_OUTPUT_TOKENS ? DOCUMENT_GENERATION_OPTIONS : {maxOutputTokens}));
    responses=[{text:'{"answer":"complete"}',finish:"stop"}];
    await run(); assert.deepEqual(ceilings,[7000],"Small schemas retain their existing ceiling");
    ceilings=[]; responses=[{text:'{"answer":"partial',finish:"length"},{text:'{"answer":"complete"}',finish:"stop"}];
    await run(DOCUMENT_OUTPUT_TOKENS); assert.deepEqual(ceilings,[16384,32768]); assert.deepEqual(modes.slice(-2),["disabled","disabled"]);
    const [settled] = await db.execute(sql`SELECT * FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
    assert.equal(settled.reserved_units,settled.consumed_units);
    assert.equal((settled.pricing_snapshot as unknown[]).length,2,"Truncation does not charge the user");
    responses=[{text:'{"wrong":true}',finish:"stop"},{text:'{"wrong":true}',finish:"stop"}];
    await assert.rejects(run(DOCUMENT_OUTPUT_TOKENS),/required evidence/);
    const [failed] = await db.execute(sql`SELECT * FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
    assert.equal(failed.reserved_units,settled.consumed_units); assert.equal(failed.consumed_units,settled.consumed_units);
    // Leave enough allowance for a small response but not the document ceiling.
    await db.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=1995000,reserved_units=1995000 WHERE job_id=${job.id}::uuid`);
    ceilings=[]; responses=[{text:'{"answer":"partial',finish:"length"}];
    await assert.rejects(run(DOCUMENT_OUTPUT_TOKENS),/available AI credits/);
    assert.equal(ceilings.length,1,"A quota-clipped ceiling is not repeated");
    const [clipped] = await db.execute(sql`SELECT reserved_units,consumed_units FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
    assert.equal(clipped.reserved_units,clipped.consumed_units);
    await flushPendingLlmUsageEvents();
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env)) if(!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env,originalEnv); await closeDb();
  }
});
