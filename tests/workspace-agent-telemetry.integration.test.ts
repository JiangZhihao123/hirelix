import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { agentCreditContext } from "../src/lib/agent-credit-context";
import { appendAgentEvidence, executionTrace, observeAgentTool } from "../src/lib/workspace/agent-telemetry";
import { claimJob, failJob, retryJob, cancelJob, LostLease } from "../src/lib/workspace/jobs";
import { sendMessage } from "../src/lib/workspace/conversations";
import { owned } from "../src/lib/workspace/database";
import type { Job } from "../src/lib/workspace/types";
import { AgentPause } from "../src/lib/workspace/agent-stop";

test("PG execution evidence survives retries, correlates tools and rejects stale leases without private payloads", {skip: process.env.AGENT_TELEMETRY_INTEGRATION !== "true"}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.port !== "15432" && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const owner = randomUUID();
  try {
    const sent = await sendMessage(owner, {message: "QA telemetry", request_key: randomUUID()});
    const first = (await claimJob(["chat"],{id: sent.job.id, userId: owner}))!;
    const trace = executionTrace(first);
    await agentCreditContext.run({...first, trace}, async () => {
      await appendAgentEvidence(first,"agent_steps",{...trace, step: 1, finish: "tool-calls"});
      await observeAgentTool(first,"read_candidate","tool-1",2,async () => ({ok: false, error: {code: 404, message: "PRIVATE_CONTENT"}}));
    });
    await failJob(first,"QA intentional failure");
    await retryJob(owner, first.id);
    const second = (await claimJob(["chat"],{id: first.id, userId: owner}))!;
    const next = executionTrace(second);
    assert.notEqual(next.execution_id,trace.execution_id);
    assert.equal(next.job_attempt,trace.job_attempt,"Manual retry resets the numeric counter; execution ID remains unique");
    await appendAgentEvidence(second,"agent_steps",{...next, step: 1, finish: "stop"});
    await assert.rejects(appendAgentEvidence(first,"agent_steps",{step:999}),LostLease);
    const saved = await owned<Job>(owner,"job",first.id);
    assert.equal((saved.result!.agent_steps as unknown[]).length,2);
    const events = saved.result!.agent_events as Array<Record<string, unknown>>;
    assert.equal(events.length,2);
    assert.equal(events[0].tool_call_id,events[1].tool_call_id);
    assert.equal(events[1].status,"error");
    assert.equal(events[1].error_code,404);
    assert.equal(typeof events[1].duration_ms,"number");
    assert.ok(!JSON.stringify(saved.result).includes("PRIVATE_CONTENT"));
    await cancelJob(owner,second.id);
    await assert.rejects(appendAgentEvidence(second,"agent_steps",{step:999}),LostLease);
  } finally {await closeDb();}
});

test("mock transport + real PG: failed SDK model attempt remains correlated after a successful retry", {skip: process.env.AGENT_TELEMETRY_INTEGRATION !== "true"}, async () => {
  const {generateText} = await import("ai");
  const {agentModel} = await import("../src/lib/workspace/agent-model");
  const {flushPendingLlmUsageEvents} = await import("../src/lib/search/persistence");
  const originalFetch=globalThis.fetch, originalEnv={...process.env};
  const owner=randomUUID();
  try {
    process.env.AI_PROVIDER="deepseek"; process.env.DEEPSEEK_MODEL="deepseek-flash"; process.env.DEEPSEEK_API_KEY="mock-transport-key";
    process.env.OPENROUTER_BASE_URL="https://api.deepseek.com";
    const sent=await sendMessage(owner,{message:"Transport QA",request_key:randomUUID()});
    const job=(await claimJob(["chat"],{id:sent.job.id,userId:owner}))!;
    let calls=0;
    globalThis.fetch=async () => {
      if(++calls===1)return new Response(JSON.stringify({error:{message:"PRIVATE_PROVIDER_BODY"}}),{status:500,headers:{"content-type":"application/json"}});
      return new Response(JSON.stringify({id:"qa",created:1,model:"deepseek-flash",choices:[{index:0,message:{role:"assistant",content:"complete"},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200,completion_tokens_details:{reasoning_tokens:80}}}),{headers:{"content-type":"application/json"}});
    };
    const trace={...executionTrace(job),step:1};
    await agentCreditContext.run({...job,trace},()=>generateText({model:agentModel(job),prompt:"QA",maxRetries:1,maxOutputTokens:512}));
    await flushPendingLlmUsageEvents();
    const events=await db.execute(sql`SELECT status,attempt,metadata,error_message,request_payload,response_payload FROM hirelix_llm_usage_events WHERE job_id=${job.id}::uuid ORDER BY created_at`);
    assert.deepEqual(events.map(e=>e.status),["error","success"]);
    assert.deepEqual(events.map(e=>e.attempt),[1,2]);
    const contexts=events.map(e=>e.metadata as Record<string,unknown>);
    assert.equal(contexts[0].execution_id,contexts[1].execution_id);
    assert.notEqual(contexts[0].model_call_id,contexts[1].model_call_id);
    assert.ok(!JSON.stringify(events).includes("PRIVATE_PROVIDER_BODY"));
    assert.ok(events.every(e=>e.request_payload===null&&e.response_payload===null));
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
    Object.assign(process.env,originalEnv); await closeDb();
  }
});

test("mock transport + real PG: truncated provider output records usage and releases its reservation as a pause", {skip: process.env.AGENT_TELEMETRY_INTEGRATION !== "true"}, async () => {
  const {generateText} = await import("ai");
  const {agentModel} = await import("../src/lib/workspace/agent-model");
  const {flushPendingLlmUsageEvents} = await import("../src/lib/search/persistence");
  const originalFetch = globalThis.fetch, originalEnv = {...process.env};
  const owner = randomUUID();
  try {
    process.env.AI_PROVIDER = "deepseek"; process.env.DEEPSEEK_MODEL = "deepseek-flash"; process.env.DEEPSEEK_API_KEY = "mock-transport-key";
    process.env.OPENROUTER_BASE_URL = "https://api.deepseek.com";
    const sent = await sendMessage(owner, {message: "Output limit QA", request_key: randomUUID()});
    const job = (await claimJob(["chat"], {id: sent.job.id, userId: owner}))!;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({id: "qa", created: 1, model: "deepseek-flash", choices: [{index: 0, message: {role: "assistant", content: "Partial response"}, finish_reason: "length"}], usage: {prompt_tokens: 100, completion_tokens: 512, total_tokens: 612}}), {headers: {"content-type": "application/json"}});
    };
    await assert.rejects(agentCreditContext.run({...job, trace: {...executionTrace(job), step: 1}}, () => generateText({model: agentModel(job), prompt: "QA", maxRetries: 1, maxOutputTokens: 512})), error => error instanceof AgentPause && error.reason === "output_limit");
    assert.equal(calls, 1);
    await flushPendingLlmUsageEvents();
    const events = await db.execute(sql`SELECT status,output_tokens,metadata FROM hirelix_llm_usage_events WHERE job_id=${job.id}::uuid`);
    assert.equal(events.length, 1);
    assert.equal(events[0].status, "error");
    assert.equal(events[0].output_tokens, 512);
    assert.equal((events[0].metadata as Record<string, unknown>).finish_reason, "length");
    const [credit] = await db.execute(sql`SELECT call_reservations FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
    assert.deepEqual(credit.call_reservations, {});
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv); await closeDb();
  }
});
