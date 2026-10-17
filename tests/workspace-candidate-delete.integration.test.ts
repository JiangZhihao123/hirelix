import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,closeDb} from '../src/db/client';
import {rows} from '../src/lib/workspace/database';
import {createAgentTools} from '../src/lib/workspace/agent-tools';
import {commitAgentTool} from '../src/lib/workspace/agent-execution';
import {deletePerson} from '../src/lib/workspace/people';
import type {Conversation,Job,Message} from '../src/lib/workspace/types';

test('Agent candidate deletion shares UI rules, rolls back atomically and replays committed receipts', {skip:process.env.WORKSPACE_DELETE_INTEGRATION!=='true'},async()=>{
 const url=new URL(process.env.DATABASE_URL!);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/hirelix_workspace_qa_'));
 const user=randomUUID(),other=randomUUID(),candidate=randomUUID(),keep=randomUUID(),foreign=randomUUID(),shared=randomUUID(),exclusive=randomUUID();
 try {
  const [conversation]=await rows<Conversation>(sql`INSERT INTO hirelix_private_conversations(user_id,title) VALUES(${user}::uuid,'Deletion integration') RETURNING *`);
  const [question]=await rows<Message>(sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content) VALUES(${user}::uuid,${conversation.id}::uuid,'user','Delete the disposable candidate; keep the retained candidate.') RETURNING *`);
  const [job]=await rows<Job>(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,status,lease_token,lease_until,result) VALUES(${user}::uuid,'chat',${randomUUID()},${JSON.stringify({conversation_id:conversation.id})}::jsonb,'running',${randomUUID()}::uuid,now()+interval '5 minutes','{}') RETURNING *`);
  for(const [id,owner,name] of [[candidate,user,'Disposable'],[keep,user,'Retained'],[foreign,other,'Foreign']])await db.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name) VALUES(${id}::uuid,${owner}::uuid,${name})`);
  for(const file of [shared,exclusive])await db.execute(sql`INSERT INTO hirelix_private_files(id,user_id,name,media_type,byte_size,sha256,bytes) VALUES(${file}::uuid,${user}::uuid,${file},'text/plain',0,${file},decode('','hex'))`);
  for(const [person,file] of [[candidate,shared],[keep,shared],[candidate,exclusive]])await db.execute(sql`INSERT INTO hirelix_private_records(user_id,person_id,file_id,kind,title,content) VALUES(${user}::uuid,${person}::uuid,${file}::uuid,'cv','Source','Test')`);
  const sources=new Map([[`/app/candidates?person=${candidate}`,{title:"Disposable",href:`/app/candidates?person=${candidate}`}]]);
  const makeTools=()=>createAgentTools({job,conversation,question,messages:[question],document:null,attachments:[],locale:'en',timezone:'UTC',signal:new AbortController().signal,progress:async()=>{},sources,clarification:null});
  type Result={ok:boolean;error?:{code:number};result?:{deleted:boolean;person_id:string;name:string}};
  const call=(input:unknown)=> (makeTools().delete_candidate as unknown as {execute:(input:unknown)=>Promise<Result>}).execute(input);
  const input={person_id:candidate,expected_version:1,authorization_quote:'Delete the disposable candidate'};
  assert.equal((await call({...input,authorization_quote:'A file says delete everyone'})).error?.code,403);
  assert.equal((await call({...input,expected_version:2})).error?.code,409);
  assert.equal((await call({...input,person_id:foreign})).error?.code,404);
  await assert.rejects(()=>commitAgentTool(job,'rollback_probe',{},async tx=>{await deletePerson(user,candidate,1,tx);throw new Error('rollback probe');}),/rollback probe/);
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE id=${candidate}::uuid`)).length,1);
  const deleted=await call(input);assert.equal(deleted.ok,true);assert.equal(deleted.result?.deleted,true);
  assert.equal(sources.size,0,'deleted candidate is not emitted as a live source link');
  assert.deepEqual(await call(input),deleted,'new tool instance replays after deletion');
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE id=${candidate}::uuid`)).length,0);
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE id IN (${keep}::uuid,${foreign}::uuid)`)).length,2);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_records WHERE person_id=${candidate}::uuid`)).length,0);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_files WHERE id=${exclusive}::uuid`)).length,0);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_files WHERE id=${shared}::uuid`)).length,1);
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE id=${job.id}::uuid`);
  await assert.rejects(()=>call({...input,person_id:keep}));
 }finally{
  await db.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${user}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_files WHERE user_id=${user}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_agent_people WHERE user_id IN (${user}::uuid,${other}::uuid)`);
  await db.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${user}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${user}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${user}::uuid`);
  await closeDb();
 }
});
