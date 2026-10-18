import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { auth } from "../src/lib/auth";
import { toolResultMailbox, toolResultMailboxError } from "../src/lib/workspace/tool-result-view";
import { turnSnapshot, type TurnPart } from "../src/lib/workspace/turn-progress";
import { TurnParts } from "../src/components/workspace/turn-parts";
import { GET } from "../src/app/(product)/api/workspace/mailboxes/messages/route";
import { mailboxReadErrorActions } from "../src/lib/workspace/mailbox-contract";

Object.assign(globalThis, {React});
type ToolPart = Extract<TurnPart, {type:"tool"}>;
const part = (overrides: Partial<ToolPart> = {}): ToolPart => ({type:"tool",id:"fixture-call",tool:"search_mail",label:"Searching your mailbox",status:"done",...overrides});
const render = (value: ToolPart, running = false) => renderToStaticMarkup(React.createElement(TurnParts,{parts:[value],running}));

test("mailbox read error actions offer settings only for authorization failures", () => {
  for (const status of [401,403,409]) assert.deepEqual(mailboxReadErrorActions(status),{retry:false,settings:true});
  for (const status of [400,404,422]) assert.deepEqual(mailboxReadErrorActions(status),{retry:false,settings:false});
  for (const status of [429,500,502,undefined]) assert.deepEqual(mailboxReadErrorActions(status),{retry:true,settings:false});
});

test("Google and Microsoft search results project bounded inspectable headers without raw provider data", () => {
  const google = toolResultMailbox("search_mail",{provider:"google",messages:[{id:"g1",subject:"Client reply",from:"client@example.test",to:"owner@example.test",date:"2026-10-18T09:00:00Z",body:"not read yet",headers:{secret:"hidden"}}],more_available:true});
  assert.equal(google?.messages[0].subject,"Client reply");
  assert.equal(google?.messages[0].body,undefined);
  assert.equal(JSON.stringify(google).includes("hidden"),false);
  const microsoft = toolResultMailbox("search_mail",{provider:"microsoft",messages:[{id:"m1",subject:"Role feedback",from:{emailAddress:{address:"client@example.test"}},toRecipients:[{emailAddress:{address:"owner@example.test"}}],receivedDateTime:"2026-10-18T09:00:00Z",webLink:"https://outlook.office.com/mail/message/id",internetMessageHeaders:[{value:"hidden"}]}]});
  assert.equal(microsoft?.messages[0].from,"client@example.test");
  assert.equal(microsoft?.messages[0].to,"owner@example.test");
  assert.equal(microsoft?.messages[0].date,"2026-10-18T09:00:00Z");
  assert.equal(microsoft?.messages[0].source_url,"https://outlook.office.com/mail/message/id");
  assert.equal(toolResultMailbox("read_candidate",{provider:"google",messages:[]}),undefined);
  assert.equal(toolResultMailbox("search_mail",{provider:"unknown",messages:[]}),undefined);
  assert.equal(toolResultMailbox("search_mail",{provider:"google",messages:Array.from({length:21},(_,i)=>({id:String(i)}))})?.messages.length,20);
  const html = render(part({mail:google}));
  assert.match(html,/ws-email-card ws-mail-message/);
  assert.match(html,/Client reply/);
  assert.match(html,/client@example.test/);
  assert.match(html,/Open email/);
  assert.match(html,/More matching emails/);
  assert.doesNotMatch(html,/not read yet|"secret"/);
});

test("read cards preserve plain body, mailbox evidence and safe provider links through turn snapshots", () => {
  const mail = toolResultMailbox("read_mail",{provider:"google",id:"g1",subject:"<b>Subject</b>",from:"sender@example.test",body:'<script>alert("untrusted")</script>',mailbox_labels:["SENT"],headers:{authorization:"never-display"},source_url:"https://mail.google.com/mail/?authuser=owner%40example.test#all/g1"});
  const tool = part({tool:"read_mail",mail});
  const snapshot = turnSnapshot({id:"job",status:"done",progress:"Complete",error:null,updated_at:"2026-10-18T09:00:00Z",result:{parts:[tool],tool_receipts:{hidden:{headers:"never-display"}}}});
  assert.deepEqual(snapshot.result.parts?.[0],tool);
  assert.equal(JSON.stringify(snapshot).includes("never-display"),false);
  const html = render(tool);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>|<b>Subject/);
  assert.match(html,/Back to email results/);
  assert.match(html,/does not confirm recipient delivery/);
  assert.match(html,/Open original email/);
  assert.match(html,/rel="noopener noreferrer"/);
  for (const source_url of ["javascript:alert(1)","https://evil.test/mail", "https://mail.google.com.evil.test/mail", "https://secret@mail.google.com/mail","http://mail.google.com/mail","https://outlook.office.com/mail/id"]) {
    assert.equal(toolResultMailbox("read_mail",{provider:"google",id:"g1",source_url})?.messages[0].source_url,undefined);
  }
  const truncated = toolResultMailbox("read_mail",{provider:"microsoft",id:"m1",body:"x".repeat(30001)});
  assert.equal(truncated?.messages[0].body?.length,30000);
  assert.equal(truncated?.messages[0].truncated,true);
  assert.match(render(part({tool:"read_mail",mail:truncated})),/Only part of this email/);
  assert.match(render(part({tool:"read_mail",mail:toolResultMailbox("read_mail",{provider:"google",id:"empty",body:""})})),/no text body/);
});

