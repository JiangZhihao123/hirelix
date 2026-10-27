import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {sql} from "drizzle-orm";
import {db,closeDb} from "../../src/db/client";
import {rows} from "../../src/lib/workspace/database";
import {createAgentTools} from "../../src/lib/workspace/agent-tools";
import {editReminder,saveReminder,listReminders} from "../../src/lib/workspace/reminders";
import type {Conversation,Job,Message} from "../../src/lib/workspace/types";

test("stale Agent reminder edits cannot overwrite a newer UI reschedule", async()=>{
  const url=new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
  assert.equal(url.hostname,"127.0.0.1");
  assert.ok(url.pathname.startsWith("/hirelix_workspace_qa_"));
  const owner=randomUUID();
  try {
    const [conversation]=await rows<Conversation>(sql`INSERT INTO hirelix_private_conversations(user_id,title) VALUES(${owner}::uuid,'Reminder concurrency fixture') RETURNING *`);
    const [question]=await rows<Message>(sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content) VALUES(${owner}::uuid,${conversation.id}::uuid,'user','Keep that reminder paused.') RETURNING *`);
    const [job]=await rows<Job>(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,status,lease_token,lease_until,result) VALUES(${owner}::uuid,'chat',${randomUUID()},${JSON.stringify({conversation_id:conversation.id})}::jsonb,'running',${randomUUID()}::uuid,now()+interval '5 minutes','{}') RETURNING *`);
    const due=new Date(Date.now()+3600000).toISOString();
    const changed=new Date(Date.now()+7200000).toISOString();
    const original={id:null,expected_version:null,title:'Review recommendation',due_at:due,timezone:'UTC',enabled:true,authorization_quote:'Keep that reminder paused.'};
    const reminder=await db.transaction(tx=>saveReminder(owner,conversation.id,original,tx));
    await editReminder(owner,{id:reminder.id,expected_version:reminder.version,enabled:true,due_at:changed,timezone:'Asia/Shanghai'});
    const tools=createAgentTools({job,conversation,question,messages:[question],document:null,attachments:[],locale:'en',timezone:'UTC',signal:new AbortController().signal,progress:async()=>{},sources:new Map(),clarification:null});
    const call=(input:unknown)=>(tools.save_schedule as unknown as {execute:(input:unknown,options:unknown)=>Promise<{ok:boolean;error?:{code:number}} >}).execute({...input as object,kind:"reminder"},{toolCallId:randomUUID(),messages:[]});
    const stale={...original,id:reminder.id,expected_version:reminder.version,enabled:false};
    assert.equal((await call(stale)).error?.code,409);
    let [saved]=await listReminders(owner,undefined,reminder.id);
    assert.equal(new Date(saved.next_run_at).toISOString(),changed);
    assert.equal(saved.timezone,'Asia/Shanghai');
    assert.equal(saved.enabled,true);
    assert.equal(saved.version,2);
    assert.equal((await call({...stale,expected_version:null})).error?.code,409);
    const fresh={...stale,expected_version:saved.version,due_at:new Date(saved.next_run_at).toISOString(),timezone:saved.timezone};
    assert.equal((await call(fresh)).ok,true);
    [saved]=await listReminders(owner,undefined,reminder.id);
    assert.equal(saved.enabled,false);
    assert.equal(saved.version,3);
    assert.equal(new Date(saved.next_run_at).toISOString(),changed);
    assert.equal((await call(fresh)).ok,true,'Committed receipt replays without a second write');
    assert.equal((await listReminders(owner,undefined,reminder.id))[0].version,3);
  } finally {
    await db.execute(sql`DELETE FROM hirelix_private_schedules WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
    await db.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${owner}::uuid`);
    await closeDb();
  }
});
