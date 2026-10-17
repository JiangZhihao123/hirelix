import assert from "node:assert/strict";
import {test} from "node:test";
import {conversationTurnView} from "../src/components/workspace/conversation-turn-view";
import type {Job, Message} from "../src/lib/workspace/types";
const user:Message={id:"user",role:"user",content:"hi",conversation_id:"c",metadata:{},created_at:"2026-10-13T00:00:00Z"};
const job={id:"j",request_key:"request",status:"running",payload:{},result:{parts:[{type:"text",text:"hello"}]},created_at:user.created_at} as unknown as Job;
test("waiting, streaming, tool receipt and final message preserve the same React key",()=>{
 const base={messages:[user],job,conversationId:"c",pendingKey:"request",sending:false};
 const waiting=conversationTurnView({...base,sending:true});const stream=conversationTurnView(base);
 const saved:Message={...user,id:"saved",role:"assistant",content:"hello",metadata:{reply_request_key:"request",parts:job.result!.parts}};
 const receipt=conversationTurnView({...base,messages:[user,saved],job:{...job,result:{...job.result,receipt_message_id:"saved"}}});
 const final=conversationTurnView({...base,messages:[user,saved],job:{...job,status:"done",result:{...job.result,message_id:"saved"}}});
 assert.equal(waiting.at(-1)!.key,stream.at(-1)!.key);assert.equal(stream.at(-1)!.key,receipt.at(-1)!.key);assert.equal(receipt.at(-1)!.key,final.at(-1)!.key);
 assert.equal(final.length,2);assert.equal(final.at(-1)!.activeJob?.status,"done");
 const next=conversationTurnView({...base,messages:[user,saved],job:{...job,id:"next",request_key:"next",result:null}});
 assert.equal(next[1].key,final[1].key);assert.equal(next.length,3);
});

test("saved reply and pending placeholder never duplicate during send settlement", () => {
 const saved: Message = {...user, id: "saved", role: "assistant", content: "hello", metadata: {reply_request_key: "request"}};
 const base = {messages: [user, saved], job: {...job, status: "done" as const, result: {message_id: "saved"}}, conversationId: "c", sending: true};
 const settling = conversationTurnView({...base, pendingKey: "request"});
 assert.equal(settling.length, 2);
 const next = conversationTurnView({...base, pendingKey: "next-request"});
 assert.equal(next.length, 3);
 assert.equal(new Set(next.map(item => item.key)).size, next.length);
 assert.equal(next[1].key, settling[1].key);
 assert.equal(next[2].key, "message:next-request");
});


test("early tool receipt inherits running state before the receipt id reaches the stream", () => {
 const receipt: Message = {...user, id: "receipt", role: "assistant", content: "", metadata: {reply_request_key: "request", committed_tools: true}};
 for (const sending of [false, true]) {
  const view = conversationTurnView({messages: [user, receipt], job, conversationId: "c", pendingKey: "request", sending});
  assert.equal(view.length, 2);
  assert.equal(view[1].activeJob?.status, "running");
 }
});

test("first message stays visible through conversation promotion until persisted readback", () => {
 const optimistic = {text:"hi",priorIds:[]};
 const base = {messages:[] as Message[],pendingKey:"request",optimistic};
 const before = conversationTurnView({...base,conversationId:null,sending:true});
 const promoted = conversationTurnView({...base,conversationId:"c",sending:false,job});
 for (const view of [before,promoted]) {
  assert.equal(view.filter(item=>item.message.role === "user").length,1);
  assert.equal(view[0].message.content,"hi");
  assert.equal(view.length,2);
 }
 assert.equal(before[0].key,promoted[0].key);
 assert.equal(before[1].key,promoted[1].key);
 const persisted = conversationTurnView({...base,conversationId:"c",sending:false,job,messages:[user]});
 assert.equal(persisted.filter(item=>item.message.role === "user").length,1);
 assert.equal(persisted.some(item=>item.optimistic),false);
});
