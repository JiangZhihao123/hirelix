import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { json, owned, rows, snapshot, uuidArray } from "../../src/lib/workspace/database";
import { saveFile } from "../../src/lib/workspace/files";
import { prepareDocumentWrite } from "../../src/lib/workspace/document-writes";
import { markSubmitted } from "../../src/lib/workspace/deliverables";
import { activeDocumentShare, publishDocument, readSharedDocument } from "../../src/lib/workspace/document-sharing";
import type { Deliverable, SourceRecord } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/hirelix_workspace_qa_"))
  throw new Error("Use an isolated local QA database");
process.env.BETTER_AUTH_SECRET = "local-document-purpose-test-secret";
after(closeDb);

const owner=randomUUID(), other=randomUUID(), role=randomUUID(), otherRole=randomUUID(),
  person=randomUUID(), foreignPerson=randomUUID(), undated=randomUUID(), inside=randomUUID(),
  outside=randomUUID(), dayOnly=randomUUID(), foreignRecord=randomUUID(), otherRoleRecord=randomUUID(), cvRecord=randomUUID();
const failures = (status:number)=>(error:unknown)=>error instanceof Error && "status" in error && error.status===status;
const createBase = {
  operation:"create",role_id:role,person_ids:[],title:"Internal document",audience:"internal",language:"en",
  period_start:null,period_end:null,period_local_start:null,period_local_end:null,report_timezone:"Asia/Shanghai",
  sources:{role_version:1,records:[],file_ids:[]},content:"A short document based on selected sources.",
};
const start="2026-10-31T16:00:00Z", end="2026-11-30T15:59:59Z";
const refs=[undated,inside,outside,dayOnly].map(id=>({id,version:1}));
type SnapshotRecord = {id:string;version:number;content:string;occurred_at:string|null;occurred_on:string|null;occurred_local_date:string|null;date_precision:string;period_relation:string|null};
function records(document:Deliverable) { return document.source_snapshot.records as SnapshotRecord[]; }
function byId(document:Deliverable,id:string) { const item=records(document).find(record=>record.id===id); assert(item); return item; }
async function save(input:unknown,user=owner) { const write=await prepareDocumentWrite(user,input); return db.transaction(write); }

