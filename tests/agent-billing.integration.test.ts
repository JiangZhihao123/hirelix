import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, closeDb } from "../src/db/client";
import { enqueue, owned } from "../src/lib/workspace/database";
import { retryJob } from "../src/lib/workspace/jobs";
import { getAgentAccess, reserveAgentCall, consumeAgentCredits } from "../src/lib/agent-access";
import type { Job } from "../src/lib/workspace/types";
import { POST } from "../src/app/api/paddle/webhook/route";

const enabled = process.env.AGENT_BILLING_INTEGRATION === "true";
test("Agent trial limits and signed webhook lifecycle against local Postgres", { skip: !enabled }, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"), "Only isolated local QA databases allowed");
  const userId = randomUUID();
  const originalSecret = process.env.PADDLE_WEBHOOK_SECRET;
  const originalPrice = process.env.NEXT_PUBLIC_PADDLE_AGENT_ANNUAL_PRICE_ID;
  const originalResend = process.env.RESEND_API_KEY;
  process.env.PADDLE_WEBHOOK_SECRET = "local-test-signature-secret";
  process.env.NEXT_PUBLIC_PADDLE_AGENT_ANNUAL_PRICE_ID = "pri_qa_annual";
  delete process.env.RESEND_API_KEY;
  try {
    assert.equal((await getAgentAccess(userId)).state, "trial_ready");
    const seed = await enqueue(userId, "chat", "cost-seed", { test: true });
    // Synthetic settled cost fixture: leaves three credits, not three tasks.
    await db.execute(sql`UPDATE hirelix_private_jobs SET status='done' WHERE id=${seed.id}::uuid`);
    await db.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=1970000,reserved_units=1970000 WHERE job_id=${seed.id}::uuid`);
    const submissions = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => enqueue(userId, "chat", `qa-${i}`, { test: true })));
    assert.equal(submissions.filter(r => r.status === "fulfilled").length, 3);
    assert.equal(submissions.filter(r => r.status === "rejected").length, 1);
    assert.equal((await getAgentAccess(userId)).remaining, 0);
    const first = submissions.find(r => r.status === "fulfilled")!;
    assert.equal(first.status, "fulfilled");
    if (first.status !== "fulfilled") throw new Error("Missing task");
    const job = first.value;
    assert.equal((await enqueue(userId, "chat", job.request_key, { test: true })).id, job.id, "Idempotent retry at limit succeeds");
    await assert.rejects(enqueue(userId, "chat", "assistant-import:spoof", {}), /allowance/);
    await db.execute(sql`UPDATE hirelix_private_jobs SET status='error' WHERE id=${job.id}::uuid`);
    assert.equal((await getAgentAccess(userId)).remaining, 1, "Failed task is refunded");
    await retryJob(userId, job.id);
    assert.equal((await getAgentAccess(userId)).remaining, 0, "Retry reserves the refunded task");
    await db.execute(sql`UPDATE hirelix_agent_access SET trial_started_at=now()-interval '8 days' WHERE user_id=${userId}::uuid`);
    assert.equal((await getAgentAccess(userId)).state, "expired");
    await assert.rejects(enqueue(userId, "chat", "expired", {}), /allowance/);
    async function webhook(eventId: string, status: string, date: string) {
      const body = JSON.stringify({ event_id:eventId,event_type:`subscription.${status === "active" ? "updated" : status}`,occurred_at:date,data:{id:`sub_${userId}`,customer_id:`ctm_${userId}`,status,custom_data:{user_id:userId},items:[{price:{id:"pri_qa_annual"}}],next_billed_at:new Date(Date.now()+365*86400000).toISOString()} });
      const timestamp=String(Math.floor(Date.now()/1000));
      const h1=createHmac("sha256",process.env.PADDLE_WEBHOOK_SECRET!).update(`${timestamp}:${body}`).digest("hex");
      return POST(new NextRequest("http://localhost/api/paddle/webhook",{method:"POST",body,headers:{"paddle-signature":`ts=${timestamp};h1=${h1}`}}));
    }
    const now = new Date().toISOString();
    assert.equal((await webhook(`evt_${userId}`,"active",now)).status,200);
    assert.equal((await getAgentAccess(userId)).state,"paid");
    assert.equal((await getAgentAccess(userId)).limit,3000);
    assert.equal((await getAgentAccess(userId)).remaining,3000,"Trial credits do not reduce newly paid allowance");
    const duplicate=await (await webhook(`evt_${userId}`,"active",now)).json();
    assert.equal(duplicate.duplicate,true);
    await webhook(`evt_old_${userId}`,"canceled",new Date(Date.now()-10000).toISOString());
    assert.equal((await getAgentAccess(userId)).state,"paid","Old event cannot remove paid access");
    await webhook(`evt_cancel_${userId}`,"canceled",new Date(Date.now()+1000).toISOString());
    assert.equal((await getAgentAccess(userId)).state,"expired");
    assert.equal((await POST(new NextRequest("http://localhost/api/paddle/webhook",{method:"POST",body:"{}"}))).status,401);
  } finally {
    await db.execute(sql`DELETE FROM hirelix_billing_events WHERE user_id=${userId}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${userId}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_agent_access WHERE user_id=${userId}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_user_settings WHERE user_id=${userId}::uuid`);
    for (const [key,value] of Object.entries({ PADDLE_WEBHOOK_SECRET:originalSecret,NEXT_PUBLIC_PADDLE_AGENT_ANNUAL_PRICE_ID:originalPrice,RESEND_API_KEY:originalResend })) { if (value === undefined) delete process.env[key]; else process.env[key]=value; }
    await closeDb();
  }
});

test("Concurrent service reservations cannot overspend a shared credit balance", { skip: !enabled }, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const owner = randomUUID();
  try {
    await db.transaction(async (tx) => {
      const seed = await enqueue(owner,"chat",randomUUID(),{},tx);
      await tx.execute(sql`UPDATE hirelix_private_jobs SET status='done' WHERE id=${seed.id}::uuid`);
      await tx.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=1950000,reserved_units=1950000 WHERE job_id=${seed.id}::uuid`);
    });
    const jobs = await Promise.all([0,1].map(() => db.transaction(async (tx) => {
      const created = await enqueue(owner,"chat",randomUUID(),{},tx);
      await tx.execute(sql`UPDATE hirelix_private_jobs SET status='running',lease_token=${randomUUID()}::uuid,lease_until=now()+interval '5 minutes' WHERE id=${created.id}::uuid`);
      return owned<Job>(owner,"job",created.id,tx);
    })));
    const calls = await Promise.allSettled(jobs.map(job => reserveAgentCall(job,30000,512,0)));
    assert.equal(calls.filter(call => call.status==='fulfilled').length,1);
    const winner = calls.findIndex(call => call.status==='fulfilled'), other = 1-winner;
    assert.equal((await getAgentAccess(owner)).remaining,1);
    await consumeAgentCredits(jobs[winner],20000,0.0066666667,{ source:"synthetic-cost-regression" });
    assert.equal((await getAgentAccess(owner)).remaining,2);
    await reserveAgentCall(jobs[other],30000,512,0);
    assert.equal((await getAgentAccess(owner)).remaining,0);
    await consumeAgentCredits(jobs[other],30000,0.01,{ source:"synthetic-cost-regression" });
    await db.execute(sql`UPDATE hirelix_private_jobs SET status='done' WHERE user_id=${owner}::uuid`);
    const access = await getAgentAccess(owner);
    assert.equal(access.used,200); assert.equal(access.reserved,0); assert.equal(access.remaining,0);
    await assert.rejects(enqueue(owner,"chat",randomUUID(),{}),/allowance/);
  } finally {
    await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_agent_access WHERE user_id=${owner}::uuid`);
    await closeDb();
  }
});
