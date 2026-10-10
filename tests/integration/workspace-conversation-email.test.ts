import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
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
 const messages=[{metadata:{email}} as unknown as Message];
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET created_at=now()-interval '3 minutes' WHERE id=${reserved.receipt.id}::uuid`);
 await hydrateEmailReceipts(owner,messages);
 assert.equal((messages[0].metadata.email as ConversationEmail).status,"unknown");
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='sent',provider_message_id='qa-receipt' WHERE id=${reserved.receipt.id}::uuid`);
 await hydrateEmailReceipts(owner,messages);
 assert.equal((messages[0].metadata.email as ConversationEmail).status,"sent");
 assert.equal((await sendConversationEmail(owner,snapshot,email.request_key,async()=>{throw new Error("must not execute again");})).status,"sent");
});

test("real PG: a rejected authorization is reported as needing reconnection until the grant changes",async()=>{
 const owner=randomUUID(),accountId=randomUUID();
 await db.execute(sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},'QA',${owner+'@example.test'},true,now(),now())`);
 await db.execute(sql`INSERT INTO account(id,"accountId","providerId","userId","accessToken",scope,"createdAt","updatedAt") VALUES(${accountId},${accountId},'google',${owner},'db-policy-fixture','https://www.googleapis.com/auth/gmail.send',now(),now()-interval '1 minute')`);
 assert.equal((await gmailConnection(owner)).connected,true);
 const receipt=await reserveConversationEmail(owner,snapshot,randomUUID(),"<qa@test>",async()=>{});
 await db.execute(sql`UPDATE hirelix_private_email_deliveries SET status='failed',error='Gmail declined sending. Reconnect Gmail and check that the Gmail API is enabled.' WHERE id=${receipt.receipt.id}::uuid`);
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