test("real PG: document purpose, period correction, source provenance and published snapshots",async()=>{
  const [existing]=await rows<{n:number}>(sql`SELECT (SELECT count(*) FROM hirelix_private_roles WHERE user_id IN (${owner}::uuid,${other}::uuid))::int AS n`);
  assert.equal(existing.n,0);
  try {
    await db.transaction(async tx=>{
      await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES
        (${role}::uuid,${owner}::uuid,'QA role','QA client','QA brief'),(${otherRole}::uuid,${owner}::uuid,'Other role','Other client','Not selected')`);
      await tx.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name,headline,location) VALUES
        (${person}::uuid,${owner}::uuid,'QA person','',''),(${foreignPerson}::uuid,${other}::uuid,'Foreign person','','')`);
      await tx.execute(sql`INSERT INTO hirelix_private_records(id,user_id,role_id,person_id,kind,title,content,occurred_at,details) VALUES
        (${undated}::uuid,${owner}::uuid,${role}::uuid,${person}::uuid,'note','Undated note','Undated background',NULL,'{}'::jsonb),
        (${inside}::uuid,${owner}::uuid,${role}::uuid,${person}::uuid,'call','Inside','Original in-period evidence','2026-10-31T16:30:00Z','{}'::jsonb),
        (${outside}::uuid,${owner}::uuid,${role}::uuid,${person}::uuid,'call','Earlier','Historical context','2026-10-31T15:59:00Z','{}'::jsonb),
        (${dayOnly}::uuid,${owner}::uuid,${role}::uuid,${person}::uuid,'call','Calendar day','Day-only evidence',NULL,'{"occurred_on":"2026-11-30"}'::jsonb),
        (${foreignRecord}::uuid,${other}::uuid,NULL,${foreignPerson}::uuid,'note','Foreign','Private',NULL,'{}'::jsonb),
        (${otherRoleRecord}::uuid,${owner}::uuid,${otherRole}::uuid,${person}::uuid,'note','Other role','Wrong role',NULL,'{}'::jsonb)`);
    });
    const cv=await saveFile(owner,{name:"candidate.txt",type:"text/plain",bytes:Buffer.from("Fictional original CV")});
    await db.execute(sql`INSERT INTO hirelix_private_records(id,user_id,person_id,file_id,kind,title,content)
      VALUES(${cvRecord}::uuid,${owner}::uuid,${person}::uuid,${cv.id}::uuid,'cv','Original CV','Fictional original CV')`);

    const empty=await save({...createBase,kind:"brief"});
    assert.equal(empty.document.kind,"brief");assert.deepEqual(empty.document.person_ids,[]);
    assert.equal(empty.document.audience,"internal");
    assert.equal(empty.document.period_start,null);assert.equal(empty.document.period_end,null);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid`)).length,0);
    await assert.rejects(()=>save({...createBase,kind:"brief",audience:"client"}));
    await assert.rejects(()=>publishDocument(owner,empty.document.id,1),failures(409));
    await assert.rejects(()=>markSubmitted(owner,empty.document.id,{expected_version:1,submitted_at:new Date(Date.now()-1000).toISOString(),submission_note:"QA"}),failures(409));

    const attached=await save({...createBase,kind:"brief",title:"Internal CV brief",person_ids:[person],
      sources:{role_version:1,records:[{id:undated,version:1}],file_ids:[cv.id]}});
    assert.deepEqual(attached.document.file_ids,[cv.id]);
    assert.deepEqual(attached.document.record_ids,[undated]);
    const attachedDoc=await owned<Deliverable>(owner,"deliverable",attached.document.id);
    assert.equal((attachedDoc.source_snapshot.files as Array<{sha256:string}>)[0].sha256,cv.sha256);
    assert.equal(byId(attachedDoc,undated).period_relation,null);
    assert.equal(byId(attachedDoc,undated).date_precision,"unknown");
    assert.equal(byId(attachedDoc,undated).occurred_at,null);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid`)).length,0,"a document reference is not a pipeline write");
    await assert.rejects(()=>save({operation:"patch",document_id:attached.document.id,expected_version:1,kind:"search_update",
      period_start:start,period_end:end,period_local_start:"2026-11-01",period_local_end:"2026-11-30",report_timezone:"Asia/Shanghai",edits:[],sources:null}));
    const convertedCv=await save({operation:"patch",document_id:attached.document.id,expected_version:1,kind:"search_update",
      period_start:start,period_end:end,period_local_start:"2026-11-01",period_local_end:"2026-11-30",report_timezone:"Asia/Shanghai",edits:[],
      sources:{role_version:null,records:[],file_ids:[]}});
    assert.equal(convertedCv.document.kind,"search_update");assert.deepEqual(convertedCv.document.file_ids,[]);
    const [attachedVersion]=await rows<{snapshot:Deliverable}>(sql`SELECT snapshot FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_id=${attached.document.id}::uuid AND version=1`);
    assert.deepEqual(attachedVersion.snapshot.file_ids,[cv.id]);

    const reportInput={...createBase,kind:"search_update",title:"QA period report",person_ids:[person],
      period_start:start,period_end:end,period_local_start:"2026-11-01",period_local_end:"2026-11-30",report_timezone:"Asia/Shanghai",
      sources:{role_version:1,records:refs,file_ids:[]}};
    await assert.rejects(()=>save({...reportInput,sources:{...reportInput.sources,records:[{id:foreignRecord,version:1}]}}),failures(404));
    await assert.rejects(()=>save({...reportInput,sources:{...reportInput.sources,records:[{id:otherRoleRecord,version:1}]}}));
    await assert.rejects(()=>save({...reportInput,person_ids:[foreignPerson]}),failures(404));
    const created=await save(reportInput);
    const document=await owned<Deliverable>(owner,"deliverable",created.document.id);
    assert.equal(document.kind,"search_update");assert.equal(document.version,1);
    assert.equal(byId(document,undated).period_relation,"undated");
    assert.equal(byId(document,undated).occurred_at,null);assert.equal(byId(document,undated).occurred_on,null);
    assert.equal(byId(document,inside).period_relation,"in_period");assert.equal(byId(document,inside).occurred_local_date,"2026-11-01");
    assert.equal(byId(document,outside).period_relation,"outside_period");assert.equal(byId(document,outside).occurred_local_date,"2026-10-31");
    assert.equal(byId(document,dayOnly).period_relation,"in_period");assert.equal(byId(document,dayOnly).date_precision,"day");
    assert.equal(byId(document,dayOnly).occurred_on,"2026-11-30");
    const returned=created.sources.records as unknown as Array<{id:string;period_relation:string|null;date_precision:string;occurred_at:string|null;occurred_on:string|null;content?:string}>;
    assert.equal(returned.find(item=>item.id===undated)?.period_relation,"undated");
    assert.equal(returned.find(item=>item.id===outside)?.period_relation,"outside_period");
    assert.equal(returned.find(item=>item.id===dayOnly)?.occurred_on,"2026-11-30");
    assert.ok(returned.every(item=>item.content===undefined),"the receipt contains metadata, not source text");
    const noteBefore=await owned<SourceRecord>(owner,"record",undated);
    assert.equal(noteBefore.occurred_at,null);assert.equal(noteBefore.details.occurred_on,undefined);
    const unchanged=await save({operation:"patch",document_id:document.id,expected_version:1,edits:[],
      period_start:"2026-11-01T00:00:00+08:00",period_end:"2026-11-30T23:59:59+08:00",sources:null});
    assert.equal(unchanged.document.version,1,"equivalent instants are a no-op, not a new version");
    assert.deepEqual((await owned<Deliverable>(owner,"deliverable",document.id)).source_snapshot,document.source_snapshot);
    const clearedZone=await save({operation:"patch",document_id:document.id,expected_version:1,edits:[],report_timezone:null,sources:null});
    assert.equal(clearedZone.document.version,2);
    assert.equal(clearedZone.document.report_timezone,null);
    assert.equal(clearedZone.document.period_local_start,"2026-10-31");
    const utcCopy=await owned<Deliverable>(owner,"deliverable",document.id);
    assert.equal(utcCopy.source_snapshot.period_local_start,"2026-10-31");
    assert.equal(byId(utcCopy,inside).occurred_local_date,"2026-10-31");
    assert.equal(byId(utcCopy,inside).period_relation,"in_period");

    const [legacySource]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,person_ids,record_ids,source_snapshot)
      VALUES(${owner}::uuid,${role}::uuid,'brief','Old snapshot','Saved evidence',${uuidArray([person])},${uuidArray([outside])},
        ${json({audience:"internal",role:{id:role,version:1},people:[{id:person,name:"QA person"}],records:[{id:outside,version:1,title:"Old source",content:"Historical context"}],files:[]})}) RETURNING *`);
    await snapshot(owner,"deliverable",legacySource);
    await save({operation:"patch",document_id:legacySource.id,expected_version:1,kind:"search_update",edits:[],
      period_start:start,period_end:end,period_local_start:"2026-11-01",period_local_end:"2026-11-30",report_timezone:"Asia/Shanghai",sources:null});
    const untouchedLegacy=await owned<Deliverable>(owner,"deliverable",legacySource.id);
    assert.equal(byId(untouchedLegacy,outside).period_relation,null,"missing old snapshot dates are unknown, not proven undated");
    assert.equal(byId(untouchedLegacy,outside).occurred_at,undefined,"do not refresh missing dates from the live record");

    // A later edit to the real source must not silently replace the saved evidence.
    await db.execute(sql`UPDATE hirelix_private_records SET content='New live value',occurred_at='2030-01-01T00:00:00Z',version=2 WHERE user_id=${owner}::uuid AND id=${inside}::uuid`);
    await assert.rejects(()=>save({operation:"patch",document_id:document.id,expected_version:2,edits:[],sources:{role_version:null,records:[{id:inside,version:1}]}}),failures(409));
    await assert.rejects(()=>save({operation:"patch",document_id:document.id,expected_version:9,kind:"brief",period_start:null,period_end:null,edits:[],sources:null}),failures(409));
    await assert.rejects(()=>save({operation:"patch",document_id:document.id,expected_version:2,kind:"brief",period_start:null,period_end:null,edits:[],sources:null},other),failures(404));
    await assert.rejects(()=>save({operation:"patch",document_id:document.id,expected_version:2,kind:"brief",edits:[],sources:null}),/period/i);
    assert.equal((await owned<Deliverable>(owner,"deliverable",document.id)).version,2);
    const revised=await save({operation:"patch",document_id:document.id,expected_version:2,edits:[],
      report_timezone:"America/New_York",period_local_start:"2026-10-31",period_local_end:"2026-11-30",sources:null});
    assert.equal(revised.document.id,document.id);assert.equal(revised.document.version,3);
    const revision=await owned<Deliverable>(owner,"deliverable",document.id);
    assert.equal(revision.source_snapshot.report_timezone,"America/New_York");
    assert.equal(byId(revision,inside).occurred_local_date,"2026-10-31");
    assert.equal(byId(revision,inside).occurred_at,"2026-10-31T16:30:00.000Z");
    assert.equal(byId(revision,inside).version,1);assert.equal(byId(revision,inside).content,"Original in-period evidence");
    assert.equal(byId(revision,undated).period_relation,"undated");
    const savedOld=await rows<{snapshot:Deliverable}>(sql`SELECT snapshot FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_id=${document.id}::uuid AND version=1`);
    assert.equal(byId(savedOld[0].snapshot,inside).occurred_local_date,"2026-11-01");
    assert.equal(savedOld[0].snapshot.source_snapshot.report_timezone,"Asia/Shanghai");

    const brief=await save({operation:"replace",document_id:document.id,expected_version:3,kind:"brief",period_start:null,period_end:null,
      period_local_start:null,period_local_end:null,content:"Updated internal comparison.",sources:null});
    assert.equal(brief.document.id,document.id);assert.equal(brief.document.kind,"brief");assert.equal(brief.document.version,4);
    assert.equal(brief.document.period_start,null);assert.equal(brief.document.period_end,null);
    const briefDoc=await owned<Deliverable>(owner,"deliverable",document.id);
    assert.ok(records(briefDoc).every(record=>record.period_relation===null));
    assert.equal(byId(briefDoc,inside).version,1);assert.equal(byId(briefDoc,inside).content,"Original in-period evidence");
    assert.equal(byId(briefDoc,undated).occurred_at,null);
    await assert.rejects(()=>save({operation:"patch",document_id:document.id,expected_version:4,kind:"search_update",edits:[],sources:null}),/period/i);
    const back=await save({operation:"patch",document_id:document.id,expected_version:4,kind:"search_update",edits:[],
      period_start:"2026-10-01T00:00:00Z",period_end:"2026-10-31T23:59:59Z",period_local_start:"2026-10-01",period_local_end:"2026-10-31",report_timezone:"UTC",sources:null});
    assert.equal(back.document.version,5);assert.equal(back.document.kind,"search_update");
    const restored=await owned<Deliverable>(owner,"deliverable",document.id);
    assert.equal(byId(restored,inside).period_relation,"in_period");
    assert.equal(byId(restored,outside).period_relation,"in_period");
    assert.equal(byId(restored,dayOnly).period_relation,"outside_period");
    assert.equal(byId(restored,undated).period_relation,"undated");
    assert.equal(byId(restored,inside).version,1);assert.equal(byId(restored,inside).content,"Original in-period evidence");
    const originalNote=await owned<SourceRecord>(owner,"record",undated);
    assert.equal(originalNote.version,1);assert.equal(originalNote.occurred_at,null);assert.equal(originalNote.details.occurred_on,undefined);

    const submission=await save({...createBase,kind:"submission",title:"Client recommendation",audience:"client",format:"recommendation",person_ids:[person]});
    const share=await publishDocument(owner,submission.document.id,1);
    const token=share.path.split("/").at(-1)!;
    const publicBefore=(await readSharedDocument(token))?.snapshot;
    assert(publicBefore);
    const converted=await save({operation:"patch",document_id:submission.document.id,expected_version:1,kind:"brief",audience:"internal",edits:[],sources:null});
    assert.equal(converted.document.kind,"brief");assert.equal(converted.document.version,2);
    assert.deepEqual((await readSharedDocument(token))?.snapshot,publicBefore,"an already published snapshot does not change");
    assert.equal((await activeDocumentShare(owner,submission.document.id))?.current_copy,false);
    await assert.rejects(()=>publishDocument(owner,submission.document.id,2),failures(409));
    await assert.rejects(()=>markSubmitted(owner,submission.document.id,{expected_version:2,submitted_at:new Date(Date.now()-1000).toISOString(),submission_note:"QA"}),failures(409));
  } finally {
    await db.transaction(async tx=>{
      for(const user of [owner,other]) {
        await tx.execute(sql`DELETE FROM hirelix_private_notifications WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_document_shares WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_role_candidates WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_versions WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_deliverables WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_files WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_roles WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_agent_people WHERE user_id=${user}::uuid`);
      }
    });
  }
});
