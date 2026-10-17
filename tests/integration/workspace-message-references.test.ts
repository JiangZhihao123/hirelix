import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test, after} from 'node:test';
import {closeDb} from '../../src/db/client';
import {createPerson} from '../../src/lib/workspace/people';
import {sendMessage, conversationDetails} from '../../src/lib/workspace/conversations';
import {cancelJob, claimJob} from '../../src/lib/workspace/jobs';
import {closeTurnChannel} from '../../src/lib/workspace/turn-channel';
async function acceptAndCancel(owner: string, id: string) {
 const job = await claimJob(['chat'],{id,userId:owner});
 assert.ok(job);
 const {resolveQueuedQuestion} = await import('../../src/lib/workspace/conversation-questions');
 await resolveQueuedQuestion(job);
 await cancelJob(owner,id);
}
const database = new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid');
assert.ok(['localhost','127.0.0.1'].includes(database.hostname) && database.pathname.startsWith('/hirelix_workspace_qa_'));
after(async()=>{await closeTurnChannel();await closeDb();});
test('candidate selection belongs to each message, never carries into the next turn',async()=>{
 const owner=randomUUID();
 const a=await createPerson(owner,{name:'QA Message Candidate A'});
 const b=await createPerson(owner,{name:'QA Message Candidate B'});
 const first=await sendMessage(owner,{message:'Review this person',person_id:a.id,request_key:randomUUID()});
 await acceptAndCancel(owner,first.job.id);
 let detail=await conversationDetails(owner,first.conversation_id);
 assert.equal(detail.conversation.person_id,null);
 assert.deepEqual(detail.messages[0].metadata.candidate_references,[{id:a.id,name:a.name}]);
 const second=await sendMessage(owner,{message:'Compare these two',conversation_id:first.conversation_id,delivery:"immediate",candidate_ids:[a.id,b.id],request_key:randomUUID()});
 await acceptAndCancel(owner,second.job.id);
 const third=await sendMessage(owner,{message:'Thanks',conversation_id:first.conversation_id,delivery:"immediate",request_key:randomUUID()});
 await acceptAndCancel(owner,third.job.id);
 detail=await conversationDetails(owner,first.conversation_id);
 const users=detail.messages.filter(m=>m.role==='user');
 assert.deepEqual(users[1].metadata.candidate_references,[{id:a.id,name:a.name},{id:b.id,name:b.name}]);
 assert.equal(users[2].metadata.candidate_references,undefined);
 assert.equal(users[2].metadata.person_id,undefined);
 await assert.rejects(()=>sendMessage(randomUUID(),{message:'Foreign candidate',candidate_ids:[a.id],request_key:randomUUID()}),/not found/);
});

test('multiple roles persist per message, deduplicate and enforce ownership', async () => {
 const {createRole} = await import('../../src/lib/workspace/roles');
 const owner = randomUUID();
 const a = await createRole(owner,{title:'QA Context Engineer',client_name:'QA Alpha',jd_text:'QA engineering position'});
 const b = await createRole(owner,{title:'QA Context Designer',client_name:'QA Beta',jd_text:'QA design position'});
 const first = await sendMessage(owner,{message:'Compare these roles',role_ids:[a.id,b.id,a.id],request_key:randomUUID()});
 await acceptAndCancel(owner,first.job.id);
 let detail = await conversationDetails(owner,first.conversation_id);
 assert.deepEqual(detail.messages[0].metadata.role_references,[{id:a.id,title:a.title,client_name:a.client_name},{id:b.id,title:b.title,client_name:b.client_name}]);
 assert.equal(detail.conversation.role_id,null);
 const next = await sendMessage(owner,{message:'Thanks',conversation_id:first.conversation_id,delivery:"immediate",request_key:randomUUID()});
 await acceptAndCancel(owner,next.job.id);
 detail = await conversationDetails(owner,first.conversation_id);
 assert.equal(detail.messages.filter(m=>m.role==='user')[1].metadata.role_references,undefined);
 await assert.rejects(()=>sendMessage(randomUUID(),{message:'Foreign role',role_ids:[a.id],request_key:randomUUID()}),/not found/);
});

test('reference search finds candidate employers and role clients across the account only', async () => {
 const {mentionPeople} = await import('../../src/lib/workspace/people');
 const {createRole, listRolesPage} = await import('../../src/lib/workspace/roles');
 const {roleListOptions} = await import('../../src/lib/workspace/list-options');
 const owner=randomUUID(), company=`Context-${randomUUID()}`;
 const person=await createPerson(owner,{name:'Search Person',profile:{experience:[{company,title:'Engineer'}]}});
 const role=await createRole(owner,{title:'Search Role',client_name:company,jd_text:'QA search role'});
 assert.deepEqual((await mentionPeople(owner,company)).people.map(p=>p.id),[person.id]);
 assert.deepEqual((await listRolesPage(owner,roleListOptions.parse({q:company}))).roles.map(r=>r.id),[role.id]);
 assert.equal((await mentionPeople(randomUUID(),company)).people.length,0);
 assert.equal((await listRolesPage(randomUUID(),roleListOptions.parse({q:company}))).roles.length,0);
});
