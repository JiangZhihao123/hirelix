import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { owned, rows } from "../../src/lib/workspace/database";
import { saveFile } from "../../src/lib/workspace/files";
import { saveSchedule, queueScheduledDrafts } from "../../src/lib/workspace/schedules";
import { assertScheduledToolAllowed, lockScheduledChat, scheduledExecutionContext } from "../../src/lib/workspace/schedule-agent";
import { claimJob, finishJob } from "../../src/lib/workspace/jobs";
import { commitAgentTool } from "../../src/lib/workspace/agent-execution";
import { prepareDocumentWrite } from "../../src/lib/workspace/document-writes";
import { cancelQuestion, resolveQueuedQuestion } from "../../src/lib/workspace/conversation-questions";
import { sendMessage } from "../../src/lib/workspace/conversations";
import type { Job, Schedule } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost","127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/hirelix_workspace_qa_"))
  throw new Error("Use an isolated local QA database");
after(closeDb);
const owner=randomUUID(), foreign=randomUUID(), role=randomUUID(), otherRole=randomUUID(), person=randomUUID(),
  conversation=randomUUID(), foreignConversation=randomUUID(), message=randomUUID(), foreignMessage=randomUUID(), note=randomUUID();
const words="Please prepare a weekly report using selected private records.";
const origin={conversation_id:conversation,message_id:message,authorization_quote:words,source_authorization_quote:words};
const agreement={expected_version:null,enabled:true,timezone:"Asia/Shanghai",weekday:0,local_time:"09:00",interval_weeks:1,
  language:"en",person_ids:[person],include_role_records:false,include_candidate_records:false,only_when_changed:true};
const failure=(status:number)=>(error:unknown)=>error instanceof Error && "status" in error && error.status===status;

async function finishWithQuestion(job: Job) {
  const questionId=randomUUID();
  await finishJob(job,{result:{waiting_for_input:true},apply:async tx=>{
    await tx.execute(sql`INSERT INTO hirelix_agent_messages(id,user_id,role,content,conversation_id,metadata)
      VALUES(${questionId}::uuid,${owner}::uuid,'assistant','Should I include this record?',${conversation}::uuid,
        ${JSON.stringify({question:{question:"Should I include this record?",options:[],status:"waiting",request:words,scheduled_job_id:job.id}})}::jsonb)`);
    return {message_id:questionId};
  }});
  return questionId;
}

