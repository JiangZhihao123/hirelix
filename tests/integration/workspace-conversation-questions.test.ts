import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { sendMessage, assistantReply, conversationDetails, listConversations, type AssistantMeta } from "../../src/lib/workspace/conversations";
import { cancelQuestion } from "../../src/lib/workspace/conversation-questions";
import { rows, json } from "../../src/lib/workspace/database";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { listReminders } from "../../src/lib/workspace/reminders";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,"true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async()=>{await db.execute(sql`UPDATE hirelix_private_schedules SET enabled=false WHERE user_id=${owner}::uuid`);await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);await closeDb();});
async function execute(sent: Awaited<ReturnType<typeof sendMessage>>) {
  const job=await claimJob(["chat"]);assert.equal(job?.id,sent.job.id);
  const timer=setInterval(()=>void heartbeat(job!),20000);
  try {await finishJob(job!,await assistantReply(job!,()=>heartbeat(job!)));}finally{clearInterval(timer);}
  return conversationDetails(owner,sent.conversation_id);
}
test("real model and PG: missing information waits, survives reload, then resumes original reminder exactly once",{timeout:180000},async()=>{
  const sent=await sendMessage(owner,{message:"Remind me to call fictional Mira about availability. I have not chosen a date or time; ask me before scheduling it.",request_key:randomUUID(),locale:"en",timezone:"Europe/London"});
  const detail=await execute(sent);const message=detail.messages.at(-1)!;
  const question=(message.metadata as AssistantMeta).question;assert.equal(question?.status,"waiting");
  assert.equal((await listReminders(owner)).length,0);
  assert.equal((await conversationDetails(owner,sent.conversation_id)).messages.at(-1)!.metadata.question && question.status,"waiting");
  assert.equal((await listConversations(owner)).find(c=>c.id===sent.conversation_id)?.unread,true);
  const request={conversation_id:sent.conversation_id,question_message_id:message.id,message:"9 October 2030 at 09:00 Europe/London.",request_key:randomUUID(),locale:"en",timezone:"Europe/London"};
  const resumed=await sendMessage(owner,request);
  assert.equal((await sendMessage(owner,request)).job.id,resumed.job.id);
  await assert.rejects(()=>sendMessage(owner,{...request,request_key:randomUUID()}),/previous reply|already been answered/);
  const completed=await execute(resumed);
  assert.equal((completed.messages.find(m=>m.id===message.id)!.metadata as AssistantMeta).question?.status,"answered");
  assert.equal((completed.messages.at(-1)!.metadata as AssistantMeta).question,undefined);
  const reminders=await listReminders(owner);assert.equal(reminders.length,1);
  assert.match(reminders[0].title,/Mira/i);
  assert.equal(new Date(reminders[0].next_run_at).toISOString(),"2030-10-09T08:00:00.000Z");
});

test("real PG: questions are owner isolated, cancellable, and reject stale answers",async()=>{
  const [conversation]=await rows<{id:string}>(sql`INSERT INTO hirelix_private_conversations(user_id,title) VALUES(${owner}::uuid,'Question cancellation QA') RETURNING id`);
  const [message]=await rows<{id:string}>(sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${owner}::uuid,'assistant','Which date?',${conversation.id}::uuid,${json({question:{question:"Which date?",options:[],status:"waiting",request:"Remind me to call Mira"}})}) RETURNING id`);
  await assert.rejects(()=>cancelQuestion(randomUUID(),conversation.id,message.id),/not found/);
  await cancelQuestion(owner,conversation.id,message.id);await cancelQuestion(owner,conversation.id,message.id);
  await assert.rejects(()=>sendMessage(owner,{conversation_id:conversation.id,question_message_id:message.id,message:"Tomorrow",request_key:randomUUID()}),/already been answered or cancelled/);
  const detail=await conversationDetails(owner,conversation.id);
  assert.equal(detail.messages.length,1,"rejected answer transaction rolls back its message");
  assert.equal((detail.messages[0].metadata as AssistantMeta).question?.status,"cancelled");
});

test("real model and PG: a normal chat answer completes the original JD save without repeating the instruction",{timeout:180000},async()=>{
  const sent=await sendMessage(owner,{message:"Save a role from this JD: Head of Product, lead six product managers on enterprise onboarding in London. I have not supplied the client name; ask me for it before saving.",request_key:randomUUID(),locale:"en"});
  const waiting=await execute(sent);
  assert.equal((waiting.messages.at(-1)!.metadata as AssistantMeta).question?.status,"waiting");
  const before=await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);assert.equal(before.length,0);
  const answered=await sendMessage(owner,{conversation_id:sent.conversation_id,message:"The client is fictional Oakfield Labs.",request_key:randomUUID(),locale:"en"});
  const finished=await execute(answered);
  const actions=(finished.messages.at(-1)!.metadata as AssistantMeta).actions;
  assert.equal(actions?.find(a=>a.kind==="create_role")?.status,"saved");
  const roles=await rows<{jd_text:string;client_name:string}>(sql`SELECT jd_text,client_name FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  assert.equal(roles.length,1);assert.match(roles[0].client_name,/Oakfield/);assert.match(roles[0].jd_text,/six|6/);
});
