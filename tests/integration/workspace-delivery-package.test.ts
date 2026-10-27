import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test,after} from 'node:test';
import {unzipSync} from 'fflate';
import {sql} from 'drizzle-orm';
import {closeDb} from '../../src/db/client';
import {rows,json,uuidArray} from '../../src/lib/workspace/database';
import {createRole,linkPerson} from '../../src/lib/workspace/roles';
import {createPerson} from '../../src/lib/workspace/people';
import {saveFile} from '../../src/lib/workspace/files';
import {renderDocument} from '../../src/lib/workspace/document-export';
import {publishDocument,revokeDocumentShare} from '../../src/lib/workspace/document-sharing';
import {downloadRecommendationPackage,downloadSharedPackage} from '../../src/lib/workspace/recommendation-package';
import {recommendationEmail,sendRecommendationInput,buildEmailMime,reserveEmailDelivery,reserveConversationEmail} from '../../src/lib/workspace/gmail';
import {emailSnapshotSchema} from '../../src/lib/workspace/email-contract';
import {GET as getSharedFile} from '../../src/app/recommendation/[token]/files/[fileId]/route';
import type {Deliverable} from '../../src/lib/workspace/types';
const url=new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/hirelix_workspace_qa_'));
after(closeDb);
test('real PG/files/PDF/MIME: three-person delivery package, custom email, link-only and revoked links',async()=>{
 const owner=randomUUID();const role=await createRole(owner,{title:'QA Product Director',client_name:'Fictional Willow',jd_text:'Product leadership'});
 const people=[];const files=[];const original:Uint8Array[]=[];
 for(const name of ['Avery','Mira','Rowan']){
  const person=await createPerson(owner,{name:`Fictional ${name}`,headline:'Product leader'});await linkPerson(owner,role.id,person.id);people.push(person);
  const bytes=await renderDocument(`${name} CV`,'Fictional acceptance fixture. Product leadership.','pdf');original.push(bytes);
  const file=await saveFile(owner,{name:name==='Avery'?'0_no_name_':'CV.pdf',type:'application/pdf',bytes});files.push({...file,person_id:person.id});
 }
 const content='Three candidates for this role.\n\n'+people.map(p=>`## ${p.name}\n\n### Relevant evidence\nProduct leadership in the fictional QA fixture.\n\n### Points to discuss\nTeam size is not verified.`).join('\n\n');
 const source={language:'en',audience:'client',role,people,files};
 const [doc]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,person_ids,file_ids,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','QA recommendation',${content},${uuidArray(people.map(p=>p.id))},${uuidArray(files.map(f=>f.id))},${json(source)}) RETURNING *`);
 const share=await publishDocument(owner,doc.id,doc.version);const token=share.path.split('/').at(-1)!;
 const sharedFile=await getSharedFile(new Request('http://localhost/'),{params:Promise.resolve({token,fileId:files[0].id})});
 assert.equal(sharedFile.status,200);assert.match(sharedFile.headers.get('content-disposition')||'',/0_no_name_\.pdf/);
 for(const response of [await downloadRecommendationPackage(owner,doc.id,doc.version),await downloadSharedPackage(token)]){
  const entries=unzipSync(new Uint8Array(await response.arrayBuffer()));assert.equal(Object.keys(entries).length,4);
  assert.ok(Buffer.from(entries['Recommendation.pdf']).subarray(0,4).toString()==='%PDF');
  const cvs=Object.keys(entries).filter(k=>k.startsWith('CVs/'));assert.equal(cvs.length,3);
  assert.ok(cvs[0].endsWith('0_no_name_.pdf'));
  cvs.forEach((name,i)=>assert.deepEqual(entries[name],original[i]));
 }
 await assert.rejects(()=>downloadRecommendationPackage(randomUUID(),doc.id,doc.version),/not found/i);
 await assert.rejects(()=>downloadRecommendationPackage(owner,doc.id,doc.version+1),/changed/i);
 const input=sendRecommendationInput.parse({to:'client@example.test',request_key:randomUUID(),expected_version:doc.version,share_id:share.id,email_subject:'Three people to review',email_content:'Hello, please review this batch.',attach_cvs:true});
 const origin=process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
 await assert.rejects(()=>recommendationEmail(owner,doc,{...input,email_content:'See {{link}}'},origin),/placeholders/);
 const reviewed=await recommendationEmail(owner,doc,input,origin);assert.ok(!reviewed.content.includes('Relevant evidence'));assert.ok(reviewed.content.includes(share.path));assert.equal(reviewed.files.length,3);
 const snapshot=emailSnapshotSchema.parse({...reviewed,from:'recruiter@example.test',to:input.to,document_id:doc.id,document_version:doc.version,recommendation_delivery:{share_id:share.id,email_subject:input.email_subject,email_content:input.email_content,attach_cvs:true}});
 const mime=await buildEmailMime(owner,snapshot);assert.equal((mime.mime.toString().match(/Content-Disposition: attachment/g)||[]).length,3);assert.match(mime.mime.toString(),/filename="?0_no_name_\.pdf"?/);
 const reserved=await reserveConversationEmail(owner,snapshot,randomUUID(),mime.messageId,async()=>{});assert.equal(reserved.send,true);
 const linkOnly=await recommendationEmail(owner,doc,{...input,attach_cvs:false},origin);assert.equal(linkOnly.files.length,0);
 const plain=await buildEmailMime(owner,{...snapshot,content:linkOnly.content,files:[]});assert.ok(!plain.mime.toString().includes('Content-Disposition: attachment'));
 const req={...input,to:'second@example.test',request_key:randomUUID()};await reserveEmailDelivery(owner,doc.id,req,'recruiter@example.test','<qa@hirelix.online>',origin);
 await assert.rejects(()=>reserveEmailDelivery(owner,doc.id,{...req,email_content:'Changed'},'recruiter@example.test','<qa@hirelix.online>',origin),/another email/);
 await revokeDocumentShare(owner,doc.id);
 await assert.rejects(()=>downloadSharedPackage(token),/unavailable/);
 await assert.rejects(()=>recommendationEmail(owner,doc,input,origin),/Publish/);
 await assert.rejects(()=>reserveConversationEmail(owner,snapshot,randomUUID(),mime.messageId,async()=>{}),/Publish/);
});
