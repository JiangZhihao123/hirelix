import { createRole, updateRelationship } from "../../src/lib/workspace/roles";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after,test } from "node:test";
import { sql } from "drizzle-orm";
import { db,closeDb } from "../../src/db/client";
import { sendMessage,assistantReply,conversationDetails,type AssistantMeta } from "../../src/lib/workspace/conversations";
import { claimJob,heartbeat,finishJob,failJob } from "../../src/lib/workspace/jobs";
import { rows } from "../../src/lib/workspace/database";
import { applyAssistantAction,acceptAction } from "../../src/lib/workspace/conversation-actions";
import { createPerson } from "../../src/lib/workspace/people";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
const database=new URL(process.env.DATABASE_URL||"postgres://invalid/invalid");
assert.ok(["localhost","127.0.0.1"].includes(database.hostname)&&database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,"true");initializeGlobalOutboundProxy();
const owner=randomUUID();
after(async()=>{await db.execute(sql`UPDATE hirelix_private_schedules SET enabled=false WHERE user_id=${owner}::uuid`);await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);await closeDb();});
async function reply(message:string,conversation_id?:string,document_id?:string){
 const input={message,conversation_id,document_id,request_key:randomUUID(),locale:"en"};const sent=await sendMessage(owner,input);
 const job=await claimJob(["chat"]);assert.equal(job?.id,sent.job.id);assert(job);
 const timer=setInterval(()=>void heartbeat(job),20000);
 try{await finishJob(job,await assistantReply(job,m=>heartbeat(job,m)));}catch(error){await failJob(job,"QA execution failed");throw error;}finally{clearInterval(timer);}
 return {...await conversationDetails(owner,sent.conversation_id),input};
}
test("real agent: relationship linking, interest, permission and notes stay in conversation",{timeout:300000},async()=>{
 const role=await createRole(owner,{title:"Infrastructure Manager",client_name:"QA Cedarglass",jd_text:"Lead infrastructure delivery"});
 const person=await createPerson(owner,{name:"QA Jordan Vale",headline:"Infrastructure Lead"});
 const first=await reply("Link QA Jordan Vale to the Infrastructure Manager role at QA Cedarglass and save their stated interest: open to an introductory call. Add a private relationship note: ask about on-call rotation. No sharing permission has been granted. Do not send anything.");
 const get=async()=> (await rows<import('../../src/lib/workspace/types').RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`))[0];
 assert.ok(!(first.messages.at(-1)?.metadata as AssistantMeta).actions?.some(action=>action.kind==='update_sharing_permission'), 'An absent permission decision must not become a refusal proposal');
 const link=await get();assert(link,first.messages.at(-1)?.content);assert.equal(link.permission,'unknown');assert.match(link.interest,/introductory call/i);assert.match(link.notes,/on.call/i);
 const second=await reply("Jordan verbally gave permission to share their profile with QA Cedarglass for this role. Save that permission; keep the interest and private note unchanged. Do not send anything.",first.conversation.id);
 const permission=await get();assert.equal(permission.permission,'confirmed',second.messages.at(-1)?.content);assert(permission.permission_record_id);assert.equal(permission.interest,link.interest);assert.equal(permission.notes,link.notes);
 await reply("Clear the private relationship note for Jordan and this role. Keep interest and sharing permission unchanged. Save this change.",first.conversation.id);
 const cleared=await get();assert.equal(cleared.notes,'');assert.equal(cleared.interest,link.interest);assert.equal(cleared.permission_record_id,permission.permission_record_id);
 await reply("What would it mean if Jordan lost interest? Analysis only, do not change anything.",first.conversation.id);
 assert.equal((await get()).version,cleared.version);
 const preview=await reply("Preview changing Jordan's interest for this role to unavailable until January. Do not save yet.",first.conversation.id);
 const msg=preview.messages.at(-1)!;const action=(msg.metadata as AssistantMeta).actions?.find(a=>a.kind==='update_relationship');assert(action,msg.content);assert.equal(action.status,'pending');
 await updateRelationship(owner,role.id,person.id,{...cleared,interest:'Newer fact',expected_version:cleared.version});
 await assert.rejects(()=>acceptAction(owner,preview.conversation.id,msg.id,action.id,action.fields),/changed/);
 await assert.rejects(()=>db.transaction(tx=>applyAssistantAction(randomUUID(),preview.conversation.id,action,action.fields,tx)),/not found/);
});
test("real agent: absence of permission is not a reported refusal",{timeout:120000},async()=>{
 const role=await createRole(owner,{title:"Product Lead",client_name:"QA Willowmere",jd_text:"Lead product delivery"});
 const person=await createPerson(owner,{name:"QA Morgan Lark",headline:"Product Manager"});
 const result=await reply("Screening-call notes: QA Morgan Lark confirmed interest in the Product Lead role at QA Willowmere and can attend the office Tuesday and Thursday. Salary expectations and notice period were not discussed. Save this call note, link Morgan to the role and record their interest. No sharing permission has been granted. Do not contact anyone or send anything.");
 const [link]=await rows<import('../../src/lib/workspace/types').RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`);
 assert(link,result.messages.at(-1)?.content);assert.equal(link.permission,'unknown');assert.equal(link.permission_record_id,null);assert.match(link.interest,/interest/i);
 assert.ok(!(result.messages.at(-1)?.metadata as AssistantMeta).actions?.some(action=>action.kind==='update_sharing_permission'),'No refusal or grant proposal when no decision was reported');
});
test("real agent: permission report creates a missing association with evidence atomically",{timeout:120000},async()=>{
 const role=await createRole(owner,{title:"Platform Director",client_name:"QA Meadowbank",jd_text:"Lead platform operations"});
 const person=await createPerson(owner,{name:"QA Casey Flint",headline:"Platform Lead"});
 const result=await reply("Save this fact: QA Casey Flint explicitly declined permission to share their profile with QA Meadowbank for the Platform Director role. Keep the refusal as a record for that role and candidate. Do not send anything.");
 const [link]=await rows<import('../../src/lib/workspace/types').RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`);
 assert(link,result.messages.at(-1)?.content);assert.equal(link.permission,'declined');assert(link.permission_record_id);
 const [record]=await rows<{person_id:string;role_id:string;content:string}>(sql`SELECT * FROM hirelix_private_records WHERE id=${link.permission_record_id}::uuid`);assert.equal(record.person_id,person.id);assert.equal(record.role_id,role.id);assert.match(record.content,/declined|refused/i);
});
test("real agent: role maintenance and recurring agreements preserve existing facts",{timeout:240000},async()=>{
 const role=await createRole(owner,{title:"Delivery Manager",client_name:"QA Riverfern",jd_text:"Original client JD: lead delivery with two office days.",brief:{priorities:['Two office days'],flexible:[],unknowns:[]}});
 const first=await reply("Pause the Delivery Manager role at QA Riverfern and correct its title to Delivery Director. Also save client contact name Morgan and email morgan@example.test. Save these changes. Keep its original JD and current requirements unchanged.");
 const {owned}=await import('../../src/lib/workspace/database');
 const updated=await owned<import('../../src/lib/workspace/types').Role>(owner,'role',role.id);assert.equal(updated.status,'paused',first.messages.at(-1)?.content);assert.equal(updated.title,'Delivery Director');assert.equal(updated.client_contact.name,'Morgan');assert.equal(updated.client_contact.email,'morgan@example.test');assert.equal(updated.jd_text,role.jd_text);assert.deepEqual(updated.brief,role.brief);
 await reply("Reopen this role as active. Save that change and keep everything else unchanged.",first.conversation.id);
 assert.equal((await owned<import('../../src/lib/workspace/types').Role>(owner,'role',role.id)).status,'active');
 const scheduled=await reply("Save a recurring English progress update for this role every Friday at 09:00 Europe/London, once per week, only when evidence changes. Use only the public role brief, no candidate profiles or private records. Do not send anything.",first.conversation.id);
 const get=async()=> (await rows<import('../../src/lib/workspace/types').Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid`))[0];
 const agreement=await get();assert(agreement,scheduled.messages.at(-1)?.content);assert.equal(agreement.enabled,true);assert.equal(agreement.weekday,5);assert.equal(agreement.timezone,'Europe/London');assert.equal(agreement.include_role_records,false);assert.equal(agreement.include_candidate_records,false);
 await reply("Pause that recurring update agreement. Keep its time, frequency and scope unchanged.",first.conversation.id);
 const paused=await get();assert.equal(paused.enabled,false);assert.equal(paused.local_time,agreement.local_time);assert.deepEqual(paused.person_ids,agreement.person_ids);
});
test("real agent: external delivery reports persist the exact document without sending",{timeout:120000},async()=>{
 const role=await createRole(owner,{title:'Operations Director',client_name:'QA Seagrass',jd_text:'Lead operations'});
 const [doc]=await rows<import('../../src/lib/workspace/types').Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','QA saved recommendation','Saved wording must stay unchanged.','{"audience":"client","people":[],"files":[]}') RETURNING *`);
 const result=await reply('I already delivered this saved recommendation to Morgan at QA Seagrass by email on 2026-10-09 at 10:00 Europe/London. Record this past delivery. Do not send any email or change the wording.',undefined,doc.id);
 const [saved]=await rows<import('../../src/lib/workspace/types').Deliverable>(sql`SELECT * FROM hirelix_private_deliverables WHERE id=${doc.id}::uuid`);assert.equal(saved.status,'submitted',result.messages.at(-1)?.content);assert.equal(new Date(saved.submitted_at!).toISOString(),'2026-10-09T09:00:00.000Z');assert.equal(saved.content,doc.content);assert.match(saved.submission_note,/Morgan/);
 assert.equal((await rows(sql`SELECT id FROM hirelix_private_email_deliveries WHERE user_id=${owner}::uuid`)).length,0);
 const {markSubmitted}=await import('../../src/lib/workspace/deliverables');
 await markSubmitted(owner,doc.id,{submitted_at:new Date(saved.submitted_at!).toISOString(),submission_note:saved.submission_note,expected_version:doc.version});
 assert.equal((await rows(sql`SELECT id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND details->>'deliverable_id'=${doc.id}`)).length,1);
});
