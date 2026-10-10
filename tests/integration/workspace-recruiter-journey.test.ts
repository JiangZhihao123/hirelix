import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, test} from "node:test";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../../src/db/client";
import {initializeGlobalOutboundProxy} from "../../src/lib/server-outbound-proxy";
import {createPerson} from "../../src/lib/workspace/people";
import {createRole} from "../../src/lib/workspace/roles";
import {sendMessage, conversationDetails, type AssistantMeta} from "../../src/lib/workspace/conversations";
import {workspaceHandlers} from "../../src/lib/workspace/worker";
import {claimJob, finishJob, failJob, heartbeat} from "../../src/lib/workspace/jobs";
import {rows} from "../../src/lib/workspace/database";
import type {Role, SourceRecord, Deliverable, JobKind} from "../../src/lib/workspace/types";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});
async function execute(kind: JobKind, expected?: string) {
  const job = await claimJob([kind]); assert(job); assert.equal(job.user_id, owner); if(expected) assert.equal(job.id,expected);
  const timer=setInterval(()=>void heartbeat(job),20000);
  try {await finishJob(job,await workspaceHandlers[kind]!(job,message=>heartbeat(job,message)));}
  catch(error){await failJob(job,"Recruiter journey QA failed"); throw error;}
  finally{clearInterval(timer);}
}
async function indexAll() {
  while((await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued'`)).length) await execute("index");
}
async function chat(message:string,conversation_id?:string) {
  const sent=await sendMessage(owner,{message,conversation_id,locale:"en",timezone:"Asia/Shanghai",request_key:randomUUID()});
  await execute("chat",sent.job.id);
  const result=await conversationDetails(owner,sent.conversation_id);
  const last=result.messages.at(-1)!;
  console.log(JSON.stringify({request:message,answer:last.content,metadata:last.metadata}));
  return {...result,meta:last.metadata as AssistantMeta};
}
test("real recruiter journey: new mandate, ordinary call update, correction, private fact and correct-client document",{timeout:600000},async()=>{
  const person=await createPerson(owner,{name:"Avery Moss Journey",headline:"Product Director",location:"Bristol",profile:{summary:"Product leader in warehouse logistics",experience:[{company:"Fictional Orchard Logistics",title:"Senior Product Manager",dates:"2021-present",description:"Led three product managers delivering a warehouse exception-management workflow, reducing median resolution time from 9 hours to 4 hours."}]}});
  const distractor=await createRole(owner,{title:"Head of Product",client_name:"Fictional Meridian",jd_text:"Lead four PMs in analytics SaaS onboarding. London every Tuesday. GBP 140000-160000."});
  await indexAll();
  const start=await chat("I've just taken on Product Director for Fictional Willow Journey. They build warehouse operations software and need someone who has shipped exception-management workflows and led three or more PMs. Bristol on Tuesdays, GBP 140000-160000 base. Logistics experience matters more than a fancy title. Get this search started. Who do I already know that would be worth talking to?");
  const [role]=await rows<Role>(sql`SELECT * FROM hirelix_private_roles WHERE user_id=${owner}::uuid AND client_name LIKE '%Willow%'`);
  assert(role,"a definite new mandate should become a saved role without database terminology");
  assert(start.meta.actions?.some(a=>a.kind==="create_role"&&a.status==="saved"));
  assert.match(start.messages.at(-1)!.content,/Avery/);
  await indexAll();
  const follow=await chat("Just spoke to Avery. Tuesdays in Bristol are fine; London isn't. He's on GBP 145000 now and would move for GBP 160000 base. Three months' notice. He owned the roadmap as well as leading three PMs and doesn't want a team bigger than five. He's interested in Willow. I haven't asked about sharing his CV yet.",start.conversation.id);
  assert(follow.meta.actions?.some(a=>a.status==="saved"));
  const correction=await chat("Sorry, GBP 155000 is what he'd move for, not GBP 160000. Keep what he earns now between us.",start.conversation.id);
  assert(correction.meta.actions?.some(a=>a.status==="saved"));
  const records=await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid`);
  assert.match(JSON.stringify(records),/155[,.]?000/);
  assert.match(JSON.stringify(records),/confidential|internal only|keep.*(?:private|between)|not.*client|do not.*(?:disclose|share)/i,"the restriction must persist, not only appear in the assistant promise");
  const prepared=await chat("Avery emailed that I can share his CV and profile with Willow for this role. Prepare a short introduction for the founder, leading with the warehouse work. Use the call notes for his move figure, notice period and Tuesday attendance. I'll send it myself.",start.conversation.id);
  assert(prepared.meta.actions?.some(a=>a.kind==="update_sharing_permission"&&a.role_id===role.id&&a.status==="saved"));
  const work=prepared.meta.work?.find(item=>item.kind==="submission"); assert(work,JSON.stringify(prepared.meta));
  await execute("deliverable",work.job_id);
  const [document]=await rows<Deliverable>(sql`SELECT * FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid ORDER BY created_at DESC LIMIT 1`);
  assert.equal(document.role_id,role.id);
  assert.match(document.content,/warehouse|exception/i);
  assert.match(document.content,/155[,.]?000/);
  assert.doesNotMatch(document.content,/145[,.]?000|Meridian/);
  const wrong=await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${distractor.id}::uuid AND permission='confirmed'`);
  assert.equal(wrong.length,0);
  const missing=await chat("Avery gave permission to share with Fictional Hazel, a different client from Willow or Meridian. Prepare his introduction for Hazel. I have not given you Hazel's vacancy yet.",start.conversation.id);
  assert.equal(missing.meta.question?.status,"waiting");
  assert.equal(missing.meta.work?.length||0,0);
  assert.equal(missing.meta.actions?.length||0,0,"missing role must not become authorization on a different client");
});
