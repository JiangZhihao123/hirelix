import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { mailboxConnection } from "../../src/lib/workspace/mailbox";
import { microsoftSuspendedMessage } from "../../src/lib/workspace/mailbox-errors";
import { rows,json } from "../../src/lib/workspace/database";
import { reserveConversationEmail,sendConversationEmail,gmailConnection } from "../../src/lib/workspace/gmail";
import { cancelConversationEmail,hydrateEmailReceipts,supersedeEmailReviews } from "../../src/lib/workspace/conversation-email";
import { sendMessage } from "../../src/lib/workspace/conversations";
import { createRole } from "../../src/lib/workspace/roles";
import type { Deliverable,Message } from "../../src/lib/workspace/types";
import type { EmailSnapshot,ConversationEmail } from "../../src/lib/workspace/email-contract";
const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
after(closeDb);
// Provider identity is mocked; these tests prove DB state, not live OAuth.
let microsoftRejected = true;
let microsoftSendCount = 0;
before(() => {
 const original = globalThis.fetch;
 mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (String(input) === "https://graph.microsoft.com/v1.0/me/sendMail") {
   microsoftSendCount++;
   return microsoftRejected ? Response.json({error:{code:"ErrorAccountSuspend",message:"private provider details"}},{status:403}) : new Response(null,{status:202});
  }
  if (String(input).startsWith("https://graph.microsoft.com/v1.0/me?")) return Response.json({mail:"sender@example.test"});
  if (String(input) === "https://www.googleapis.com/oauth2/v2/userinfo") return Response.json({email:"sender@example.test"});
  return original(input, init);
 });
});
after(() => mock.restoreAll());
const snapshot:EmailSnapshot = {from:"sender@example.test",to:"recipient@example.test",title:"Reviewed email",content:"Only this body is approved.",files:[],document_id:null,document_version:null};
// Real PostgreSQL reservation/policy tests. No provider-send claim is made here.
test("real PG: concurrent ordinary email sends and unknown outcomes reserve only once",async()=>{
 const owner=randomUUID(), key=randomUUID();
 const reserved=await Promise.all(Array.from({length:8},()=>reserveConversationEmail(owner,snapshot,randomUUID(),"<qa@test>",async()=>{})));
 assert.equal(reserved.filter(x=>x.send).length,1);
 assert.equal(new Set(reserved.map(x=>x.receipt.id)).size,1);
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='unknown' WHERE id=${reserved[0].receipt.id}::uuid`);
 assert.equal((await reserveConversationEmail(owner,snapshot,key,"<qa@test>",async()=>{})).send,false);
 const changed=await reserveConversationEmail(owner,{...snapshot,content:"New reviewed body"},key,"<qa@test>",async()=>{});
 assert.equal(changed.send,true);
 await assert.rejects(()=>reserveConversationEmail(owner,{...snapshot,to:"changed@example.test"},key,"<qa@test>",async()=>{}),/another email/);
 await assert.rejects(()=>sendConversationEmail(owner,{...snapshot,to:"changed@example.test"},key,async()=>{}),/another email/);
});
test("real PG: rejected/stopped guard rolls back without creating a delivery",async()=>{
 const owner=randomUUID();
 await assert.rejects(()=>reserveConversationEmail(owner,snapshot,randomUUID(),"<qa@test>",async()=>{throw new Error("Stopped");}),/Stopped/);
 assert.equal((await rows(sql`SELECT id FROM hirelix_private_email_deliveries WHERE user_id=${owner}::uuid`)).length,0);
});
test("real PG: changed document, wrong owner and changed content invalidate confirmation",async()=>{
 const owner=randomUUID(),role=await createRole(owner,{title:"QA",client_name:"QA",jd_text:"QA"});
 const [doc]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission',${snapshot.title},${snapshot.content},${json({audience:"client",language:"en",people:[],files:[]})}) RETURNING *`);
 const linked={...snapshot,document_id:doc.id,document_version:doc.version};
 await assert.rejects(()=>reserveConversationEmail(randomUUID(),linked,randomUUID(),"<qa@test>",async()=>{}),/not found/);
 await assert.rejects(()=>reserveConversationEmail(owner,{...linked,content:"Not reviewed"},randomUUID(),"<qa@test>",async()=>{}),/changed/);
 await db.execute(sql`UPDATE hirelix_private_deliverables SET version=version+1 WHERE id=${doc.id}::uuid`);
 await assert.rejects(()=>reserveConversationEmail(owner,linked,randomUUID(),"<qa@test>",async()=>{}),/changed/);
});
test("real PG: cancellation and supersession survive reload and reject stale/cross-user confirmations",async()=>{
 const owner=randomUUID();
 const [conv]=await rows<{id:string}>(sql`INSERT INTO hirelix_private_conversations(user_id,title) VALUES(${owner}::uuid,'QA email') RETURNING id`);
 const email:ConversationEmail={status:"review",snapshot,request_key:randomUUID()};
 const [message]=await rows<Message>(sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content,metadata) VALUES(${owner}::uuid,${conv.id}::uuid,'assistant','Review',${json({email})}) RETURNING *`);
 await assert.rejects(()=>cancelConversationEmail(randomUUID(),conv.id,message.id),/not found/);
 await cancelConversationEmail(owner,conv.id,message.id);
 await cancelConversationEmail(owner,conv.id,message.id);
 await assert.rejects(()=>sendMessage(owner,{conversation_id:conv.id,email_confirmation_message_id:message.id,message:"Send",request_key:randomUUID()}),/no longer available/);
 await db.execute(sql`UPDATE hirelix_agent_messages SET metadata=${json({email})} WHERE id=${message.id}::uuid`);
 await db.transaction(tx=>supersedeEmailReviews(owner,conv.id,tx));
 await assert.rejects(()=>sendMessage(owner,{conversation_id:conv.id,email_confirmation_message_id:message.id,message:"Send",request_key:randomUUID()}),/no longer available/);
});
test("real PG: provider receipt restores a completed or ambiguous send after interrupted conversation commit",async()=>{
 const owner=randomUUID(),email:ConversationEmail={status:"sending",snapshot,request_key:randomUUID()};
 const reserved=await reserveConversationEmail(owner,snapshot,email.request_key,"<qa@test>",async()=>{});
 const messages=[{metadata:{email}} as unknown as Message, {metadata:{email_result:{...email,preview_message_id:"preview"}}} as unknown as Message];
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET created_at=now()-interval '3 minutes' WHERE id=${reserved.receipt.id}::uuid`);
 await hydrateEmailReceipts(owner,messages);
 assert.equal((messages[0].metadata.email as ConversationEmail).status,"unknown");
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='sent',provider_message_id='qa-receipt' WHERE id=${reserved.receipt.id}::uuid`);
 await hydrateEmailReceipts(owner,messages);
 assert.equal((messages[0].metadata.email as ConversationEmail).status,"sent");
 assert.equal((messages[1].metadata.email_result as ConversationEmail).status,"sent");
 assert.equal((messages[1].metadata.email_result as {preview_message_id:string}).preview_message_id,"preview");
 assert.equal((await sendConversationEmail(owner,snapshot,email.request_key,async()=>{throw new Error("must not execute again");})).status,"sent");
});

test("real PG: a rejected authorization is reported as needing reconnection until the grant changes",async()=>{
 const owner=randomUUID(),accountId=randomUUID();
 await db.execute(sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},'QA',${owner+'@example.test'},true,now(),now())`);
 await db.execute(sql`INSERT INTO account(id,"accountId","providerId","userId","accessToken",scope,"createdAt","updatedAt") VALUES(${accountId},${accountId},'google',${owner},'db-policy-fixture','https://www.googleapis.com/auth/gmail.send',now(),now()-interval '1 minute')`);
 assert.equal((await gmailConnection(owner)).connected,true);
 const receipt=await reserveConversationEmail(owner,snapshot,randomUUID(),"<qa@test>",async()=>{});
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='failed',error='Mailbox authorization has expired. Reconnect this mailbox to renew access.' WHERE id=${receipt.receipt.id}::uuid`);
 assert.equal((await gmailConnection(owner)).requires_reconnect,true);
 assert.equal((await gmailConnection(owner)).connected,false);
 await db.execute(sql`UPDATE account SET "updatedAt"=now() WHERE id=${accountId}`);
 assert.equal((await gmailConnection(owner)).connected,true);
});
test("real PG: recovered provider acceptance records document delivery without a second send",async()=>{
 const owner=randomUUID(),role=await createRole(owner,{title:"QA recovery",client_name:"QA",jd_text:"QA"});
 const [doc]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission',${snapshot.title},${snapshot.content},${json({audience:"client",language:"en",people:[],files:[]})}) RETURNING *`);
 const linked={...snapshot,document_id:doc.id,document_version:doc.version},key=randomUUID();
 const receipt=await reserveConversationEmail(owner,linked,key,"<qa@test>",async()=>{});
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='sent',provider_message_id='accepted-before-interruption' WHERE id=${receipt.receipt.id}::uuid`);
 assert.equal((await sendConversationEmail(owner,linked,key,async()=>{throw new Error("must not send twice");})).status,'sent');
 const [updated]=await rows<Deliverable>(sql`SELECT * FROM hirelix_private_deliverables WHERE id=${doc.id}::uuid`);
 assert.equal(updated.status,'submitted');
});

test('real PG: Agent email preparation joins its turn receipt and failed revision preserves the reviewed email',async()=>{
 const {prepareEmailReply}=await import('../../src/lib/workspace/conversation-email');
 const {commitAgentTool}=await import('../../src/lib/workspace/agent-execution');
 const {claimJob,finishJob}=await import('../../src/lib/workspace/jobs');
 const {conversationDetails}=await import('../../src/lib/workspace/conversations');
 const {emailPlanSchema}=await import('../../src/lib/workspace/email-contract');
 const owner=randomUUID();
 await db.execute(sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},'Fictional QA',${owner+'@example.test'},true,now(),now())`);
 await db.execute(sql`INSERT INTO account(id,"accountId","providerId","userId","accessToken",scope,"createdAt","updatedAt") VALUES(${randomUUID()},${owner},'google',${owner},'identity-test-fixture','openid email profile',now(),now())`);
 const sent=await sendMessage(owner,{message:'Prepare a fictional test email, preview only.',request_key:randomUUID()});
 const job=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert(job);
 const detail=await conversationDetails(owner,sent.conversation_id),question=detail.messages[0];
 const plan=emailPlanSchema.parse({intent:'prepare',to:'recipient@example.test',subject:'Fictional QA',body:'Fictional QA only.',use_document:false,authorization_quote:question.content});
 const prepared=await prepareEmailReply({job,conversation:detail.conversation,question,messages:detail.messages,document:null,plan,locale:'en',inline:true});
 await commitAgentTool(job,'email',plan,async tx=>{
  const result=await prepared.apply!(tx);assert(result);
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_messages WHERE conversation_id=${sent.conversation_id}::uuid AND role='assistant'`,tx)).length,0);
  return {output:result,metadata:result.metadata as import('../../src/lib/workspace/conversations').AssistantMeta};
 });
 const after=await conversationDetails(owner,sent.conversation_id),assistant=after.messages.filter(m=>m.role==='assistant');
 assert.equal(assistant.length,1);assert.equal((assistant[0].metadata.email as ConversationEmail).status,'review');
 assert.equal(assistant[0].metadata.reply_request_key,job.request_key);
 const failed=await prepareEmailReply({job,conversation:detail.conversation,question,messages:after.messages,document:null,plan:{...plan,to:"not-an-email"},locale:'en',inline:true});
 await db.transaction(tx=>failed.apply!(tx));
 const [retained]=await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE id=${assistant[0].id}::uuid`);
 assert.equal((retained.metadata.email as ConversationEmail).status,'review','a failed edit cannot discard the last valid preview');
 await finishJob(job,{result:{}});
});

