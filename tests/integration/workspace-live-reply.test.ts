import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import {sql} from "drizzle-orm";
import {closeDb} from "../../src/db/client";
import {rows} from "../../src/lib/workspace/database";
import {sendMessage,assistantReply,conversationDetails} from "../../src/lib/workspace/conversations";
import {claimJob,finishJob,heartbeat,cancelJob,liveReplyWriter} from "../../src/lib/workspace/jobs";
import {initializeGlobalOutboundProxy} from "../../src/lib/server-outbound-proxy";
const url=new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/hirelix_workspace_qa_'));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,'true');
initializeGlobalOutboundProxy(); after(closeDb);
const owner=randomUUID();
test('real model and PG: provider prose appears before the final saved reply, cancellation blocks late writes',{timeout:240000},async()=>{
  const sent=await sendMessage(owner,{message:'Explain in English, in six short paragraphs, how a headhunter can prepare for a first client intake call. General advice only; do not create records, reminders, or save preferences.',request_key:randomUUID(),locale:'en'});
  const job=await claimJob(['chat']);assert.equal(job?.id,sent.job.id);
  const previews:string[]=[];
  const poll=setInterval(()=>{void rows<{result:{live_reply?:string}}>(sql`SELECT result FROM hirelix_private_jobs WHERE id=${job!.id}::uuid`).then(([row])=>{if(row.result?.live_reply)previews.push(row.result.live_reply);});},150);
  const beat=setInterval(()=>void heartbeat(job!),20000);
  try {
    const prepared=await assistantReply(job!,message=>heartbeat(job!,message));
    assert.ok(new Set(previews).size>=2,'at least two actual partial responses before final persistence');
    const before=await conversationDetails(owner,sent.conversation_id);assert.equal(before.messages.filter(m=>m.role==='assistant').length,0);
    await finishJob(job!,prepared);
    const detail=await conversationDetails(owner,sent.conversation_id);assert.equal(detail.messages.filter(m=>m.role==='assistant').length,1);
    assert.ok(previews.some(text=>text.length<detail.messages.at(-1)!.content.length));
    assert.ok(previews.every(text=>!text.includes('"actions":')));
    console.log(JSON.stringify({distinct_previews:new Set(previews).size,first_preview_chars:previews[0]?.length,final_chars:detail.messages.at(-1)!.content.length}));
  } finally {clearInterval(poll);clearInterval(beat);}
  const next=await sendMessage(owner,{message:'Cancellation QA',request_key:randomUUID(),locale:'en'});
  const cancelled=await claimJob(['chat']);assert.equal(cancelled?.id,next.job.id);
  const write=liveReplyWriter(cancelled!);await write('Unfinished response');await cancelJob(owner,cancelled!.id);
  await assert.rejects(()=>write(''),/taken over/);
  const [state]=await rows<{result:object;status:string}>(sql`SELECT result,status FROM hirelix_private_jobs WHERE id=${cancelled!.id}::uuid`);assert.equal(state.status,'cancelled');assert.deepEqual(state.result,{});
});
