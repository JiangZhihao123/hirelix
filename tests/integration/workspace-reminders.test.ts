import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { rows } from "../../src/lib/workspace/database";
import { saveReminder, listReminders, deliverReminders } from "../../src/lib/workspace/reminders";
import { sendMessage, assistantReply, conversationDetails, type AssistantMeta } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
const url=new URL(process.env.DATABASE_URL||"postgres://invalid/invalid");assert.ok(["localhost","127.0.0.1"].includes(url.hostname)&&url.pathname.startsWith("/hirelix_workspace_qa_"));assert.equal(process.env.WORKSPACE_REAL_AI_TEST,"true");initializeGlobalOutboundProxy();
const owner=randomUUID();
after(async()=>{await db.execute(sql`UPDATE hirelix_private_schedules SET enabled=false WHERE user_id=${owner}::uuid`);await closeDb();});
test("real model and PG: one-time reminder returns to conversation exactly once and is owner isolated",{timeout:120000},async()=>{
  const sent=await sendMessage(owner,{message:"Remind me on 9 October 2030 at 09:00 Europe/London to ask fictional Mira about her availability. Only remind me in this conversation; do not send an email.",timezone:"Europe/London",locale:"en",request_key:randomUUID()});
  const job=await claimJob(["chat"]);assert.equal(job?.id,sent.job.id);await finishJob(job!,await assistantReply(job!,()=>heartbeat(job!)));
  const detail=await conversationDetails(owner,sent.conversation_id);const receipt=(detail.messages.at(-1)!.metadata as AssistantMeta).reminders?.[0];assert(receipt);
  assert.equal(new Date(receipt.next_run_at).toISOString().slice(0,16),"2030-10-09T08:00");
  assert.equal((await listReminders(randomUUID())).length,0);
  const other=randomUUID();await assert.rejects(()=>db.transaction(tx=>saveReminder(other,sent.conversation_id,{id:null,title:"private",due_at:"2030-10-09T08:00:00Z",timezone:"UTC",enabled:true,authorization_quote:"remind me"},tx)),/not found/);
  // Move only this test fixture into the due set; exercise the actual DB scheduler.
  await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at=now()-interval '1 minute' WHERE id=${receipt.id}::uuid AND user_id=${owner}::uuid`);
  const delivered=await Promise.all([deliverReminders(),deliverReminders()]);assert.equal(delivered.reduce((a,b)=>a+b,0),1);
  assert.equal(await deliverReminders(),0);
  const messages=await rows(sql`SELECT id FROM hirelix_agent_messages WHERE user_id=${owner}::uuid AND metadata->>'reminder_id'=${receipt.id}`);assert.equal(messages.length,1);
  const reminders=await listReminders(owner);assert(reminders[0].completed_at);assert.equal(reminders[0].enabled,false);
});