test('real PG: document email edits apply with CVs and no link, and confirmation validates the exact preview',async()=>{
 const {prepareEmailReply}=await import('../../src/lib/workspace/conversation-email');
 const {claimJob,finishJob}=await import('../../src/lib/workspace/jobs');
 const {conversationDetails}=await import('../../src/lib/workspace/conversations');
 const {emailPlanSchema}=await import('../../src/lib/workspace/email-contract');
 const owner=randomUUID();
 await db.execute(sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},'Fictional QA',${owner+'@example.test'},true,now(),now())`);
 await db.execute(sql`INSERT INTO account(id,"accountId","providerId","userId","accessToken",scope,"createdAt","updatedAt") VALUES(${randomUUID()},${owner},'google',${owner},'identity-test-fixture','openid email profile',now(),now())`);
 const role=await createRole(owner,{title:'QA email edits',client_name:'Fictional QA',jd_text:'QA'});
 const file={id:randomUUID(),person_id:randomUUID(),name:'fictional.pdf',sha256:'a'.repeat(64)};
 const [doc]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','Saved recommendation','Saved recommendation body',${json({audience:'client',language:'en',people:[],files:[file]})}) RETURNING *`);
 const sent=await sendMessage(owner,{message:'Prepare a fictional document email with my edited subject and introduction; retain its CV.',request_key:randomUUID()});
 const job=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert(job);
 try {
  const detail=await conversationDetails(owner,sent.conversation_id),question=detail.messages[0];
  for (const overrides of [{subject:'Edited subject',body:'Edited introduction and recommendation body'}, {subject:'Subject only',body:null}, {subject:null,body:'Body only'}, {subject:null,body:null}]) {
   const plan=emailPlanSchema.parse({intent:'prepare',to:'recipient@example.test',...overrides,use_document:true,include_link:false,attach_cvs:true,authorization_quote:question.content});
   const prepared=await prepareEmailReply({job,conversation:detail.conversation,question,messages:detail.messages,document:doc,plan,locale:'en',inline:true});
   const applied=await db.transaction(tx=>prepared.apply!(tx));
   const email=(applied!.metadata as {email:ConversationEmail}).email;assert(email);
   assert.equal(email.snapshot.title,overrides.subject??doc.title);
   assert.equal(email.snapshot.content,overrides.body??doc.content);
   assert.equal(email.snapshot.files[0].id,file.id);
   assert.equal(email.snapshot.recommendation_delivery?.attach_cvs,true);
   const reserved=await reserveConversationEmail(owner,email.snapshot,email.request_key,'<qa@test>',async()=>{});
   assert.equal(reserved.send,true);
   assert.equal((await reserveConversationEmail(owner,email.snapshot,randomUUID(),'<qa@test>',async()=>{})).send,false);
   await assert.rejects(()=>reserveConversationEmail(owner,{...email.snapshot,content:'Unreviewed change'},randomUUID(),'<qa@test>',async()=>{}),/changed/);
  }
  const [unchanged]=await rows<Deliverable>(sql`SELECT * FROM hirelix_private_deliverables WHERE id=${doc.id}::uuid`);
  assert.equal(unchanged.content,doc.content);
  assert.equal(unchanged.version,doc.version);
 } finally { await finishJob(job,{result:{}}); }
});

