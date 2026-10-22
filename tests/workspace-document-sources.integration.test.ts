import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../src/db/client";
import {json, owned, rows, snapshot, uuidArray} from "../src/lib/workspace/database";
import {editDocument, requestRevision} from "../src/lib/workspace/revisions";
import {selectedDocumentRecord} from "../src/lib/workspace/deliverables";
import type {Deliverable} from "../src/lib/workspace/types";

test("document changes retain selected versioned evidence without expanding candidate, client or period scope", {skip:process.env.WORKSPACE_DOCUMENT_SOURCES_INTEGRATION !== "true"}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const rollback = new Error("rollback source fixtures");
  try {
    await db.transaction(async tx => {
      const owner=randomUUID(), foreign=randomUUID(), role=randomUUID(), otherRole=randomUUID(), person=randomUUID(), otherPerson=randomUUID(), documentId=randomUUID();
      await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text,version) VALUES(${role}::uuid,${owner}::uuid,'QA role','Fictional QA','Brief',2),(${otherRole}::uuid,${owner}::uuid,'Other QA role','Other QA','Brief',1)`);
      await tx.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name) VALUES(${person}::uuid,${owner}::uuid,'QA Person'),(${otherPerson}::uuid,${owner}::uuid,'Other QA Person')`);
      const note=randomUUID(), wrongPerson=randomUUID(), wrongRole=randomUUID(), foreignNote=randomUUID();
      await tx.execute(sql`INSERT INTO hirelix_private_records(id,user_id,person_id,role_id,kind,title,content,version,occurred_at) VALUES(${note}::uuid,${owner}::uuid,${person}::uuid,${role}::uuid,'call','QA screening call','Candidate-reported 112% NRR; not verified',2,'2026-10-22T10:00:00Z'),(${wrongPerson}::uuid,${owner}::uuid,${otherPerson}::uuid,${role}::uuid,'call','Other candidate','Not selected',1,NULL),(${wrongRole}::uuid,${owner}::uuid,${person}::uuid,${otherRole}::uuid,'call','Other client','Not selected',1,NULL),(${foreignNote}::uuid,${foreign}::uuid,NULL,NULL,'note','Foreign note','Private',1,NULL)`);
      const [document]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(id,user_id,role_id,kind,title,content,person_ids,source_snapshot) VALUES(${documentId}::uuid,${owner}::uuid,${role}::uuid,'submission','QA draft','Outcomes unknown',${uuidArray([person])},${json({audience:"internal",role:{id:role,version:1},records:[]})}) RETURNING *`,tx);
      await snapshot(owner,"deliverable",document,tx);
      const edits=[{old_text:"Outcomes unknown",new_text:"Candidate reports 112% NRR; unverified"}];
      for (const selection of [
        {role_version:99,records:[]},
        {role_version:null,records:[{id:note,version:1}]},
        {role_version:null,records:[{id:wrongPerson,version:1}]},
        {role_version:null,records:[{id:wrongRole,version:1}]},
        {role_version:null,records:[{id:foreignNote,version:1}]},
      ]) await assert.rejects(() => editDocument(owner,documentId,1,edits,tx,selection));
      assert.equal((await owned<Deliverable>(owner,"deliverable",documentId,tx)).version,1);
      await assert.rejects(() => selectedDocumentRecord(owner,note,{...document,kind:"search_update",period_start:"2026-10-01T00:00:00Z",period_end:"2026-10-02T00:00:00Z"},tx,2),/reporting period/);
      const sources={role_version:2,records:[{id:note,version:2}]};
      const saved=await editDocument(owner,documentId,1,edits,tx,sources);
      assert.deepEqual(saved.record_ids,[note]);
      assert.equal((saved.source_snapshot.role as {version:number}).version,2);
      const evidence=saved.source_snapshot.records as Array<{id:string;version:number;content:string}>;
      assert.deepEqual(evidence.map(item=>({id:item.id,version:item.version})),[{id:note,version:2}]);
      assert.equal(evidence[0].content,"Candidate-reported 112% NRR; not verified");
      const [old]=await rows<{snapshot:Deliverable}>(sql`SELECT snapshot FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_id=${documentId}::uuid AND version=1`,tx);
      assert.deepEqual(old.snapshot.record_ids,[]);
      assert.equal(old.snapshot.content,"Outcomes unknown");
      const noChange=await editDocument(owner,documentId,2,[{old_text:saved.content,new_text:saved.content}],tx,sources);
      assert.equal(noChange.version,2,"Selecting identical evidence does not create another version");
      const request={instructions:"Shorten without changing facts",expected_version:2,request_key:randomUUID(),sources};
      const queued=await requestRevision(owner,documentId,request,tx);
      assert.equal((queued.payload.source as {records:Array<{version:number}>}).records[0].version,2);
      assert.equal((await requestRevision(owner,documentId,request,tx)).id,queued.id);
      await assert.rejects(() => requestRevision(owner,documentId,{...request,sources:null},tx),/another revision/);
      await tx.execute(sql`UPDATE hirelix_private_records SET content='Corrected later',version=3 WHERE id=${note}::uuid`);
      const current=await owned<{payload:typeof queued.payload}>(owner,"job",queued.id,tx);
      assert.equal((current.payload.source as {records:Array<{content:string}>}).records[0].content,evidence[0].content,"Queued work retains the selected source version, not later mutable content");
      const stored=await owned<Deliverable>(owner,"deliverable",documentId,tx);
      assert.equal((stored.source_snapshot.records as Array<{content:string}>)[0].content,evidence[0].content,"The document's source preview retains its captured text after a live note is corrected");
      throw rollback;
    });
  } catch(error) { if(error!==rollback) throw error; }
  finally { await closeDb(); }
});
