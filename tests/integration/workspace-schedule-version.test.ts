import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {sql} from 'drizzle-orm';
import {db,closeDb} from '../../src/db/client';
import {rows,WorkspaceError} from '../../src/lib/workspace/database';
import {createRole} from '../../src/lib/workspace/roles';
import {saveSchedule} from '../../src/lib/workspace/schedules';
import type {Schedule} from '../../src/lib/workspace/types';

test('stale recurring-report edits preserve newer timing and private-source choices',async()=>{
 const url=new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid');
 assert.equal(url.hostname,'127.0.0.1');assert.ok(url.pathname.startsWith('/hirelix_workspace_qa_'));
 const owner=randomUUID();
 try {
  const role=await createRole(owner,{title:'Schedule conflict fixture',client_name:'QA',jd_text:'Fictional product role'});
  const conversation=randomUUID(),message=randomUUID(),text='Prepare a recurring role report using selected role records; allow timing and source changes.';
  await db.execute(sql`INSERT INTO hirelix_private_conversations(id,user_id,title) VALUES(${conversation}::uuid,${owner}::uuid,'QA agreement')`);
  await db.execute(sql`INSERT INTO hirelix_agent_messages(id,user_id,conversation_id,role,content,metadata) VALUES(${message}::uuid,${owner}::uuid,${conversation}::uuid,'user',${text},'{"delivery":"sent"}'::jsonb)`);
  const origin={conversation_id:conversation,message_id:message,authorization_quote:text,source_authorization_quote:text};
  const original={expected_version:null,enabled:true,timezone:'UTC',weekday:2,local_time:'09:00',interval_weeks:1,language:'en',person_ids:[],include_role_records:true,include_candidate_records:false,only_when_changed:true};
  const first=await saveSchedule(owner,role.id,original,db,origin);
  const newer=await saveSchedule(owner,role.id,{...original,expected_version:first.version,local_time:'10:30',include_role_records:false},db,origin);
  await assert.rejects(()=>saveSchedule(owner,role.id,{...original,expected_version:first.version,enabled:false}),e=>e instanceof WorkspaceError&&e.status===409);
  await assert.rejects(()=>saveSchedule(owner,role.id,{...original,enabled:false}),e=>e instanceof WorkspaceError&&e.status===409);
  const [current]=await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${first.id}::uuid`);
  assert.equal(current.local_time.slice(0,5),'10:30');assert.equal(current.include_role_records,false);assert.equal(current.enabled,true);assert.equal(current.version,newer.version);
  const paused=await saveSchedule(owner,role.id,{...current,expected_version:current.version,enabled:false});
  assert.equal(paused.enabled,false);assert.equal(paused.local_time.slice(0,5),'10:30');assert.equal(paused.include_role_records,false);
  assert.equal(paused.version,current.version+1);
 }finally{
  await db.transaction(async tx=>{
   await tx.execute(sql`DELETE FROM hirelix_private_schedules WHERE user_id=${owner}::uuid`);
   await tx.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
   await tx.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${owner}::uuid`);
   await tx.execute(sql`DELETE FROM hirelix_private_versions WHERE user_id=${owner}::uuid`);
   await tx.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${owner}::uuid`);
   await tx.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${owner}::uuid`);
   await tx.execute(sql`DELETE FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  });
  await closeDb();
 }
});
