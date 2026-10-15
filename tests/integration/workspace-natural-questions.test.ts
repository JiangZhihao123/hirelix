import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test,after} from 'node:test';
import {getGlobalDispatcher} from 'undici';
import {sendMessage,assistantReply,conversationDetails} from '../../src/lib/workspace/conversations';
import {claimJob,finishJob,heartbeat} from '../../src/lib/workspace/jobs';
import {initializeGlobalOutboundProxy} from '../../src/lib/server-outbound-proxy';
import {closeDb} from '../../src/db/client';
import {closeTurnChannel} from '../../src/lib/workspace/turn-channel';
const url=new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/hirelix_workspace_qa_'));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,'true');
initializeGlobalOutboundProxy();
after(async()=>{await closeTurnChannel();await closeDb();await getGlobalDispatcher().close();});
test('real model: a decision can use options, selected dictation proceeds without another menu', {timeout:180000}, async()=>{
 const owner=randomUUID();let conversationId:string|undefined;
 async function turn(message:string){
  const sent=await sendMessage(owner,{message,conversation_id:conversationId,request_key:randomUUID(),locale:'zh'});
  conversationId=sent.conversation_id;
  const job=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert.ok(job);
  await finishJob(job,await assistantReply(job,()=>heartbeat(job)));
  const detail=await conversationDetails(owner,conversationId);
  return detail.messages.filter(m=>m.role==='assistant').at(-1)!;
 }
 const first=await turn('我们讨论一个虚构候选人的电话初筛记录，先不保存资料。我还没决定是只记录简短结论，还是逐条口述不符项、对照简历整理详细记录。请给我这两个选项让我选，先不要开展工作。');
 const question=first.metadata.question as {options:string[];status:string}|undefined;
 assert.ok(question&&question.options.length>=2,'a real requested choice remains supported');
 const second=await turn('我逐条口述不符项，你按清单逐项对照简历记录。现在等我说。');
 assert.equal(second.metadata.question,undefined,'do not reopen a selected direction');
 assert.ok(second.content.length<500,'acknowledge and wait instead of repeating a checklist');
 const third=await turn('简历说管理8个仓库，电话里他说只负责2个；简历写全职，电话里承认是兼职。先只整理这两条给我看，不保存，不用建议下一步。');
 assert.equal(third.metadata.question,undefined,'completed requested output needs no next-step menu');
 assert.ok(!/[?？]\s*$/.test(third.content),'a completed bounded task does not end with another question');
 assert.ok(third.content.includes('8')&&third.content.includes('2')&&third.content.includes('兼职'));
 console.log(JSON.stringify({decision_options:question.options,acknowledgement:second.content,organized:third.content}));
});

test('real model: free-text facts fulfill prior save instruction; withdrawal prevents another save', {timeout:180000}, async()=>{
 const {createPerson}=await import('../../src/lib/workspace/people');
 const {rows}=await import('../../src/lib/workspace/database');
 const {sql}=await import('drizzle-orm');
 const owner=randomUUID();const person=await createPerson(owner,{name:'Fictional QA Rowan Conversation'});
 let conversationId:string|undefined;
 async function turn(message:string){
  const sent=await sendMessage(owner,{message,conversation_id:conversationId,candidate_ids:[person.id],request_key:randomUUID(),locale:'zh'});
  conversationId=sent.conversation_id;
  const job=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert.ok(job);
  await finishJob(job,await assistantReply(job,()=>heartbeat(job)));
  return (await conversationDetails(owner,conversationId)).messages.filter(m=>m.role==='assistant').at(-1)!;
 }
 const first=await turn('我待会口述今天与这个候选人的通话。请把我说的内容直接记到他的档案，保留为我的评价，不需要逐条核验或草稿审批。现在等我说。');
 assert.equal(first.metadata.question,undefined);
 const second=await turn('我的评价是沟通不够坦诚，今天的初筛不通过。只记这个简短结论，细节暂时没有。');
 assert.equal(second.metadata.question,undefined);
 const saved=await rows<{id:string;content:string}>(sql`SELECT id,content FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid`);
 assert.equal(saved.length,1,'actual saved note, no repeated approval');
 assert.ok(saved[0].content.includes('初筛'));
 const third=await turn('后面的内容先不记录，只帮我把措辞说得更中性：这个人撒谎，工作不踏实。');
 assert.equal(third.metadata.question,undefined);
 assert.ok(!/(可以|要不要|需要我).*(追加|补进|保存|记入)/.test(third.content),'no future offer to perform the excluded save');
 assert.ok(!third.content.includes('需要我')&&!third.content.includes('要不要'),'do not ask to reopen the excluded action in prose either');
 const after=await rows<{id:string;content:string}>(sql`SELECT id,content FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid`);
 assert.deepEqual(after,saved,'withdrawn save permission must preserve records unchanged');
 console.log(JSON.stringify({acknowledgement:first.content,saved_note:saved[0].content,revision_only:third.content}));
});
