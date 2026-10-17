import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,closeDb} from '../src/db/client';
import {importDetails} from '../src/lib/workspace/imports';

test('import recovery requires a later owned CV/profile record for the exact file', {skip:process.env.WORKSPACE_IMPORT_INTEGRATION!=='true'}, async()=>{
 const url=new URL(process.env.DATABASE_URL!);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/hirelix_workspace_qa_'));
 const user=randomUUID(),other=randomUUID(),job=randomUUID(),file=randomUUID(),person=randomUUID();
 try {
  await db.execute(sql`INSERT INTO hirelix_private_files(id,user_id,name,media_type,byte_size,sha256,bytes) VALUES(${file}::uuid,${user}::uuid,'test.pdf','application/pdf',0,'test',decode('','hex'))`);
  await db.execute(sql`INSERT INTO hirelix_private_jobs(id,user_id,kind,request_key,payload,status,error,updated_at) VALUES(${job}::uuid,${user}::uuid,'import',${job},${JSON.stringify({file_id:file})}::jsonb,'error','Historical import failure',now()-interval '1 minute')`);
  await db.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name) VALUES(${person}::uuid,${user}::uuid,'Recovery test')`);
  assert.deepEqual(Array.from((await importDetails(user,job)).savedProfiles),[]);
  await assert.rejects(()=>importDetails(other,job),/not found/);
  const record=randomUUID();
  await db.execute(sql`INSERT INTO hirelix_private_records(id,user_id,person_id,file_id,kind,title,content,created_at) VALUES(${record}::uuid,${user}::uuid,${person}::uuid,${file}::uuid,'profile','Source','Test',now()-interval '2 minutes')`);
  assert.deepEqual(Array.from((await importDetails(user,job)).savedProfiles),[],'pre-existing profile is not recovery');
  await db.execute(sql`UPDATE hirelix_private_records SET created_at=now(),kind='note' WHERE id=${record}::uuid`);
  assert.deepEqual(Array.from((await importDetails(user,job)).savedProfiles),[],'a note is not a saved profile');
  await db.execute(sql`UPDATE hirelix_private_records SET kind='profile' WHERE id=${record}::uuid`);
  await db.execute(sql`UPDATE hirelix_private_records SET file_id=NULL WHERE id=${record}::uuid`);
  assert.deepEqual(Array.from((await importDetails(user,job)).savedProfiles),[],'unlinked source does not recover this file');
  await db.execute(sql`UPDATE hirelix_private_records SET file_id=${file}::uuid WHERE id=${record}::uuid`);
  const recovered=await importDetails(user,job);
  assert.deepEqual(Array.from(recovered.savedProfiles),[{id:person,name:'Recovery test'}]);
  assert.equal(recovered.job.status,'error','historical failure is preserved');
  assert.deepEqual((await importDetails(user,job)).savedProfiles,recovered.savedProfiles);
 }finally{
  await db.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${user}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_agent_people WHERE user_id=${user}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${user}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_files WHERE user_id=${user}::uuid`);
  await closeDb();
 }
});
