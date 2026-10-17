import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationEmail } from "../src/components/workspace/conversation-email";
import { ConversationMessage } from "../src/components/workspace/conversation-message";
import { recipientAddressError, type ConversationEmail as Email } from "../src/lib/workspace/email-contract";
import type { Message } from "../src/lib/workspace/types";
Object.assign(globalThis, {React});
const email: Email = {status:"review",request_key:"test",snapshot:{from:"sender@gmail.com",to:"candidate@company.co.uk",title:"Role discussion",content:"Hello candidate",files:[],document_id:null,document_version:null}};
const render = (value: Email) => renderToStaticMarkup(React.createElement(ConversationEmail,{email:value,conversationId:"c",messageId:"m",onChanged:()=>{}}));
test("reserved recipient domains are blocked without rejecting real public domains",()=>{
  for(const address of ["a@example.test","a@EXAMPLE.COM","a@sub.invalid","a@localhost","broken"]) assert.ok(recipientAddressError(address));
  for(const address of ["a@gmail.com","a@examplecompany.com","a@test.co.uk"]) assert.equal(recipientAddressError(address),null);
  assert.match(render({...email,snapshot:{...email.snapshot,to:"a@example.test"}}),/role="alert".*?reserved test/);
});
test("email cards distinguish provider acceptance, unknown outcome, failure and active sending",()=>{
  assert.match(render(email),/ws-email-card/);
  assert.match(render({...email,status:"sent",receipt:"receipt-id"}),/Recipient delivery is not confirmed/);
  assert.match(render({...email,status:"sent"}),/Open Gmail Sent/);
  assert.match(render({...email,status:"unknown"}),/avoid a duplicate/);
  assert.match(render({...email,status:"failed",error:"Invalid recipient"}),/Invalid recipient/);
  assert.match(render({...email,status:"sending"}),/Waiting for Gmail confirmation/);
  assert.doesNotMatch(render({...email,status:"failed"}),/Confirm and send email/);
});
test("completed deterministic email turn displays persisted response and receipt without live text",()=>{
  const message = {id:"m",conversation_id:"c",role:"assistant",content:"Gmail accepted the email.",created_at:"2026-10-17T03:00:00Z",metadata:{email_result:{...email,status:"sent",preview_message_id:"preview"}}} as unknown as Message;
  const html=renderToStaticMarkup(React.createElement(ConversationMessage,{message,laterScheduleIds:[],onReady:()=>{},onRevise:()=>{},onMemories:()=>{},onSource:()=>{},onReview:()=>{},onCopy:()=>{},copiedId:null,activeJob:{status:"done",progress:"Complete",error:null,result:{}}}));
  assert.match(html,/Gmail accepted the email\./);
  assert.match(html,/ws-email-card/);
  assert.match(html,/candidate@company.co.uk/);
});
