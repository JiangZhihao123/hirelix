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
