import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile as readBytes } from "node:fs/promises";
import { after, test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { zipSync, strToU8, unzipSync } from "fflate";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { uploadConversationFile, readFile } from "../../src/lib/workspace/files";
import { startImport, prepareImport, importDetails, reviewImportRow } from "../../src/lib/workspace/imports";
import { claimJob, finishJob, withJobLease } from "../../src/lib/workspace/jobs";
import { json, rows } from "../../src/lib/workspace/database";
import { addRecord, registerCandidateCv } from "../../src/lib/workspace/records";
import { createPerson } from "../../src/lib/workspace/people";
import { readCandidateTables } from "../../src/lib/workspace/candidate-tables";
import { recruitCrmCandidateReference } from "../../src/lib/workspace/recruit-crm-export";
import type { Job } from "../../src/lib/workspace/types";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST,"true");
initializeGlobalOutboundProxy();
const owners:string[]=[];
after(async()=>{for(const owner of owners) await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);await closeDb();});

async function run(job:Job,related:string[],simulateRollback=false) {
  await db.execute(sql`UPDATE hirelix_private_jobs SET payload=payload || ${JSON.stringify({save_new_candidates:true,related_file_ids:related})}::jsonb WHERE user_id=${job.user_id}::uuid AND id=${job.id}::uuid`);
  const claimed=await claimJob(["import"],{id:job.id,userId:job.user_id}); assert.ok(claimed);
  await withJobLease(claimed,async(_,progress)=>{
    const prepared=await prepareImport(claimed,progress);
    if (simulateRollback) {
      await assert.rejects(() => db.transaction(async tx => {await prepared.apply?.(tx);throw Error("simulated transaction failure");}),/simulated transaction failure/);
      assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${job.user_id}::uuid`)).length,0);
      assert.equal((await rows(sql`SELECT id FROM hirelix_private_records WHERE user_id=${job.user_id}::uuid`)).length,0);
      await readFile(job.user_id,String(job.payload.file_id));
      for (const id of related) await readFile(job.user_id,id);
    }
    await finishJob(claimed,prepared);
  });
  return importDetails(job.user_id,job.id);
}
async function makePdf() {
  const doc=await PDFDocument.create(),page=doc.addPage();
  page.drawText("William Sample - marketing leadership at Example Company, 2020-2023",{font:await doc.embedFont(StandardFonts.Helvetica),size:12});
  return doc.save();
}

test("real model + Postgres import an actual Recruit CRM export layout and link its extensionless resume by source ID",{timeout:180000},async()=>{
  const owner=randomUUID();owners.push(owner);
  const csv=await readBytes("tests/fixtures/platform-exports/recruit-crm-candidates-zh.csv");
  const pdf=await makePdf();
  const zip=zipSync({"Candidates/fixture-candidate-slug/0_no_name_":pdf,"Candidates/no-match/unknown.bin":strToU8("unknown file"),"Contacts/contact-1/profile.txt":strToU8("client contact, not a candidate")});
  const candidateFile=await uploadConversationFile(owner,{name:"candidates.csv",type:"text/csv",bytes:csv});
  // Choose the archive first to verify that the service handles either input order.
  const job=await startImport(owner,{name:"recruit-crm-files.zip",type:"application/zip",bytes:zip},randomUUID());
  const detail=await run(job,[candidateFile.id],true);
  assert.equal(detail.job.result?.format,"batch");assert.equal(detail.job.result?.total,1);
  assert.equal(detail.counts.find(row=>row.status==="saved")?.count,1);
  const result=detail.job.result?.attachment_result as {found:number;linked:number;reused:number;unmatched:number;ambiguous:number;files:Array<{status:string;person_id?:string;record_id?:string;file_id?:string;path:string;extraction:string}>};
  assert.deepEqual({found:result.found,linked:result.linked,reused:result.reused,unmatched:result.unmatched,ambiguous:result.ambiguous},{found:2,linked:1,reused:0,unmatched:1,ambiguous:0});
  const unmatched=result.files.find(file=>file.status==="unmatched")!;
  assert.equal(unmatched.path,"Candidates/no-match/unknown.bin");
  assert.deepEqual(detail.job.result?.unhandled_files,[{archive_file_id:String(job.payload.file_id),path:"Contacts/contact-1/profile.txt",reason:"not a candidate attachment"}]);
  const item=detail.items[0],linked=result.files.find(file=>file.status==="linked")!;
  assert.equal(linked.person_id,item.result_person_id);assert.equal(linked.extraction,"extracted");
  const [person]=await rows<{name:string;email:string}>(sql`SELECT name,email FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND id=${item.result_person_id}::uuid`);
  assert.deepEqual(person,{name:"William Sample",email:"candidate@example.test"});
  const [profile]=await rows<{details:Record<string,unknown>}>(sql`SELECT details FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${item.result_person_id}::uuid AND kind='profile'`);
  assert.deepEqual(profile.details.external_reference,{system:"recruitcrm",entity:"candidate",id:"fixture-candidate-slug"});
  const [record]=await rows<{id:string;version:number;file_id:string;kind:string;content:string;details:Record<string,unknown>}>(sql`SELECT id,version,file_id,kind,content,details FROM hirelix_private_records WHERE user_id=${owner}::uuid AND id=${linked.record_id}::uuid`);
  assert.equal(record.kind,"attachment");assert.match(record.content,/marketing leadership/);assert.equal(record.details.source_archive_path,"Candidates/fixture-candidate-slug/0_no_name_");
  const file=await readFile(owner,record.file_id);assert.equal(file.name,"0_no_name_");assert.equal(file.media_type,"application/pdf");assert.deepEqual(file.bytes,Buffer.from(pdf));
  const originalZip=await readFile(owner,String(job.payload.file_id));assert.deepEqual(originalZip.bytes,Buffer.from(zip));
  await assert.rejects(()=>readFile(randomUUID(),file.id),/not found/);
  // The recruiter may explicitly identify the PDF as a resume later. That must
  // not make a repeated import add the same source again.
  await db.transaction(tx=>registerCandidateCv(owner,item.result_person_id!,record.id,record.version,tx));
  const replayJob=await startImport(owner,{name:"recruit-crm-files.zip",type:"application/zip",bytes:zip},randomUUID());
  const replay=await run(replayJob,[candidateFile.id]);
  const replayFiles=replay.job.result?.attachment_result as {linked:number;reused:number;unmatched:number};
  assert.deepEqual(replayFiles && {linked:replayFiles.linked,reused:replayFiles.reused,unmatched:replayFiles.unmatched},{linked:0,reused:1,unmatched:1});
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`)).length,1);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND kind IN ('attachment','cv')`)).length,1);
});

test("normal candidate folders with named resumes remain ordinary candidate imports when no source ID links them",{timeout:180000},async()=>{
  const owner=randomUUID();owners.push(owner);
  const zip=zipSync({"Candidates/local-person/resume.txt":strToU8("Riley Test\nriley@example.test\nSoftware engineer, Berlin, 2021-2024.")});
  const job=await startImport(owner,{name:"local-candidates.zip",type:"application/zip",bytes:zip},randomUUID());
  const detail=await run(job,[]);
  assert.equal(detail.counts.find(row=>row.status==="saved")?.count,1);
  const attachments=detail.job.result?.attachment_result as {found:number}; assert.equal(attachments.found,0);
});

test("a recruiter-confirmed merge retains its source ID for a later attachment import",{timeout:180000},async()=>{
  const owner=randomUUID();owners.push(owner);
  const csv=await readBytes("tests/fixtures/platform-exports/recruit-crm-candidates-zh.csv");
  const [table]=await readCandidateTables({name:"candidates.csv",bytes:csv});
  const person=await createPerson(owner,{name:"William Sample",email:"candidate@example.test"});
  const job=await startImport(owner,{name:"candidates.csv",type:"text/csv",bytes:csv},randomUUID());
  const claimed=await claimJob(["import"],{id:job.id,userId:owner});assert.ok(claimed);
  await finishJob(claimed,{result:{format:"csv",mapping_confirmed:true,total:1},apply:async tx=>{
    await tx.execute(sql`INSERT INTO hirelix_private_import_rows(user_id,job_id,row_number,file_id,raw_text,extracted,matches)
      VALUES(${owner}::uuid,${job.id}::uuid,1,${String(job.payload.file_id)}::uuid,${JSON.stringify(table.rows[0].fields)},${json({name:"William Sample",email:"candidate@example.test"})},'[]'::jsonb)`);
  }});
  const preview=await importDetails(owner,job.id);
  await reviewImportRow(owner,job.id,preview.items[0].id,{action:"merge",target_person_id:person.id,expected_version:person.version});
  const [profile]=await rows<{details:Record<string,unknown>}>(sql`SELECT details FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid AND file_id=${String(job.payload.file_id)}::uuid`);
  assert.deepEqual(profile.details.external_reference,{system:"recruitcrm",entity:"candidate",id:"fixture-candidate-slug"});
  const zip=zipSync({"Candidates/fixture-candidate-slug/0_no_name_":await makePdf()});
  const fileJob=await startImport(owner,{name:"later-attachments.zip",type:"application/zip",bytes:zip},randomUUID());
  const linked=await run(fileJob,[]);
  const attachments=linked.job.result?.attachment_result as {linked:number;files:Array<{person_id?:string}>};
  assert.equal(attachments.linked,1);assert.equal(attachments.files[0].person_id,person.id);
});

test("actual Recruit CRM trial CSV and ZIP link by the real exported ID without sending source data to a model",{timeout:180000,skip:!process.env.REAL_RECRUIT_CRM_EXPORT_DIR},async()=>{
  const directory=process.env.REAL_RECRUIT_CRM_EXPORT_DIR!;
  assert.ok(directory.startsWith("/Users/noah/projects/hirelix-local-archive/"));
  const owner=randomUUID();owners.push(owner);
  const csv=await readBytes(`${directory}/recruit-crm-candidates.csv`);
  const zip=await readBytes(`${directory}/recruit-crm-attachments.zip`);
  const [table]=await readCandidateTables({name:"candidates.csv",bytes:csv});
  const reference=recruitCrmCandidateReference(table.rows[0].fields); assert.ok(reference);
  const csvFile=await uploadConversationFile(owner,{name:"actual-candidates.csv",type:"text/csv",bytes:csv});
  // The platform account's built-in candidate is a demonstration record. This
  // direct contract test uses its observed values and does not call an LLM.
  const person=await createPerson(owner,{name:table.rows[0].fields["候选人姓名 [column 2]"],email:table.rows[0].fields["电子邮件"]});
  await addRecord(owner,{person_id:person.id,file_id:csvFile.id,kind:"profile",title:"Actual platform export",content:JSON.stringify(table.rows[0].fields),details:{external_reference:reference}});
  const job=await startImport(owner,{name:"actual-attachments.zip",type:"application/zip",bytes:zip},randomUUID());
  const detail=await run(job,[]);
  const result=detail.job.result?.attachment_result as {linked:number;unmatched:number;files:Array<{status:string;file_id?:string;path:string;extraction:string}>};
  assert.equal(result.linked,1);assert.equal(result.unmatched,0);
  const linked=result.files.find(file=>file.status==="linked")!;
  const source=await readFile(owner,linked.file_id!);
  assert.equal(source.name,"0_no_name_");assert.equal(source.media_type,"application/pdf");
  assert.deepEqual(source.bytes,Buffer.from(unzipSync(zip)[linked.path]));
  assert.equal(linked.extraction,"extracted");
});