test("real PG: reserved recipient is rejected before OAuth, send reservation or provider request",async()=>{
 const owner=randomUUID(),accountId=randomUUID(),key=randomUUID();
 await db.execute(sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},'QA',${owner+'@gmail.com'},true,now(),now())`);
 await db.execute(sql`INSERT INTO account(id,"accountId","providerId","userId","accessToken",scope,"createdAt","updatedAt") VALUES(${accountId},${accountId},'google',${owner},'nonfunctional-policy-fixture','https://www.googleapis.com/auth/gmail.send',now(),now())`);
 await assert.rejects(()=>sendConversationEmail(owner,{...snapshot,from:'sender@gmail.com'},key,async()=>{throw new Error('must not reserve');}),/reserved test or example domain/);
 assert.equal((await rows(sql`SELECT id FROM hirelix_private_email_deliveries WHERE user_id=${owner}::uuid`)).length,0);
});

test('real PG: reply identity participates in deduplication and a repeated acceptance never sends again',async()=>{
 const owner=randomUUID();
 const reply={message_id:'incoming-one',thread_id:'thread-one',subject:'Original',source_url:'https://outlook.live.com/mail/'};
 const value={...snapshot,provider:'microsoft' as const,reply};
 const key=randomUUID();
 const first=await reserveConversationEmail(owner,value,key,'<reply-one@test>',async()=>{});
 assert.equal(first.send,true);
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='sent' WHERE id=${first.receipt.id}::uuid`);
 const duplicate=await reserveConversationEmail(owner,{...value,reply:{source_url:reply.source_url,subject:reply.subject,thread_id:reply.thread_id,message_id:reply.message_id}},randomUUID(),'<retry@test>',async()=>{});
 assert.equal(duplicate.send,false);
 assert.equal(duplicate.receipt.id,first.receipt.id);
 const other=await reserveConversationEmail(owner,{...value,reply:{...reply,message_id:'incoming-two'}},randomUUID(),'<reply-two@test>',async()=>{});
 assert.equal(other.send,true);
 assert.equal((await sendConversationEmail(owner,value,key,async()=>{throw Error('must not send again')})).status,'sent');
 await assert.rejects(sendConversationEmail(owner,{...value,reply:{...reply,message_id:'incoming-two'}},key,async()=>{}),/another email/);
});