test("real PG: scheduled chat retains delegation, scope, idempotency, silence and pause fence",async()=>{
  const [count]=await rows<{n:number}>(sql`SELECT (SELECT count(*) FROM hirelix_private_roles WHERE user_id IN (${owner}::uuid,${foreign}::uuid))::int AS n`);
  assert.equal(count.n,0);
  try {
    await db.transaction(async tx=>{
      await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES
        (${role}::uuid,${owner}::uuid,'QA role','QA client','Role evidence'),(${otherRole}::uuid,${owner}::uuid,'Other role','Other','Unselected')`);
      await tx.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name,headline,location) VALUES(${person}::uuid,${owner}::uuid,'QA person','','')`);
      await tx.execute(sql`INSERT INTO hirelix_private_role_candidates(user_id,role_id,person_id) VALUES(${owner}::uuid,${role}::uuid,${person}::uuid)`);
      await tx.execute(sql`INSERT INTO hirelix_private_conversations(id,user_id,title) VALUES(${conversation}::uuid,${owner}::uuid,'Agreed report'),(${foreignConversation}::uuid,${foreign}::uuid,'Foreign')`);
      await tx.execute(sql`INSERT INTO hirelix_agent_messages(id,user_id,role,content,conversation_id,metadata) VALUES
        (${message}::uuid,${owner}::uuid,'user',${words},${conversation}::uuid,'{"delivery":"sent"}'::jsonb),
        (${foreignMessage}::uuid,${foreign}::uuid,'user',${words},${foreignConversation}::uuid,'{"delivery":"sent"}'::jsonb)`);
    });
    await assert.rejects(()=>saveSchedule(owner,role,agreement),failure(403));
    await assert.rejects(()=>saveSchedule(owner,role,agreement,db,{...origin,message_id:foreignMessage}),failure(403));
    await assert.rejects(()=>saveSchedule(owner,role,{...agreement,include_role_records:true},db,{...origin,source_authorization_quote:null}),failure(403));
    const schedule=await saveSchedule(owner,role,agreement,db,origin);
    assert.equal(schedule.conversation_id,conversation);
    assert.equal(schedule.authorization_message_id,message);
    await assert.rejects(()=>saveSchedule(owner,role,{...agreement,expected_version:schedule.version,local_time:"10:00"}),failure(403));
    await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at='2000-01-02T01:00:00Z',last_period_end='1999-12-26T01:00:00Z' WHERE id=${schedule.id}::uuid`);
    const claims=await Promise.all([queueScheduledDrafts(1,"2000-01-02T02:00:00Z"),queueScheduledDrafts(1,"2000-01-02T02:00:00Z")]);
    const [queueState] = await rows<{error:string|null}>(sql`SELECT error FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    assert.equal(claims.reduce((a,b)=>a+b,0),1,queueState.error ?? "No task queued");
    const [queuedSchedule]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    const queued=await owned<Job>(owner,"job",queuedSchedule.last_job_id!);
    assert.equal(queued.kind,"chat");assert.equal(queued.payload.message_id,message);assert.equal(queued.payload.conversation_id,conversation);
    assert.equal(queued.payload.schedule_id,schedule.id);assert.equal(queued.payload.schedule_version,schedule.version);
    assert.equal((await rows(sql`SELECT id FROM hirelix_agent_messages WHERE user_id=${owner}::uuid AND role='user'`)).length,1,"no synthetic user message");
    assert.equal((await rows(sql`SELECT job_id FROM hirelix_agent_credit_usage WHERE user_id=${owner}::uuid AND job_id=${queued.id}::uuid`)).length,1);
    const job=await claimJob(["chat"],{id:queued.id,userId:owner});assert(job);
    const report=scheduledExecutionContext(job)!;
    assert.equal(report.report_timezone,"Asia/Shanghai");assert.deepEqual(report.records,[]);
    await assert.rejects(()=>assertScheduledToolAllowed(job,"read_role",{id:role}),failure(403));
    await assert.rejects(()=>assertScheduledToolAllowed(job,"email",{}),failure(403));
    await assert.rejects(()=>assertScheduledToolAllowed(job,"read_record",{id:note}),failure(403));
    await assert.rejects(()=>finishJob(job,{result:{}}),/not saved/);
    const input={operation:"create",kind:"search_update",role_id:role,person_ids:[person],title:"Scheduled update",audience:"internal",language:"en",format:"email",
      period_start:report.period_start,period_end:report.period_end,period_local_start:report.period_local_start,period_local_end:report.period_local_end,
      report_timezone:report.report_timezone,sources:{role_version:report.source.role.version,records:[],file_ids:[]},content:"Report from the selected evidence.",
      authorization_quote:words,source_authorization_quote:null};
    await assert.rejects(()=>assertScheduledToolAllowed(job,"save_document",{...input,role_id:otherRole}),failure(403));
    await assert.rejects(()=>assertScheduledToolAllowed(job,"save_document",{...input,period_end:"2001-01-01T00:00:00Z"}),failure(403));
    await assertScheduledToolAllowed(job,"save_document",input);
    const apply=await prepareDocumentWrite(owner,input);
    const result=await commitAgentTool(job,"save_document",input,async tx=>({output:await apply(tx)}));
    assert.equal((result as {operation:string}).operation,"create");
    assert.deepEqual(await commitAgentTool(job,"save_document",input,async tx=>({output:await apply(tx)})),result);
    await assert.rejects(()=>commitAgentTool(job,"save_document",{...input,content:"Another report"},async tx=>({output:await apply(tx)})),failure(409));
    await finishJob(job,{result:{}});
    const [done]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    assert.equal(done.last_record_digest,queued.payload.record_digest);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_notifications WHERE user_id=${owner}::uuid AND href=${`/app?conversation=${conversation}`}`)).length,1);
    await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at='2000-01-09T01:00:00Z',last_period_end='2000-01-02T02:00:00Z' WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1,"2000-01-09T02:00:00Z"),0,"unchanged evidence is silent and consumes no additional task");
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND payload->>'schedule_id'=${schedule.id}`)).length,1);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_notifications WHERE user_id=${owner}::uuid`)).length,1);

    const file=await saveFile(owner,{name:"source.txt",type:"text/plain",bytes:Buffer.from("Allowed original")});
    await db.execute(sql`INSERT INTO hirelix_private_records(id,user_id,role_id,file_id,kind,title,content,occurred_at)
      VALUES(${note}::uuid,${owner}::uuid,${role}::uuid,${file.id}::uuid,'call','Selected evidence','Recorded activity','2000-01-15T12:00:00Z')`);
    const sourceMessage=randomUUID(),futureMessage=randomUUID(),sourceWords="Use the selected private role records.",futureWords="Future authorization must not be used.";
    await db.execute(sql`INSERT INTO hirelix_agent_messages(id,user_id,role,content,conversation_id,metadata,created_at) VALUES
      (${sourceMessage}::uuid,${owner}::uuid,'user',${sourceWords},${conversation}::uuid,'{"delivery":"sent"}'::jsonb,clock_timestamp()),
      (${futureMessage}::uuid,${owner}::uuid,'user',${futureWords},${conversation}::uuid,'{"delivery":"sent"}'::jsonb,clock_timestamp()+interval '1 hour')`);
    const multiMessageOrigin={...origin,message_id:sourceMessage,source_authorization_quote:sourceWords};
    await assert.rejects(()=>saveSchedule(owner,role,{...agreement,include_role_records:true,expected_version:done.version},db,{...multiMessageOrigin,authorization_quote:futureWords}),failure(403));
    const changed=await saveSchedule(owner,role,{...agreement,include_role_records:true,expected_version:done.version},db,multiMessageOrigin);
    assert.equal(changed.authorization_message_id,message);
    assert.equal(changed.source_authorization_message_id,sourceMessage);
    await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at='2000-01-16T01:00:00Z',last_period_end='2000-01-09T02:00:00Z' WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1,"2000-01-16T02:00:00Z"),1);
    const [current]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    const running=await claimJob(["chat"],{id:current.last_job_id!,userId:owner});assert(running);
    const scoped=scheduledExecutionContext(running)!;
    assert.deepEqual(scoped.records,[{id:note,version:1}]);
    assert.deepEqual(scoped.files,[{file_id:file.id,sha256:file.sha256}]);
    assert.equal(scoped.authorization_message_id,message);
    assert.equal(scoped.source_authorization_message_id,sourceMessage);
    assert.equal((scoped.source.records as Array<{id:string}>)[0].id,note);
    await assertScheduledToolAllowed(running,"read_record",{id:note});
    await assertScheduledToolAllowed(running,"read_file",{file_id:file.id});
    await assert.rejects(()=>assertScheduledToolAllowed(running,"read_file",{file_id:randomUUID()}),failure(403));
    await assert.rejects(()=>assertScheduledToolAllowed(running,"read_candidate",{id:person}),failure(403));
    await assert.rejects(()=>assertScheduledToolAllowed(running,"save_document",{...input,period_start:scoped.period_start,period_end:scoped.period_end,
      period_local_start:scoped.period_local_start,period_local_end:scoped.period_local_end,sources:{role_version:scoped.source.role.version,records:[{id:note,version:2}],file_ids:[]},source_authorization_quote:sourceWords}),failure(403));
    const questionId=await finishWithQuestion(running);
    const [waiting]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    assert.equal(waiting.last_record_digest,queued.payload.record_digest,"a question is not a completed report");
    await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at='2000-01-23T01:00:00Z' WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1,"2000-01-23T02:00:00Z"),0,"a waiting occurrence is not replaced by a new run");
    const response=await sendMessage(owner,{conversation_id:conversation,message:"Yes, include the selected record.",question_message_id:questionId,request_key:randomUUID()});
    const resumed=await claimJob(["chat"],{id:response.job.id,userId:owner});assert(resumed);
    await resolveQueuedQuestion(resumed);
    assert.equal(resumed.payload.schedule_id,schedule.id);
    assert.equal(resumed.payload.scheduled_origin_job_id,running.id);
    assert.equal(resumed.payload.message_id,response.job.payload.message_id);
    assert.deepEqual(scheduledExecutionContext(resumed),scoped);
    const [answered]=await rows<{content:string;metadata:{continuation:Record<string,unknown>}}>(sql`SELECT content,metadata FROM hirelix_agent_messages WHERE user_id=${owner}::uuid AND id=${String(resumed.payload.message_id)}::uuid`);
    assert.equal(answered.content,"Yes, include the selected record.");
    assert.equal(answered.metadata.continuation.request,undefined,"the original agreement is not rewritten as a new user request");
    const continuedInput={...input,period_start:scoped.period_start,period_end:scoped.period_end,period_local_start:scoped.period_local_start,
      period_local_end:scoped.period_local_end,sources:{role_version:scoped.source.role.version,records:[{id:note,version:1}],file_ids:[]},source_authorization_quote:sourceWords};
    await assertScheduledToolAllowed(resumed,"save_document",continuedInput);
    const applyContinued=await prepareDocumentWrite(owner,continuedInput);
    await commitAgentTool(resumed,"save_document",continuedInput,async tx=>({output:await applyContinued(tx)}));
    await finishJob(resumed,{result:{}});
    const [afterAnswer]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    assert.equal(afterAnswer.last_job_id,resumed.id);
    assert.equal(afterAnswer.last_record_digest,resumed.payload.record_digest);
    const nextNote=randomUUID();
    await db.execute(sql`INSERT INTO hirelix_private_records(id,user_id,role_id,kind,title,content,occurred_at)
      VALUES(${nextNote}::uuid,${owner}::uuid,${role}::uuid,'call','Later source','Later activity','2000-01-22T12:00:00Z')`);
    await db.execute(sql`UPDATE hirelix_private_schedules SET last_period_end='2000-01-16T02:00:00Z' WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1,"2000-01-23T02:00:00Z"),1);
    const [latest]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    const next=await claimJob(["chat"],{id:latest.last_job_id!,userId:owner});assert(next);
    await db.execute(sql`UPDATE hirelix_private_records SET version=2 WHERE id=${nextNote}::uuid`);
    await assert.rejects(()=>assertScheduledToolAllowed(next,"read_record",{id:nextNote}),failure(409));
    const paused=await saveSchedule(owner,role,{...agreement,include_role_records:true,expected_version:changed.version,enabled:false});
    assert.equal(paused.enabled,false);
    assert.equal((await owned<Job>(owner,"job",next.id)).status,"cancelled");
    await assert.rejects(()=>db.transaction(tx=>lockScheduledChat(next,tx)),failure(409));
    await assert.rejects(()=>saveSchedule(owner,role,{...agreement,include_role_records:true,expected_version:changed.version,enabled:true}),failure(409));

    const enabled=await saveSchedule(owner,role,{...agreement,include_role_records:true,expected_version:paused.version,enabled:true});
    await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at='2000-01-30T01:00:00Z',last_period_end='2000-01-23T02:00:00Z' WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1,"2000-01-30T02:00:00Z"),1);
    const [afterResume]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    const cancellable=await claimJob(["chat"],{id:afterResume.last_job_id!,userId:owner});assert(cancellable);
    const cancelId=await finishWithQuestion(cancellable);
    await cancelQuestion(owner,conversation,cancelId);
    assert.equal((await owned<Job>(owner,"job",cancellable.id)).result?.waiting_for_input,false);
    await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at='2000-02-06T01:00:00Z' WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1,"2000-02-06T02:00:00Z"),1,"cancelling an occurrence allows future scheduled runs");
    const [afterCancel]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    const stale=await claimJob(["chat"],{id:afterCancel.last_job_id!,userId:owner});assert(stale);
    const staleQuestion=await finishWithQuestion(stale);
    await saveSchedule(owner,role,{...agreement,include_role_records:true,expected_version:enabled.version,enabled:false});
    const staleAnswer=await sendMessage(owner,{conversation_id:conversation,message:"Use the record.",question_message_id:staleQuestion,request_key:randomUUID()});
    const staleReply=await claimJob(["chat"],{id:staleAnswer.job.id,userId:owner});assert(staleReply);
    await assert.rejects(()=>resolveQueuedQuestion(staleReply),failure(409));
  } finally {
    await db.transaction(async tx=>{
      for(const user of [owner,foreign]) {
        await tx.execute(sql`DELETE FROM hirelix_private_notifications WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_schedules WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_role_candidates WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_versions WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_deliverables WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_files WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_roles WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_agent_people WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_agent_access WHERE user_id=${user}::uuid`);
      }
    });
  }
});
