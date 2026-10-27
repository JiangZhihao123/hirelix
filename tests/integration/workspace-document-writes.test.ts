import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { unzipSync } from "fflate";
import { closeDb, db } from "../../src/db/client";
import { owned, rows } from "../../src/lib/workspace/database";
import { saveFile } from "../../src/lib/workspace/files";
import { prepareDocumentWrite } from "../../src/lib/workspace/document-writes";
import { updateDeliverable } from "../../src/lib/workspace/deliverables";
import { exportDocument } from "../../src/lib/workspace/document-export";
import { downloadRecommendationPackage } from "../../src/lib/workspace/recommendation-package";
import { publishDocument, readSharedDocument } from "../../src/lib/workspace/document-sharing";
import { saveRecommendationFeedback } from "../../src/lib/workspace/recommendation-feedback";
import { recommendationSections } from "../../src/lib/workspace/recommendation-presentation";
import type { Deliverable, SourceRecord } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/hirelix_workspace_qa_"))
  throw new Error("Use an isolated local QA database");
process.env.BETTER_AUTH_SECRET = "local-isolated-document-write-test-secret";
after(closeDb);

const owner = randomUUID();
const foreign = randomUUID();
const role = randomUUID();
const otherRole = randomUUID();
const people = [randomUUID(), randomUUID(), randomUUID()];
const note = randomUUID();
const wrongNote = randomUUID();
const foreignNote = randomUUID();
const cvRecords = [randomUUID(), randomUUID()];
const failure = (code: number) => (error: unknown) =>
  error instanceof Error && "status" in error && error.status === code;

async function save(value: unknown, user = owner) {
  const apply = await prepareDocumentWrite(user, value);
  return db.transaction(apply);
}

