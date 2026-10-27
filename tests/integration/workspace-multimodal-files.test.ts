import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {after,test} from 'node:test';
import {sql} from 'drizzle-orm';
import {mkdir,readFile as readBytes} from 'node:fs/promises';
import {makeFileFixtures} from '../helpers/workspace-file-fixtures';
import {readDocument} from '../../src/lib/workspace/document-reader';
import {generateVisionText} from '../../src/lib/workspace/vision';
import {uploadConversationFile,readFile} from '../../src/lib/workspace/files';
import {sendMessage,assistantReply,conversationDetails} from '../../src/lib/workspace/conversations';
import {claimJob,finishJob,withJobLease} from '../../src/lib/workspace/jobs';
import {agentCreditContext,executionTrace} from '../../src/lib/agent-credit-context';
import {db,closeDb} from '../../src/db/client';
import {initializeGlobalOutboundProxy} from '../../src/lib/server-outbound-proxy';
const database=new URL(process.env.DATABASE_URL||'postgres://invalid/invalid');
assert.ok(['localhost','127.0.0.1'].includes(database.hostname)&&database.pathname.startsWith('/hirelix_workspace_qa_'));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,'true');
initializeGlobalOutboundProxy();
const dir='output/file-reading-20261009/';const owner=randomUUID();
after(async()=>{await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);await closeDb();});
test('real files + real vision model + real PG: upload, pixels, follow-up and authorized scan candidate save',{timeout:480000},async()=>{
 await mkdir(dir,{recursive:true});await makeFileFixtures(dir);
 for(const name of ['qa-profile.jpg','qa-profile.png','qa-profile.webp','qa-scan.pdf']){
  const bytes=await readBytes(dir+name);const saved=await uploadConversationFile(owner,{name,type:name.endsWith('pdf')?'application/pdf':'image/'+name.split('.').at(-1),bytes});
  const document=await readDocument(await readFile(owner,saved.id));assert.ok(document.text);assert.ok(document.images.length);
  const answer=await generateVisionText({stage:'qa_visual_relationship',images:document.images,system:'Answer the visual question faithfully in one sentence.',prompt:'In the original image, what color is the CLIENT UPDATE box, and is it above or below CANDIDATE REVIEW?'});
  assert.ok(answer.text.trim());
  console.log(JSON.stringify({file:name,transcription_chars:document.text.length,visual_answer:answer.text}));
 }
 const names=['qa-scan.pdf','qa-candidates.xlsx','qa-notes.docx','qa-brief.pptx'];const ids:string[]=[];
 for(const name of names){const file=await uploadConversationFile(owner,{name,type:'application/octet-stream',bytes:await readBytes(dir+name)});ids.push(file.id);}
 const sent=await sendMessage(owner,{message:'QA: summarize these files in English. Name both candidates, report the client salary, and describe the color and relative position of the Client Update box in the scan. Analysis only; do not save candidates, roles, preferences or reminders.',file_ids:ids,request_key:randomUUID(),locale:'en'});
 const run=async(id:string)=>{const job=await claimJob(['chat'],{id,userId:owner});assert.ok(job);await withJobLease(job,async(signal,progress)=>{const prepared=await agentCreditContext.run({...job,signal,trace:executionTrace(job)},()=>assistantReply(job,progress));await finishJob(job,prepared);});};
 await run(sent.job.id);let details=await conversationDetails(owner,sent.conversation_id);const answer=details.messages.at(-1)!.content;
 console.log(JSON.stringify({batch_reply:answer}));
 const {rows}=await import('../../src/lib/workspace/database');
 assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`)).length,0,'analysis-only material must not create candidates');
 assert.equal((await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`)).length,0,'analysis-only material must not create roles');
 const follow=await sendMessage(owner,{conversation_id:sent.conversation_id,message:'Which candidate in the spreadsheet is based in Dublin? One sentence only; no changes.',request_key:randomUUID(),locale:'en'});await run(follow.job.id);details=await conversationDetails(owner,sent.conversation_id);assert.ok(details.messages.at(-1)!.content);
 const save=await sendMessage(owner,{message:'QA: save the fictional Mira Vale candidate from this scanned CV to my candidate pool. Preserve supported facts. Do not create a role, reminders or preferences.',file_ids:[ids[0]],request_key:randomUUID(),locale:'en'});await run(save.job.id);
 const detail=await conversationDetails(owner,save.conversation_id);assert.ok(detail.messages.length);
 // The import receipt is checked independently in PG below, rather than trusting prose.
 const people=await rows<{id:string;name:string}>(sql`SELECT id,name FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);
 const sources=await rows<{person_id:string;file_id:string|null}>(sql`SELECT person_id,file_id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id IS NOT NULL`);
 for(const person of people) assert.ok(sources.some(source=>source.person_id===person.id&&source.file_id===ids[0]),'every saved candidate retains the original scan');
 const legacy=await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import' AND payload->>'operation' IS DISTINCT FROM 'record_batch'`);assert.equal(legacy.length,0);
 console.log(JSON.stringify({saved_candidates:people.length,follow_up:'observed'}));
});
