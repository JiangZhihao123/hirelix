import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import {sql} from "drizzle-orm";
import {closeDb,db} from "../../src/db/client";
import {sendMessage, conversationDetails} from "../../src/lib/workspace/conversations";
import {retryJob, cancelJob} from "../../src/lib/workspace/jobs";
const database=new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost","127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
after(closeDb);
test("real PG: stopping preserves unfinished prose with an explicit cancelled status, without committed receipts",async()=>{
  const owner=randomUUID();
  const sent=await sendMessage(owner,{message:"Save my call note",request_key:randomUUID(),locale:"en"});
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='running',result='{"live_reply":"Saved the call note and sharing permission."}'::jsonb WHERE id=${sent.job.id}::uuid`);
  const stopped=await cancelJob(owner,sent.job.id);
  assert.equal(stopped.status,"cancelled");
  const conversation=await conversationDetails(owner,sent.conversation_id);
  const reply=conversation.messages.at(-1)!;
  assert.equal(reply.metadata.turn_status,"cancelled");
  assert.equal(reply.content,"Saved the call note and sharing permission.");
  assert.equal(reply.metadata.committed_tools,undefined);
  const next=await sendMessage(owner,{conversation_id:sent.conversation_id,message:"Try again",request_key:randomUUID(),locale:"en"});
  await cancelJob(owner,next.job.id);
});
test("real PG: failed replies allow a correction to be prioritised and subsequent requests to queue",async()=>{
  const owner=randomUUID();
  const first=await sendMessage(owner,{message:"Fictional failure recovery QA",request_key:randomUUID(),locale:"en"});
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='error',error='QA file failure' WHERE id=${first.job.id}::uuid`);
  const second=await sendMessage(owner,{conversation_id:first.conversation_id,message:"Use a different file",delivery:"immediate",request_key:randomUUID(),locale:"en"});
  assert.notEqual(first.job.id,second.job.id);
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='running' WHERE id=${second.job.id}::uuid`);
  await assert.rejects(()=>retryJob(owner,first.job.id),/newer message/);
  const queued=await sendMessage(owner,{conversation_id:first.conversation_id,message:"Simultaneous turn",request_key:randomUUID(),locale:"en"});
  assert.equal(queued.job.status,"queued");
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='error',error='QA second failure' WHERE id=${second.job.id}::uuid`);
  assert.equal((await retryJob(owner,second.job.id)).status,"queued");
  // Leave only this explicitly isolated fixture terminal; no AI/provider stub is used.
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid`);
});