// A fresh random owner ensures that cleanup cannot touch an existing user's data.
test("real PG: direct document writes preserve evidence, concurrency and recommendation delivery", async () => {
  const [count] = await rows<{ n: number }>(sql`SELECT (SELECT count(*) FROM hirelix_private_roles WHERE user_id IN (${owner}::uuid,${foreign}::uuid))::int AS n`);
  assert.equal(count.n, 0);
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES
        (${role}::uuid,${owner}::uuid,'QA role','QA client','QA brief'),
        (${otherRole}::uuid,${owner}::uuid,'Other role','Other client','Other brief')`);
      await tx.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name,headline,location) VALUES
        (${people[0]}::uuid,${owner}::uuid,'QA Alex','',''),(${people[1]}::uuid,${owner}::uuid,'QA Sam','',''),(${people[2]}::uuid,${owner}::uuid,'QA Other','','')`);
      await tx.execute(sql`INSERT INTO hirelix_private_records(id,user_id,person_id,role_id,kind,title,content,occurred_at) VALUES
        (${note}::uuid,${owner}::uuid,${people[0]}::uuid,${role}::uuid,'call','Call','Fictional source','2026-10-21T20:00:00Z'),
        (${wrongNote}::uuid,${owner}::uuid,${people[2]}::uuid,${otherRole}::uuid,'call','Wrong scope','Not selected','2026-10-21T20:00:00Z'),
        (${foreignNote}::uuid,${foreign}::uuid,NULL,NULL,'note','Foreign','Private',NULL)`);
    });
    const cv1 = await saveFile(owner, {name:"Alex.txt",type:"text/plain",bytes:Buffer.from("QA Alex resume")});
    const cv2 = await saveFile(owner, {name:"Sam.txt",type:"text/plain",bytes:Buffer.from("QA Sam resume")});
    const foreignFile = await saveFile(foreign, {name:"foreign.txt",type:"text/plain",bytes:Buffer.from("not owned")});
    const invalidFile = await saveFile(owner, {name:"invalid.txt",type:"text/plain",bytes:Buffer.from([0xff,0xff])});
    await db.execute(sql`INSERT INTO hirelix_private_records(id,user_id,person_id,file_id,kind,title,content) VALUES
      (${cvRecords[0]}::uuid,${owner}::uuid,${people[0]}::uuid,${cv1.id}::uuid,'cv','QA Alex CV','QA Alex resume'),
      (${cvRecords[1]}::uuid,${owner}::uuid,${people[1]}::uuid,${cv2.id}::uuid,'cv','QA Sam CV','QA Sam resume')`);

    const body = "Two candidates with distinct evidence.\n\n## QA Alex\n\nAlex built reliable systems.\n\n## QA Sam\n\nSam improved throughput.\n";
    const bodyFile = await saveFile(owner, {name:"recommendation.md",type:"text/markdown",bytes:Buffer.from(body)});
    const input = {
      operation:"create", kind:"submission", role_id:role, person_ids:people.slice(0,2),
      title:"QA recommendation", audience:"client", language:"en", format:"recommendation",
      period_start:null, period_end:null, period_local_start:null, period_local_end:null, report_timezone:null,
      sources:{role_version:1,records:[{id:note,version:1}],file_ids:[cv1.id,cv2.id]},
      content_file:{file_id:bodyFile.id,sha256:bodyFile.sha256},
    };
    await assert.rejects(() => save({...input, content:body}), /exactly one/);
    await assert.rejects(() => save({...input, content_file:{file_id:bodyFile.id,sha256:"0".repeat(64)}}), failure(409));
    await assert.rejects(() => save({...input, content_file:{file_id:foreignFile.id,sha256:foreignFile.sha256}}), failure(404));
    await assert.rejects(() => save({...input, content_file:{file_id:invalidFile.id,sha256:invalidFile.sha256}}), /valid UTF-8/);
    await assert.rejects(() => save({...input,sources:{...input.sources,role_version:2}}), failure(409));
    await assert.rejects(() => save({...input,sources:{...input.sources,records:[{id:note,version:2}]}}), failure(409));
    await assert.rejects(() => save({...input,sources:{...input.sources,records:[{id:wrongNote,version:1}]}}), /unselected candidate|another client/);
    await assert.rejects(() => save({...input,sources:{...input.sources,records:[{id:foreignNote,version:1}]}}), failure(404));
    await assert.rejects(() => save({...input,sources:{...input.sources,file_ids:[foreignFile.id]}}), /selected CV/);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role}::uuid`)).length, 0);

    const created = await save(input);
    assert.equal(created.document.version,1);
    assert.deepEqual(created.document.person_ids,people.slice(0,2));
    assert.deepEqual(created.document.file_ids,[cv1.id,cv2.id]);
    assert.equal(created.sources.records[0].version,1);
    assert.equal(created.sources.content_file?.sha256,bodyFile.sha256);
    assert.equal(JSON.stringify(created).includes(body),false,"receipt must not return the body");
    const document = await owned<Deliverable>(owner,"deliverable",created.document.id);
    assert.equal(document.content,body);
    assert.equal(document.source_snapshot.audience,"client");
    assert.deepEqual((document.source_snapshot.files as Array<{sha256:string}>).map(file=>file.sha256),[cv1.sha256,cv2.sha256]);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role}::uuid`)).length,0,"document references do not add candidates to the role pipeline");
    const comparison = await save({...input,title:"Internal comparison",audience:"internal",content_file:null,content:"Compare the selected evidence."});
    const internal = await owned<Deliverable>(owner,"deliverable",comparison.document.id);
    assert.deepEqual(internal.person_ids,people.slice(0,2));
    assert.deepEqual(internal.record_ids,[note]);
    assert.deepEqual((internal.source_snapshot.people as Array<{id:string}>).map(person=>person.id),people.slice(0,2));
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role}::uuid`)).length,0);
    await assert.rejects(()=>publishDocument(owner,internal.id,internal.version),/Only client/);
    const comparisonEdited=await save({operation:"patch",document_id:internal.id,expected_version:1,edits:[],
      person_ids:[people[1],people[2]],sources:null});
    assert.equal(comparisonEdited.document.version,2);
    assert.deepEqual(comparisonEdited.document.person_ids,[people[1],people[2]]);
    assert.deepEqual(comparisonEdited.document.record_ids,[],"removed candidate's source no longer belongs to the current copy");
    assert.deepEqual(comparisonEdited.document.file_ids,[cv2.id],"removed candidate's CV is not carried into the new copy");
    const oldComparison=await rows<{snapshot:Deliverable}>(sql`SELECT snapshot FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_id=${internal.id}::uuid AND version=1`);
    assert.deepEqual(oldComparison[0].snapshot.person_ids,people.slice(0,2));
    assert.deepEqual(oldComparison[0].snapshot.record_ids,[note]);
    assert.deepEqual(oldComparison[0].snapshot.file_ids,[cv1.id,cv2.id]);
    const empty = await save({...input,kind:"search_update",person_ids:[],title:"Unlinked comparison",audience:"internal",
      period_start:"2026-10-21T16:00:00Z",period_end:"2026-10-22T15:59:59Z",report_timezone:"Asia/Shanghai",
      sources:{role_version:1,records:[],file_ids:[]},content_file:null,content:"Compare these candidates."});
    const addPeople = {operation:"patch",document_id:empty.document.id,expected_version:1,edits:[],person_ids:people,
      sources:{role_version:1,records:[{id:note,version:1}],file_ids:[]}};
    await assert.rejects(()=>save({...addPeople,person_ids:[...people,randomUUID()]}),failure(404));
    assert.equal((await owned<Deliverable>(owner,"deliverable",empty.document.id)).version,1);
    const added=await save(addPeople);
    assert.equal(added.document.id,empty.document.id);
    assert.deepEqual(added.document.person_ids,people);
    assert.deepEqual(added.document.record_ids,[note]);
    const addedDoc=await owned<Deliverable>(owner,"deliverable",empty.document.id);
    assert.deepEqual((addedDoc.source_snapshot.people as Array<{id:string}>).map(person=>person.id),people);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role}::uuid`)).length,0);
    const removedPeople=await save({operation:"replace",document_id:empty.document.id,expected_version:2,
      person_ids:[people[1],people[2]],content:"Updated comparison.",sources:null});
    assert.equal(removedPeople.document.version,3);
    assert.deepEqual(removedPeople.document.person_ids,[people[1],people[2]]);
    assert.deepEqual(removedPeople.document.record_ids,[]);
    assert.deepEqual((await owned<Deliverable>(owner,"deliverable",empty.document.id)).source_snapshot.records,[]);
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_document_shares WHERE user_id=${owner}::uuid`)).length,0,"saving does not share");
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_id=${document.id}::uuid AND version=1`)).length,1);
    assert.equal(Object.keys(recommendationSections(body,[{id:people[0],name:"QA Alex"},{id:people[1],name:"QA Sam"}]).sections).length,2);

    for (const format of ["pdf","docx"] as const) {
      const output = await exportDocument(owner,document.id,format,1);
      assert.ok((await output.arrayBuffer()).byteLength > 100);
    }
    const archive = unzipSync(new Uint8Array(await (await downloadRecommendationPackage(owner,document.id,1)).arrayBuffer()));
    assert.ok(archive["Recommendation.pdf"].length > 100);
    assert.deepEqual(Object.keys(archive).filter(name=>name.startsWith("CVs/")).length,2);
    assert.ok(Object.values(archive).some(bytes=>Buffer.from(bytes).toString()==="QA Alex resume"));
    assert.ok(Object.values(archive).some(bytes=>Buffer.from(bytes).toString()==="QA Sam resume"));
    const share = await publishDocument(owner,document.id,1);
    const token = share.path.split("/").at(-1)!;
    for (const [index,personId] of people.slice(0,2).entries()) {
      await saveRecommendationFeedback(token,{request_key:randomUUID(),person_id:personId,response:index ? "hold" : "interview",name:"QA reviewer",comment:"QA feedback"});
    }
    const feedback = await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid AND details->>'recommendation_id'=${document.id} ORDER BY created_at,id`);
    assert.deepEqual(new Set(feedback.map(item=>item.person_id)),new Set(people.slice(0,2)));
    assert.ok(feedback.every(item=>item.role_id===role && item.details.recommendation_version===1));

    const patch = {operation:"patch",document_id:document.id,expected_version:1,
      edits:[{old_text:"Alex built reliable systems.",new_text:"Alex built distributed systems."}],sources:null};
    const patched = await save(patch);
    assert.equal(patched.document.version,2);
    assert.equal((await readSharedDocument(token))?.snapshot.content,body,"published snapshot stays fixed");
    await assert.rejects(() => save(patch),failure(409));
    await assert.rejects(() => save({...patch,expected_version:2,edits:[{old_text:"missing",new_text:"ignored"}]}),failure(409));
    await assert.rejects(() => save({...patch,expected_version:2},foreign),failure(404));
    const sourceOnly = {operation:"patch",document_id:document.id,expected_version:2,edits:[]};
    await assert.rejects(() => save({...sourceOnly,sources:{role_version:null,records:[{id:note,version:2}]}}),failure(409));
    await assert.rejects(() => save({...sourceOnly,sources:{role_version:null,records:[{id:foreignNote,version:1}]}}),failure(404));
    await assert.rejects(() => save({...sourceOnly,sources:{role_version:null,records:[{id:wrongNote,version:1}]}}),/unselected candidate|another client/);
    await assert.rejects(() => save({...sourceOnly,sources:{role_version:null,records:[],file_ids:[foreignFile.id]}}),/selected CV/);
    assert.equal((await save({...sourceOnly,sources:{role_version:null,records:[{id:note,version:1}]}})).document.version,2);
    const beforeManual = await owned<Deliverable>(owner,"deliverable",document.id);
    const manual = await updateDeliverable(owner,document.id,{title:"User edit",content:beforeManual.content+"\nUser text.",expected_version:2});
    assert.equal(manual.version,3);
    await assert.rejects(() => save({operation:"replace",document_id:document.id,expected_version:2,content:"Would overwrite user text",sources:null}),failure(409));
    assert.match((await owned<Deliverable>(owner,"deliverable",document.id)).content,/User text/);
    const replacementBody = "Replacement from main agent.\n\n## QA Alex\n\nAlex evidence.\n\n## QA Sam\n\nSam evidence.\n";
    const replacementFile = await saveFile(owner,{name:"replacement.md",type:"text/markdown",bytes:Buffer.from(replacementBody)});
    const replaced = await save({operation:"replace",document_id:document.id,expected_version:3,audience:"internal",
      content_file:{file_id:replacementFile.id,sha256:replacementFile.sha256},sources:null});
    assert.equal(replaced.document.version,4);
    assert.equal((await owned<Deliverable>(owner,"deliverable",document.id)).content,replacementBody);
    assert.deepEqual(replaced.document.file_ids,[cv1.id,cv2.id]);
    await assert.rejects(()=>publishDocument(owner,document.id,4),/Only client/);
    const removed = await save({operation:"patch",document_id:document.id,expected_version:4,edits:[],sources:{role_version:null,records:[],file_ids:[cv1.id]}});
    assert.equal(removed.document.version,5);
    assert.deepEqual(removed.document.file_ids,[cv1.id]);
    const [previous] = await rows<{snapshot:Deliverable}>(sql`SELECT snapshot FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_id=${document.id}::uuid AND version=4`);
    assert.deepEqual(previous.snapshot.file_ids,[cv1.id,cv2.id]);
    const versions = await rows<{version:number}>(sql`SELECT version FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_id=${document.id}::uuid ORDER BY version`);
    assert.deepEqual(versions.map(item=>item.version),[1,2,3,4,5]);

    const report = {...input,kind:"search_update",person_ids:[people[0]],title:"QA report",audience:"internal",format:"email",
      period_start:"2026-10-21T16:00:00Z",period_end:"2026-10-22T15:59:59Z",report_timezone:"Asia/Shanghai",
      sources:{role_version:1,records:[{id:note,version:1}],file_ids:[]},content_file:null,content:"Report body"};
    const reportSaved = await save(report);
    assert.equal(reportSaved.document.period_local_start,"2026-10-22");
    assert.equal(reportSaved.document.period_local_end,"2026-10-22");
    assert.equal(reportSaved.document.report_timezone,"Asia/Shanghai");
    const reportDocument = await owned<Deliverable>(owner,"deliverable",reportSaved.document.id);
    assert.equal((reportDocument.source_snapshot.records as Array<{occurred_local_date:string}>)[0].occurred_local_date,"2026-10-22");
    const background=await save({...report,person_ids:[people[0]],period_start:"2026-10-20T16:00:00Z",period_end:"2026-10-21T15:59:59Z",sources:{...report.sources,records:[{id:note,version:1}]}});
    const backgroundDoc=await owned<Deliverable>(owner,"deliverable",background.document.id);
    assert.equal((backgroundDoc.source_snapshot.records as Array<{period_relation:string}>)[0].period_relation,"outside_period");
    await db.execute(sql`INSERT INTO hirelix_private_role_candidates(user_id,role_id,person_id,permission) VALUES(${owner}::uuid,${role}::uuid,${people[0]}::uuid,'declined')`);
    const declined=await save({...input,title:"Declined sharing",content_file:null,content:body});
    assert.equal(((await owned<Deliverable>(owner,"deliverable",declined.document.id)).source_snapshot.people as Array<{sharing_permission?:string}>)[0].sharing_permission,"declined");
    await assert.rejects(()=>publishDocument(owner,declined.document.id,declined.document.version),/declined sharing/);
  } finally {
    await db.transaction(async tx => {
      for (const user of [owner,foreign]) {
        await tx.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${user}::uuid`);
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
