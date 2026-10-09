import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after,test} from 'node:test';
import {mkdir,readFile as readBytes} from 'node:fs/promises';
import {makeFileFixtures} from '../helpers/workspace-file-fixtures';
import {readDocument} from '../../src/lib/workspace/document-reader';
import {generateVisionText} from '../../src/lib/workspace/vision';
import {uploadConversationFile,readFile} from '../../src/lib/workspace/files';
import {sendMessage,assistantReply,conversationDetails} from '../../src/lib/workspace/conversations';
import {claimJob,finishJob,heartbeat} from '../../src/lib/workspace/jobs';
import {prepareImport} from '../../src/lib/workspace/imports';
import {closeDb} from '../../src/db/client';
import {initializeGlobalOutboundProxy} from '../../src/lib/server-outbound-proxy';
const database=new URL(process.env.DATABASE_URL||'postgres://invalid/invalid');
assert.ok(['localhost','127.0.0.1'].includes(database.hostname)&&database.pathname.startsWith('/hirelix_workspace_qa_'));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,'true');
initializeGlobalOutboundProxy();after(closeDb);
const dir='output/file-reading-20261009/';const owner=randomUUID();
test('real files + real vision model + real PG: upload, pixels, follow-up and authorized scan candidate save',{timeout:480000},async()=>{
 await mkdir(dir,{recursive:true});await makeFileFixtures(dir);
 for(const name of ['qa-profile.jpg','qa-profile.png','qa-profile.webp','qa-scan.pdf']){
  const bytes=await readBytes(dir+name);const saved=await uploadConversationFile(owner,{name,type:name.endsWith('pdf')?'application/pdf':'image/'+name.split('.').at(-1),bytes});
  const document=await readDocument(await readFile(owner,saved.id));assert.match(document.text,/Mira Vale/i);assert.ok(document.images.length);
  const answer=await generateVisionText({stage:'qa_visual_relationship',images:document.images,system:'Answer the visual question faithfully in one sentence.',prompt:'In the original image, what color is the CLIENT UPDATE box, and is it above or below CANDIDATE REVIEW?'});
  assert.match(answer.text,/blue/i);assert.match(answer.text,/above/i);
  console.log(JSON.stringify({file:name,transcription_chars:document.text.length,visual_answer:answer.text}));
 }
 const names=['qa-scan.pdf','qa-candidates.xlsx','qa-notes.docx','qa-brief.pptx'];const ids=[];
 for(const name of names){const file=await uploadConversationFile(owner,{name,type:'application/octet-stream',bytes:await readBytes(dir+name)});ids.push(file.id);}
 const sent=await sendMessage(owner,{message:'QA: summarize these files in English. Name both candidates, report the client salary, and describe the color and relative position of the Client Update box in the scan. Analysis only; do not save candidates, roles, preferences or reminders.',file_ids:ids,request_key:randomUUID(),locale:'en'});
 const run=async()=>{const job=await claimJob(['chat']);assert.ok(job);const timer=setInterval(()=>void heartbeat(job),20000);try{await finishJob(job,await assistantReply(job,m=>heartbeat(job,m)));}finally{clearInterval(timer);}};
 await run();let details=await conversationDetails(owner,sent.conversation_id);const answer=details.messages.at(-1)!.content;
 assert.match(answer,/Mira Vale/i);assert.match(answer,/Rowan Vale/i);assert.match(answer,/120[,.]?000/);assert.match(answer,/blue/i);assert.match(answer,/above/i);console.log(JSON.stringify({batch_reply:answer}));
 await sendMessage(owner,{conversation_id:sent.conversation_id,message:'Which candidate in the spreadsheet is based in Dublin? One sentence only; no changes.',request_key:randomUUID(),locale:'en'});await run();details=await conversationDetails(owner,sent.conversation_id);assert.match(details.messages.at(-1)!.content,/Rowan Vale/i);
 const save=await sendMessage(owner,{message:'QA: save the fictional Mira Vale candidate from this scanned CV to my candidate pool. Preserve supported facts. Do not create a role, reminders or preferences.',file_ids:[ids[0]],request_key:randomUUID(),locale:'en'});await run();
 const imported=await claimJob(['import']);assert.ok(imported);const timer=setInterval(()=>void heartbeat(imported),20000);try{await finishJob(imported,await prepareImport(imported,m=>heartbeat(imported,m)));}finally{clearInterval(timer);}
 const detail=await conversationDetails(owner,save.conversation_id);assert.ok(detail.messages.length);
 // The import receipt is checked independently in PG below, rather than trusting prose.
 const {rows}=await import('../../src/lib/workspace/database');const {sql}=await import('drizzle-orm');
 const people=await rows<{name:string}>(sql`SELECT name FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);assert.equal(people.length,1);assert.match(people[0].name,/Mira Vale/i);
 console.log(JSON.stringify({saved_candidate:people[0].name,follow_up:'passed'}));
});
