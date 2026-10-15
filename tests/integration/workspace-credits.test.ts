import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, closeDb } from "../../src/db/client";
import { rows, WorkspaceError } from "../../src/lib/workspace/database";
import { claimJob, finishJob, failJob, retryJob, type JobHandler } from "../../src/lib/workspace/jobs";
import { structured } from "../../src/lib/workspace/ai";
import { agentCreditContext } from "../../src/lib/agent-credit-context";
import { getAgentAccess } from "../../src/lib/agent-access";
import { costToCreditUnits } from "../../src/lib/agent-credit-pricing";
import { CREDIT_UNITS } from "../../src/lib/agent-plan";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";

import type { Job } from "../../src/lib/workspace/types";
import { sendMessage } from "../../src/lib/workspace/conversations";
import { flushPendingLlmUsageEvents } from "../../src/lib/search/persistence";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["127.0.0.1","localhost"].includes(url.hostname) || !url.pathname.startsWith("/hirelix_workspace_qa_") || process.env.WORKSPACE_REAL_AI_TEST !== "true")
  throw new Error("Use an isolated local QA database and real AI, with the worker stopped");
initializeGlobalOutboundProxy();
const owner = randomUUID();
async function creditJob(userId: string) {
  return (await sendMessage(userId,{message:"Fictional billing QA",request_key:randomUUID()})).job;
}
after(async () => { await flushPendingLlmUsageEvents(); await closeDb(); });
async function executeCreditJob(job: Job, handler: JobHandler) {
  const claimed = await claimJob(["chat"],{id:job.id,userId:job.user_id});
  assert(claimed);
  try { await finishJob(claimed,await agentCreditContext.run(claimed,()=>handler(claimed,async()=>{}))); }
  catch(error) { await failJob(claimed,error instanceof Error ? error.message : "QA failure"); }
}

test("real AI + PostgreSQL: cost-based settlement, full failure refund, retry, and job attribution", { timeout:180000 }, async () => {
  const schema = z.object({ answer:z.string().min(1) });
  let failAfterAi = false;
  const handlers = { chat: async (job: Job) => {
    assert.equal(job.user_id,owner);
    const result = await structured(job.user_id,"private_credit_acceptance",schema,"Summarize the fictional recruiter note in one short sentence.",{ note:"Fictional client Northstar has a VP Product role. The budget is unconfirmed." });
    if (failAfterAi) throw new WorkspaceError("Controlled QA failure after a real AI response");
    return { result };
  }};
  const first = await creditJob(owner);
  assert.equal((await getAgentAccess(owner)).reserved,1);
  await executeCreditJob(first, handlers.chat);
  await flushPendingLlmUsageEvents();
  const [ledger] = await rows<{ consumed_units:string; reserved_units:string; cost_nano_usd:string; pricing_snapshot:Array<{ cost_usd:number; multiplier:number }> }>(sql`SELECT * FROM hirelix_agent_credit_usage WHERE job_id=${first.id}::uuid`);
  const units = Number(ledger.consumed_units);
  assert(units>0 && units !== CREDIT_UNITS,"Actual consumption replaces the one-credit provisional hold");
  assert.equal(units,ledger.pricing_snapshot.reduce((sum,item) => sum+costToCreditUnits(item.cost_usd,item.multiplier),0));
  assert.equal(Number(ledger.reserved_units),units);
  assert(Number(ledger.cost_nano_usd)>0);
  let access = await getAgentAccess(owner);
  assert.equal(access.used,units/CREDIT_UNITS);
  assert.equal(access.reserved,0);
  assert.equal(access.remaining,(200*CREDIT_UNITS-units)/CREDIT_UNITS);
  const [events] = await rows<{ count:number }>(sql`SELECT count(*)::int count FROM hirelix_llm_usage_events WHERE job_id=${first.id}::uuid AND user_id=${owner}::uuid`);
  assert(events.count>=1,"Real model usage is linked to the billable task");

  failAfterAi = true;
  const failed = await creditJob(owner);
  await executeCreditJob(failed, handlers.chat);
  access = await getAgentAccess(owner);
  assert.equal(access.used,units/CREDIT_UNITS,"A task that fails after model work is fully refunded");
  assert.equal(access.reserved,0);
  await retryJob(owner,failed.id);
  failAfterAi = false;
  await executeCreditJob(failed, handlers.chat);
  const [retry] = await rows<{ consumed_units:string; pricing_snapshot:unknown[] }>(sql`SELECT * FROM hirelix_agent_credit_usage WHERE job_id=${failed.id}::uuid`);
  assert.equal(retry.pricing_snapshot.length,1,"The failed attempt is excluded from the customer ledger");
  assert.equal((await getAgentAccess(owner)).used,(units+Number(retry.consumed_units))/CREDIT_UNITS);
});

test("real PG: insufficient credits stop before a provider call, refund the hold, and preserve work", async () => {
  const tiny = randomUUID();
  const seed = await creditJob(tiny);
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='done' WHERE id=${seed.id}::uuid`);
  await db.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=1999999,reserved_units=1999999 WHERE job_id=${seed.id}::uuid`);
  const job = await creditJob(tiny);
  await executeCreditJob(job, async (claimed) => {
    assert.equal(claimed.id,job.id);
    const result = await structured(tiny,"private_credit_insufficient",z.object({ answer:z.string() }),"Summarize in a sentence",{ note:"Fictional QA" });
    return { result };
  });
  const [saved] = await rows<{ status:string; error:string }>(sql`SELECT status,error FROM hirelix_private_jobs WHERE id=${job.id}::uuid`);
  assert.equal(saved.status,"error"); assert.match(saved.error,/Not enough AI credits/);
  const [usage] = await rows<{ count:number }>(sql`SELECT count(*)::int count FROM hirelix_llm_usage_events WHERE job_id=${job.id}::uuid`);
  assert.equal(usage.count,0,"No paid provider request at an insufficient balance");
  assert.equal((await getAgentAccess(tiny)).reserved,0);
  assert.equal((await getAgentAccess(tiny)).remaining,0.0001);
});
