import assert from "node:assert/strict";
import { getGlobalDispatcher } from "undici";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import {sql} from "drizzle-orm";
import {closeTurnChannel} from "../../src/lib/workspace/turn-channel";
import {closeDb} from "../../src/db/client";
import {rows} from "../../src/lib/workspace/database";
import {sendMessage,assistantReply,conversationDetails} from "../../src/lib/workspace/conversations";
import {claimJob,finishJob,heartbeat,cancelJob,liveReplyWriter} from "../../src/lib/workspace/jobs";
import {initializeGlobalOutboundProxy} from "../../src/lib/server-outbound-proxy";
import {controlConversation} from "../../src/lib/workspace/conversation-control";
const url=new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/hirelix_workspace_qa_'));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,'true');
initializeGlobalOutboundProxy(); after(async()=>{await closeDb();await closeTurnChannel();await getGlobalDispatcher().close();});
const owner=randomUUID();
test('real model and PG: resume appends to retained prose and survives a second stop before claim', {timeout:180000}, async()=>{
  const sent=await sendMessage(owner,{message:'Write a general client intake guide with exactly 12 numbered sections, each around 100 words. Begin with the title Client Intake Guide. Do not save records or ask questions.',request_key:randomUUID(),locale:'en'});
  const active=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert.ok(active);
  const running=assistantReply(active,()=>heartbeat(active)).then(result=>finishJob(active,result)).catch(error=>error);
  try {
    const deadline=Date.now()+90000;
    let preview='';
    while(Date.now()<deadline){
      const [row]=await rows<{result:{live_reply?:string}}>(sql`SELECT result FROM hirelix_private_jobs WHERE id=${active.id}::uuid`);
      preview=row.result?.live_reply || '';
      if(preview.length>900)break;
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    assert.ok(preview.length>900,'stop after actual provider prose');
    await controlConversation(owner,sent.conversation_id,{action:'stop'});
    await running;
    const stopped=await conversationDetails(owner,sent.conversation_id);
    const original=stopped.messages.at(-1)!;
    const textOf=(parts: unknown)=> (parts as Array<{type:string;text?:string}>).filter(p=>p.type==='text').map(p=>p.text).join('\n\n');
    const prefix=textOf(original.metadata.parts);
    assert.ok(prefix.length>900);
    await controlConversation(owner,sent.conversation_id,{action:'resume'});
    await controlConversation(owner,sent.conversation_id,{action:'stop'});
    const again=await conversationDetails(owner,sent.conversation_id);
    assert.equal(again.messages.at(-1)?.id,original.id);
    assert.equal(textOf(again.messages.at(-1)?.metadata.parts),prefix,'second stop must not erase retained prose');
    await controlConversation(owner,sent.conversation_id,{action:'resume'});
    const job=await claimJob(['chat'],{id:active.id,userId:owner});assert.ok(job);
    assert.equal(textOf(job.result?.previous_parts),prefix);
    await finishJob(job,await assistantReply(job,()=>heartbeat(job)));
    const detail=await conversationDetails(owner,sent.conversation_id);
    const final=detail.messages.at(-1)!;
    assert.equal(final.id,original.id,'continue the same reply');
    assert.ok(final.content.startsWith(prefix),'saved response starts with the exact previously displayed text');
    assert.ok(final.content.length>prefix.length+100,'new content is appended');
    assert.equal((final.content.match(/Client Intake Guide/g)||[]).length,1,'no repeated opening title');
    assert.match(final.content,/12[.)]/,'remaining sections are completed');
    assert.equal(textOf(final.metadata.parts),final.content);
  } finally {await cancelJob(owner,active.id);await running;}
});
test('real model and PG: promoting a queued message replaces the interrupted task', {timeout:180000}, async()=>{
  const sent=await sendMessage(owner,{message:'Write a detailed 2000-word general guide to client intake calls. No records, emails or questions.',request_key:randomUUID(),locale:'en'});
  const active=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert.ok(active);
  const running=assistantReply(active,()=>heartbeat(active)).then(result=>finishJob(active,result)).catch(error=>error);
  try {
    const deadline=Date.now()+90000;
    let preview='';
    while(Date.now()<deadline){
      const [row]=await rows<{result:{live_reply?:string}}>(sql`SELECT result FROM hirelix_private_jobs WHERE id=${active.id}::uuid`);
      preview=row.result?.live_reply || '';
      if(preview.length>80)break;
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    assert.ok(preview.length>80,'interrupt a real streamed response');
    const next=await sendMessage(owner,{conversation_id:sent.conversation_id,message:'Next task: reply with exactly the word Hello and nothing else.',request_key:randomUUID(),locale:'en'});
    await controlConversation(owner,sent.conversation_id,{action:'immediate',job_id:next.job.id});
    await running;
    const job=await claimJob(['chat'],{id:next.job.id,userId:owner});assert.ok(job);
    await finishJob(job,await assistantReply(job,()=>heartbeat(job)));
    const detail=await conversationDetails(owner,sent.conversation_id);
    assert.equal(detail.messages.at(-1)?.content.trim(),'Hello');
    const [old]=await rows<{status:string}>(sql`SELECT status FROM hirelix_private_jobs WHERE id=${active.id}::uuid`);
    assert.equal(old.status,'cancelled');
  } finally {await cancelJob(owner,active.id);await running;}
});
test('real model and PG: provider prose appears before the final saved reply, cancellation blocks late writes',{timeout:240000},async()=>{
  const sent=await sendMessage(owner,{message:'Explain in English, in six short paragraphs, how a headhunter can prepare for a first client intake call. General advice only; do not create records, reminders, or save preferences.',request_key:randomUUID(),locale:'en'});
  const job=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert.equal(job?.id,sent.job.id);
  const previews:string[]=[];
  const snapshots:string[]=[];
  const poll=setInterval(()=>{void rows<{result:{live_reply?:string}}>(sql`SELECT result FROM hirelix_private_jobs WHERE id=${job!.id}::uuid`).then(([row])=>{snapshots.push(row.result?.live_reply || '');if(row.result?.live_reply)previews.push(row.result.live_reply);});},150);
  const beat=setInterval(()=>void heartbeat(job!),20000);
  try {
    const prepared=await assistantReply(job!,message=>heartbeat(job!,message));
    assert.ok(new Set(previews).size>=2,'at least two actual partial responses before final persistence');
    const before=await conversationDetails(owner,sent.conversation_id);assert.equal(before.messages.filter(m=>m.role==='assistant').length,0);
    assert.ok(typeof before.job?.result?.live_reply === 'string' && before.job.result.live_reply.length > 0, 'preview survives preparation until atomic final save');
    const firstPreview=snapshots.findIndex(text=>text.length>0);
    assert.ok(firstPreview>=0);
    assert.ok(snapshots.slice(firstPreview).every(text=>text.length>0), 'validation and format repair must not clear an existing preview');
    await finishJob(job!,prepared);
    const detail=await conversationDetails(owner,sent.conversation_id);assert.equal(detail.messages.filter(m=>m.role==='assistant').length,1);
    assert.ok(previews.some(text=>text.length<detail.messages.at(-1)!.content.length));
    assert.ok(previews.every(text=>!text.includes('"actions":')));
    console.log(JSON.stringify({distinct_previews:new Set(previews).size,first_preview_chars:previews[0]?.length,final_chars:detail.messages.at(-1)!.content.length}));
  } finally {clearInterval(poll);clearInterval(beat);}
  const next=await sendMessage(owner,{message:'Cancellation QA',request_key:randomUUID(),locale:'en'});
  const cancelled=await claimJob(['chat'],{id:next.job.id,userId:owner});assert.equal(cancelled?.id,next.job.id);
  const write=liveReplyWriter(cancelled!);await write.ready;write('Unfinished response', [{type:'text',text:'Unfinished response'}]);await cancelJob(owner,cancelled!.id);
  await assert.rejects(()=>write.flush(),/execution lease/);
  await write.close();
  const [state]=await rows<{result:{live_reply:string;message_id:string};status:string}>(sql`SELECT result,status FROM hirelix_private_jobs WHERE id=${cancelled!.id}::uuid`);assert.equal(state.status,'cancelled');assert.equal(state.result.live_reply,undefined);
  const stopped=await conversationDetails(owner,next.conversation_id);
  assert.equal(stopped.messages.at(-1)?.content,'');
  assert.equal(stopped.messages.at(-1)?.metadata.turn_status,'cancelled');
  assert.equal(stopped.messages.at(-1)?.id,state.result.message_id);
  await cancelJob(owner,cancelled!.id);
  assert.equal((await conversationDetails(owner,next.conversation_id)).messages.length, stopped.messages.length, 'repeated stop does not duplicate messages');
});
