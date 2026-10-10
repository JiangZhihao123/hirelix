import { createRole } from "../../src/lib/workspace/roles";
import { exportDocument } from "../../src/lib/workspace/document-export";
import { updateDeliverable } from "../../src/lib/workspace/deliverables";
import type { Deliverable } from "../../src/lib/workspace/types";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after,test } from "node:test";
import { sql } from "drizzle-orm";
import { db,closeDb } from "../../src/db/client";
import { sendMessage,assistantReply,conversationDetails,type AssistantMeta } from "../../src/lib/workspace/conversations";
import { claimJob,heartbeat,finishJob,failJob } from "../../src/lib/workspace/jobs";
import { rows,owned } from "../../src/lib/workspace/database";
import { applyAssistantAction,acceptAction } from "../../src/lib/workspace/conversation-actions";
import { updatePerson } from "../../src/lib/workspace/people";
import type { Person } from "../../src/lib/workspace/types";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
const database=new URL(process.env.DATABASE_URL||"postgres://invalid/invalid");
assert.ok(["localhost","127.0.0.1"].includes(database.hostname)&&database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,"true");initializeGlobalOutboundProxy();
const owner=randomUUID();
after(async()=>{await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);await closeDb();});
async function reply(message:string,conversation_id?:string,document_id?:string){
 const input={message,conversation_id,document_id,request_key:randomUUID(),locale:"en"};const sent=await sendMessage(owner,input);
 const job=await claimJob(["chat"]);assert.equal(job?.id,sent.job.id);assert(job);
 const timer=setInterval(()=>void heartbeat(job),20000);
 try{await finishJob(job,await assistantReply(job,m=>heartbeat(job,m)));}catch(error){await failJob(job,"QA execution failed");throw error;}finally{clearInterval(timer);}
 return {...await conversationDetails(owner,sent.conversation_id),input};
}
test("real agent: chat creates and updates profiles, preserves other fields, and fences preview conflicts",{timeout:240000},async()=>{
 const first=await reply("Save a new candidate from these fictional details: Emery Lane, Operations Lead in York, emery.lane@example.test. Public summary: led six specialists delivering audit tooling. Education: fictional West Institute. Do not create a role or reminder.");
 const [original]=await rows<Person>(sql`SELECT * FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);assert(original,first.messages.at(-1)?.content);
 assert.equal((first.messages.at(-1)!.metadata as AssistantMeta).actions?.find(a=>a.kind==='create_candidate')?.status,'saved');
 assert.equal(original.email,'emery.lane@example.test');assert.equal(original.location,'York');
 await sendMessage(owner,first.input);assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`)).length,1);
 const updated=await reply("Update Emery Lane's location to Bristol and clear the email address. Keep every other profile field unchanged. Save these changes.",first.conversation.id);
 const person=await owned<Person>(owner,'person',original.id);assert.equal(person.location,'Bristol');assert.equal(person.email,'');assert.deepEqual(person.profile,original.profile);assert.equal(person.version,original.version+1);
 assert.equal((updated.messages.at(-1)!.metadata as AssistantMeta).actions?.find(a=>a.kind==='update_candidate')?.status,'saved');
 await reply("What would be the implications if Emery moved to Cardiff? Analysis only; don't change any records.",first.conversation.id);
 assert.equal((await owned<Person>(owner,'person',original.id)).version,person.version);
 const preview=await reply("Prepare a preview changing Emery Lane's headline to Operations Director. Do not save it until I review it.",first.conversation.id);
 const message=preview.messages.at(-1)!;const action=(message.metadata as AssistantMeta).actions?.find(a=>a.kind==='update_candidate');assert(action,message.content);assert.equal(action.status,'pending');
 await assert.rejects(()=>db.transaction(tx=>applyAssistantAction(randomUUID(),preview.conversation.id,action,action.fields,tx)),/not found/);
 await updatePerson(owner,person.id,{...person,phone:'+44 000 000'},person.version);
 await assert.rejects(()=>acceptAction(owner,preview.conversation.id,message.id,action.id,action.fields),/changed|version/i);
 assert.equal((await owned<Person>(owner,'person',person.id)).headline,person.headline);
 const records=await rows(sql`SELECT id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid AND kind='profile'`);assert.equal(records.length,2);
});

test("real agent: export request delivers formats without rewriting or generating new work",{timeout:180000},async()=>{
 const role=await createRole(owner,{title:"QA Lead",client_name:"QA Export",jd_text:"Lead delivery"});
 const [doc]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content) VALUES(${owner}::uuid,${role.id}::uuid,'submission','Saved recommendation','Existing factual recommendation. Availability remains unconfirmed.') RETURNING *`);
 const result=await reply("Export the linked recommendation as PDF and Word. Keep the saved wording unchanged; do not send it.",undefined,doc.id);
 const meta=result.messages.at(-1)!.metadata as AssistantMeta;
 assert.equal(meta.exports?.document_id,doc.id,result.messages.at(-1)?.content);assert.deepEqual(new Set(meta.exports?.formats),new Set(['pdf','docx']));
 assert.equal(meta.revision,undefined);assert.equal(meta.work?.length,0);assert.equal((await owned<Deliverable>(owner,'deliverable',doc.id)).version,doc.version);
 for(const format of ['pdf','docx'] as const){const response=await exportDocument(owner,doc.id,format,doc.version);const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.length>100);assert.equal(bytes.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');}
 await assert.rejects(()=>exportDocument(randomUUID(),doc.id,'pdf',doc.version),/not found/);
 await updateDeliverable(owner,doc.id,{title:doc.title,content:doc.content+' Reviewed.',expected_version:doc.version});
 await assert.rejects(()=>exportDocument(owner,doc.id,'pdf',doc.version),/changed|version/i);
});

test("real PG: candidate identity matches block accidental duplication but permit explicitly distinct people",async()=>{
 const [person]=await rows<Person>(sql`SELECT * FROM hirelix_agent_people WHERE user_id=${owner}::uuid LIMIT 1`);
 const [conversation]=await rows<{id:string}>(sql`INSERT INTO hirelix_private_conversations(user_id,title) VALUES(${owner}::uuid,'Identity confirmation QA') RETURNING id`);
 const request="This is a different individual who has the same name. Save a separate profile.";
 const action: import('../../src/lib/workspace/conversations').AssistantAction={id:randomUUID(),kind:'create_candidate',title:'Distinct individual',status:'pending',person_id:null,role_id:null,fields:{changes:{name:person.name,location:'Bath'},source_content:request,authorization_request:request,source_message_id:randomUUID()}};
 await assert.rejects(()=>db.transaction(tx=>applyAssistantAction(owner,conversation.id,action,action.fields,tx)),/already exists/);
 action.fields.separate_candidate_quote="Fabricated permission";
 await assert.rejects(()=>db.transaction(tx=>applyAssistantAction(owner,conversation.id,action,action.fields,tx)),/already exists/);
 action.fields.separate_candidate_quote="This is a different individual who has the same name.";
 await db.transaction(tx=>applyAssistantAction(owner,conversation.id,action,action.fields,tx));
 assert.equal(action.status,'saved');assert.notEqual(action.person_id,person.id);
 assert.equal((await owned<Person>(owner,'person',person.id)).location,'Bristol');
});