// Provider identity remains a controlled fixture. This verifies persisted recovery state, not account recovery.
test("real PG: suspension retains its explanation and does not lock out an authorized retry",async()=>{
 const owner=randomUUID(),accountId=randomUUID();
 const previousId=process.env.MICROSOFT_CLIENT_ID,previousSecret=process.env.MICROSOFT_CLIENT_SECRET;
 process.env.MICROSOFT_CLIENT_ID ||= "qa-config"; process.env.MICROSOFT_CLIENT_SECRET ||= "qa-config";
 try {
  await db.execute(sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},'QA',${owner+'@example.test'},true,now(),now())`);
  await db.execute(sql`INSERT INTO account(id,"accountId","providerId","userId","accessToken",scope,"createdAt","updatedAt") VALUES(${accountId},${accountId},'microsoft',${owner},'db-policy-fixture','Mail.Send User.Read',now(),now()-interval '1 minute')`);
  const reserved=await reserveConversationEmail(owner,{...snapshot,provider:"microsoft"},randomUUID(),"<qa@test>",async()=>{});
  await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='failed',error=${microsoftSuspendedMessage} WHERE id=${reserved.receipt.id}::uuid`);
  const connection=await mailboxConnection(owner,"microsoft");
  assert.equal(connection.error,microsoftSuspendedMessage);
  assert.equal(connection.needs_reconnect,false);
  assert.equal(connection.connected,true,"An OAuth identity is distinct from provider sending restrictions");
  await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='sent',error=NULL,updated_at=now() WHERE id=${reserved.receipt.id}::uuid`);
  assert.equal((await mailboxConnection(owner,"microsoft")).error,undefined);
 } finally {
  if(previousId===undefined) delete process.env.MICROSOFT_CLIENT_ID; else process.env.MICROSOFT_CLIENT_ID=previousId;
  if(previousSecret===undefined) delete process.env.MICROSOFT_CLIENT_SECRET; else process.env.MICROSOFT_CLIENT_SECRET=previousSecret;
 }
});

test("real PG with controlled HTTP: provider suspension survives send receipt and later accepted retry clears it",async()=>{
 const owner=randomUUID(),accountId=randomUUID();
 const previousId=process.env.MICROSOFT_CLIENT_ID,previousSecret=process.env.MICROSOFT_CLIENT_SECRET;
 process.env.MICROSOFT_CLIENT_ID ||= "qa-config"; process.env.MICROSOFT_CLIENT_SECRET ||= "qa-config";
 try {
  await db.execute(sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},'QA',${owner+'@example.test'},true,now(),now())`);
  await db.execute(sql`INSERT INTO account(id,"accountId","providerId","userId","accessToken",scope,"createdAt","updatedAt") VALUES(${accountId},${accountId},'microsoft',${owner},'db-policy-fixture','Mail.Send User.Read',now(),now()-interval '1 minute')`);
  const key=randomUUID(),email={...snapshot,to:"qa@hirelix.online",provider:"microsoft" as const};
  const initial=await sendConversationEmail(owner,email,key,async()=>{});
  assert.equal(initial.status,"failed"); assert.equal(microsoftSendCount,1);
  const [receipt]=await rows<{error:string}>(sql`SELECT error FROM hirelix_private_email_deliveries WHERE id=${initial.receipt}::uuid`);
  assert.equal(receipt.error,microsoftSuspendedMessage);
  assert.equal((await mailboxConnection(owner,"microsoft")).needs_reconnect,false);
  await sendConversationEmail(owner,email,key,async()=>{});
  assert.equal(microsoftSendCount,1,"Same request never silently retries an external send");
  microsoftRejected=false;
  assert.equal((await sendConversationEmail(owner,email,randomUUID(),async()=>{})).status,"sent");
  assert.equal(microsoftSendCount,2);
  assert.equal((await mailboxConnection(owner,"microsoft")).error,undefined);
 } finally {
  microsoftRejected=true;
  if(previousId===undefined) delete process.env.MICROSOFT_CLIENT_ID; else process.env.MICROSOFT_CLIENT_ID=previousId;
  if(previousSecret===undefined) delete process.env.MICROSOFT_CLIENT_SECRET; else process.env.MICROSOFT_CLIENT_SECRET=previousSecret;
 }
});
