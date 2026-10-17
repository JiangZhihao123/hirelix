import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,closeDb} from '../src/db/client';
import {createRole,updateRole,roleRecipient} from '../src/lib/workspace/roles';

test('client recipient follows saved role edits and enforces user ownership', {skip:process.env.WORKSPACE_CONTACT_INTEGRATION!=='true'}, async()=>{
 const url=new URL(process.env.DATABASE_URL!);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/hirelix_workspace_qa_'));
 const user=randomUUID();
 try {
  const role=await createRole(user,{title:'Contact integration',client_name:'Fictional QA',jd_text:'Product requirements',client_contact:{name:'Lisa'}});
  assert.equal(await roleRecipient(user,role.id),null);
  assert.equal(await roleRecipient(user,null),null);
  const saved=await updateRole(user,role.id,{...role,client_contact:{...role.client_contact,email:'lisa@example.com'}},role.version);
  assert.equal(await roleRecipient(user,role.id),'lisa@example.com');
  assert.equal(saved.client_contact.name,'Lisa');
  await assert.rejects(()=>roleRecipient(randomUUID(),role.id), (e:unknown)=>(e as {status:number}).status===404);
  await assert.rejects(()=>updateRole(user,role.id,{...saved,client_contact:{...saved.client_contact,email:'stale@example.com'}},role.version));
  assert.equal(await roleRecipient(user,role.id),'lisa@example.com');
 } finally {
  for(const table of ['hirelix_private_jobs','hirelix_private_records','hirelix_private_versions','hirelix_private_roles']) await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE user_id=${user}::uuid`);
  await closeDb();
 }
});
