import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sql} from 'drizzle-orm';
import {rows} from '../../src/lib/workspace/database';
import {sendMessage,assistantReply} from '../../src/lib/workspace/conversations';
import {claimJob,finishJob,heartbeat} from '../../src/lib/workspace/jobs';
import {initializeGlobalOutboundProxy} from '../../src/lib/server-outbound-proxy';
import {closeDb} from '../../src/db/client';
import {closeTurnChannel} from '../../src/lib/workspace/turn-channel';
import {test,after} from 'node:test';
import {getGlobalDispatcher} from 'undici';
after(async()=>{await closeTurnChannel();await closeDb();await getGlobalDispatcher().close();});
test('real model: brief messages get topic titles, never naming failure messages', {timeout:90000}, async()=>{
 assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/hirelix_workspace_qa_'));
 assert.equal(process.env.WORKSPACE_REAL_AI_TEST,'true');
 initializeGlobalOutboundProxy();
 const owner=randomUUID();
 for(const message of ['这人咋样','你好']){
 const sent=await sendMessage(owner,{message,request_key:randomUUID(),locale:'zh'});
 const job=await claimJob(['chat'],{id:sent.job.id,userId:owner});assert.ok(job);
 const result=await assistantReply(job,()=>heartbeat(job));await finishJob(job,result);
 await new Promise(r=>setTimeout(r,3000));
 const [c]=await rows<{title:string}>(sql`SELECT title FROM hirelix_private_conversations WHERE id=${sent.conversation_id}::uuid`);
 assert.ok(c.title.length>0 && c.title.length<=60);assert.ok(!c.title.includes('无法')&&!c.title.includes('信息不足'));
 console.log(JSON.stringify({message,title:c.title}));
 }
});
