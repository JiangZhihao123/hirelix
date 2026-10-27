import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { flushPendingLlmUsageEvents } from "../../src/lib/search/persistence";
import { assistantReply, conversationDetails, sendMessage } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { queueScheduledDrafts } from "../../src/lib/workspace/schedules";
import { closeTurnChannel } from "../../src/lib/workspace/turn-channel";
import { owned, rows } from "../../src/lib/workspace/database";
import type { Deliverable, Job, Schedule } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost","127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/hirelix_workspace_qa_") || process.env.WORKSPACE_REAL_AI_TEST !== "true")
  throw new Error("Use isolated local PostgreSQL and the real AI test flag");
initializeGlobalOutboundProxy();
after(async()=>{await flushPendingLlmUsageEvents();await closeTurnChannel();await closeDb();});
const owner=randomUUID(), role=randomUUID(), note=randomUUID();

async function execute(job:Job) {
  const timer=setInterval(()=>void heartbeat(job),20000);
  try { return await finishJob(job,await assistantReply(job,async message=>{await heartbeat(job,message);})); }
  finally { clearInterval(timer); }
}

test("real model and PG: scheduled agent saves a scoped report into the original conversation",{timeout:300000},async()=>{
  const [count]=await rows<{n:number}>(sql`SELECT count(*)::int n FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  assert.equal(count.n,0);
  try {
    await db.transaction(async tx=>{
      await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES(${role}::uuid,${owner}::uuid,'QA Product Lead','Fictional QA','Lead a small product team.')`);
      await tx.execute(sql`INSERT INTO hirelix_private_records(id,user_id,role_id,kind,title,content,occurred_at)
        VALUES(${note}::uuid,${owner}::uuid,${role}::uuid,'call','QA client call','Client confirmed one candidate conversation; the next discussion date is not agreed.','2000-01-01T12:00:00Z')`);
    });
    const message="请为这个职位保存长期安排：每周日上午九点按上海时区写一份内部中文进展报告，使用这个职位在报告周期内的已保存角色记录。无变化不通知；不要发送或分享。";
    const sent=await sendMessage(owner,{message,role_id:role,locale:"zh",timezone:"Asia/Shanghai",request_key:randomUUID()});
    const initial=await claimJob(["chat"],{id:sent.job.id,userId:owner});assert(initial);
    await execute(initial);
    const [schedule]=await rows<Schedule & {conversation_id:string;authorization_message_id:string}>(sql`SELECT * FROM hirelix_private_schedules WHERE user_id=${owner}::uuid AND role_id=${role}::uuid`);
    assert(schedule,"The actual assistant must save the requested recurring agreement");
    assert.equal(schedule.conversation_id,sent.conversation_id);
    assert.equal(schedule.authorization_message_id,sent.job.payload.message_id);
    assert.equal(schedule.include_role_records,true);
    await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at='2000-01-02T01:00:00Z',last_period_end='1999-12-26T01:00:00Z' WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1,"2000-01-02T02:00:00Z"),1);
    const [due]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    const job=await claimJob(["chat"],{id:due.last_job_id!,userId:owner});assert(job);
    await execute(job);
    const finished=await owned<Job>(owner,"job",job.id);
    assert.equal(finished.status,"done");
    const receipts=Object.values((finished.result?.tool_receipts ?? {}) as Record<string,{name:string;output?:{operation?:string;document?:{id:string}}}>);
    const saved=receipts.find(receipt=>receipt.name==="save_document" && receipt.output?.operation==="create");
    assert(saved?.output?.document?.id,"The actual assistant must return a committed report receipt");
    const document=await owned<Deliverable>(owner,"deliverable",saved.output.document.id);
    assert.equal(document.kind,"search_update");assert.equal(document.role_id,role);
    assert.ok(document.content.trim().length > 0);
    assert.deepEqual(document.record_ids,[note]);
    assert.equal(document.source_snapshot.report_timezone,"Asia/Shanghai");
    const conversation=await conversationDetails(owner,sent.conversation_id);
    assert.ok(conversation.messages.some(item=>item.role==="assistant" && item.content.trim().length > 0 && item.metadata.reply_request_key===job.request_key),"Scheduled report returns to its originating conversation");
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_notifications WHERE user_id=${owner}::uuid AND href=${`/app?conversation=${sent.conversation_id}`} AND request_key=${`scheduled-ready:${job.id}`}`)).length,1);
  } finally {
    await flushPendingLlmUsageEvents();
    await db.transaction(async tx=>{
      await tx.execute(sql`DELETE FROM hirelix_private_notifications WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_private_schedules WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_llm_usage_events WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_private_versions WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
      await tx.execute(sql`DELETE FROM hirelix_agent_access WHERE user_id=${owner}::uuid`);
    });
  }
});