test("mail result states distinguish loading, failure, interrupted, empty and legacy data", () => {
  assert.match(render(part({status:"running"}),true),/Searching your mailbox…/);
  assert.match(render(part({status:"running"})),/interrupted/);
  assert.match(render(part({status:"error"})),/Email request failed/);
  assert.doesNotMatch(render(part({status:"error"})),/No matching emails/);
  const blocked = render(part({status:"error",mail_error:toolResultMailboxError("search_mail",{ok:false,error:{code:409,message:"Reading is not available"}})}));
  assert.match(blocked,/Reading is not available/);
  assert.match(blocked,/Review email settings/);
  assert.doesNotMatch(blocked,/Retry the task/);
  assert.equal(toolResultMailboxError("search_mail",{ok:false,error:{code:"private-code",message:"raw provider error"}}),undefined);
  assert.match(render(part({mail:toolResultMailbox("search_mail",{provider:"google",messages:[]})})),/No matching emails/);
  assert.match(render(part()),/older result/);
  assert.doesNotMatch(render(part()),/No matching emails/);
});

test("message API requires a signed-in owner and existing read availability before accessing any provider", async (t) => {
  const previous = process.env.GMAIL_READ_ENABLED;
  t.after(() => { if (previous === undefined) delete process.env.GMAIL_READ_ENABLED; else process.env.GMAIL_READ_ENABLED = previous; });
  let signedIn = false, tokenCalls = 0;
  t.mock.getter(auth,"api",() => ({getSession:async () => signedIn ? {user:{id:"owner-fixture"}} : null,getAccessToken:async () => {tokenCalls++;throw Error("must not reach provider");}}));
  const req = () => new NextRequest("http://localhost:3000/api/workspace/mailboxes/messages?provider=google&message_id=g1");
  let response = await GET(req());
  assert.equal(response.status,401);
  assert.match(response.headers.get("cache-control")!,/no-store/);
  signedIn = true;
  process.env.GMAIL_READ_ENABLED = "false";
  response = await GET(req());
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/awaiting Google review/);
  assert.equal(tokenCalls,0);
  response = await GET(new NextRequest("http://localhost:3000/api/workspace/mailboxes/messages?provider=unknown&message_id=g1"));
  assert.equal(response.status,400);
  assert.equal(tokenCalls,0);
});

test("message API reads only the authenticated owner's mailbox and returns display fields, not credentials or headers", async (t) => {
  const previous = process.env.GMAIL_READ_ENABLED;
  process.env.GMAIL_READ_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.GMAIL_READ_ENABLED; else process.env.GMAIL_READ_ENABLED = previous; });
  t.mock.getter(auth,"api",() => ({getSession:async () => ({user:{id:"authenticated-owner"}}),getAccessToken:async ({body}:{body:{userId:string;providerId:string}}) => {
    assert.equal(body.userId,"authenticated-owner");assert.equal(body.providerId,"google");
    return {accessToken:"nonfunctional-fixture-token",scopes:["https://www.googleapis.com/auth/gmail.readonly"]};
  }}));
  const paths: string[] = [];
  t.mock.method(globalThis,"fetch",async (url: string) => {
    paths.push(url);
    return Response.json(url.includes("userinfo") ? {email:"owner@example.test"} : {id:"g1",threadId:"thread1",payload:{mimeType:"text/plain",body:{data:Buffer.from("Selected body").toString("base64url")},headers:[{name:"Subject",value:"Selected email"},{name:"Authorization",value:"hidden-provider-header"}]}});
  });
  const response = await GET(new NextRequest("http://localhost:3000/api/workspace/mailboxes/messages?provider=google&message_id=g1&user_id=other-owner"));
  assert.equal(response.status,200);
  assert.match(response.headers.get("cache-control")!,/private, no-store/);
  const data = await response.json();
  assert.equal(data.message.subject,"Selected email");
  assert.equal(data.message.body,"Selected body");
  assert.ok(data.message.source_url.includes("authuser=owner%40example.test"));
  assert.equal(JSON.stringify(data).includes("hidden-provider-header"),false);
  assert.equal(JSON.stringify(data).includes("nonfunctional-fixture-token"),false);
  assert.equal(paths.length,2);
  assert.ok(paths[0].includes("messages/g1?format=full"));
});
