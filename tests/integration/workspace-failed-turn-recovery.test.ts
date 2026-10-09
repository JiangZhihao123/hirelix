import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import {sql} from "drizzle-orm";
import {closeDb,db} from "../../src/db/client";
import {sendMessage} from "../../src/lib/workspace/conversations";
import {retryJob} from "../../src/lib/workspace/jobs";
const database=new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost","127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
after(closeDb);
test("real PG: failed replies permit a correction; old retries and simultaneous turns are rejected",async()=>{
  const owner=randomUUID();
  const first=await sendMessage(owner,{message:"Fictional failure recovery QA",request_key:randomUUID(),locale:"en"});
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='error',error='QA file failure' WHERE id=${first.job.id}::uuid`);
  const second=await sendMessage(owner,{conversation_id:first.conversation_id,message:"Use a different file",request_key:randomUUID(),locale:"en"});
  assert.notEqual(first.job.id,second.job.id);
  await assert.rejects(()=>retryJob(owner,first.job.id),/newer message/);
  await assert.rejects(()=>sendMessage(owner,{conversation_id:first.conversation_id,message:"Simultaneous turn",request_key:randomUUID(),locale:"en"}),/previous reply/);
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='error',error='QA second failure' WHERE id=${second.job.id}::uuid`);
  assert.equal((await retryJob(owner,second.job.id)).status,"queued");
  // Leave only this explicitly isolated fixture terminal; no AI/provider stub is used.
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid`);
});
