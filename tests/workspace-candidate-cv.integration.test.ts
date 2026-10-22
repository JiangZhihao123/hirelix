import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {sql} from "drizzle-orm";
import {db,closeDb} from "../src/db/client";
import {owned,rows} from "../src/lib/workspace/database";
import {saveFile} from "../src/lib/workspace/files";
import {addRecord,registerCandidateCv} from "../src/lib/workspace/records";
import {prepareDeliverable} from "../src/lib/workspace/deliverables";
import type {Person,SourceRecord} from "../src/lib/workspace/types";

test("a saved resume can be selected as a CV without another person or source, with ownership and version checks",{skip:process.env.WORKSPACE_CANDIDATE_CV_INTEGRATION!=="true"},async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname)&&url.pathname.startsWith("/hirelix_workspace_qa_"));
  const rollback=new Error("rollback CV source fixtures");
  try {
    await db.transaction(async tx=>{
      const owner=randomUUID(),person=randomUUID(),other=randomUUID(),role=randomUUID();
      await tx.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name) VALUES(${person}::uuid,${owner}::uuid,'CV QA Person'),(${other}::uuid,${owner}::uuid,'Other QA Person')`);
      await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES(${role}::uuid,${owner}::uuid,'QA role','Fictional QA','QA')`);
      await tx.execute(sql`INSERT INTO hirelix_private_role_candidates(user_id,role_id,person_id) VALUES(${owner}::uuid,${role}::uuid,${person}::uuid)`);
      const file=await saveFile(owner,{name:"CV-QA.txt",type:"text/plain",bytes:new TextEncoder().encode("Fictional resume source text")},tx);
      const record=await addRecord(owner,{person_id:person,kind:"profile",title:"Candidate profile source",file_id:file.id,content:"Fictional resume source text"},tx);
      const note=await addRecord(owner,{person_id:person,kind:"call",title:"Private call",file_id:file.id,content:"Private communication"},tx);
      const missingFile=await addRecord(owner,{person_id:person,kind:"profile",title:"Pasted source",content:"No original file"},tx);
      const input={kind:"submission",role_id:role,person_ids:[person],record_ids:[record.id],file_ids:[file.id],period_start:null,period_end:null,request_key:randomUUID()};
      await assert.rejects(()=>prepareDeliverable(owner,input,tx),/selected CV is not available/);
      await assert.rejects(()=>registerCandidateCv(randomUUID(),person,record.id,1,tx),/not found/);
      await assert.rejects(()=>registerCandidateCv(owner,other,record.id,1,tx),/this candidate/);
      await assert.rejects(()=>registerCandidateCv(owner,person,record.id,2,tx),/changed in another window/);
      await assert.rejects(()=>registerCandidateCv(owner,person,note.id,1,tx),/saved resume source/);
      await assert.rejects(()=>registerCandidateCv(owner,person,missingFile.id,1,tx),/original file/);
      const saved=await registerCandidateCv(owner,person,record.id,1,tx);
      assert.equal(saved.id,record.id);assert.equal(saved.kind,"cv");assert.equal(saved.version,2);assert.equal(saved.content,record.content);assert.equal(saved.file_id,file.id);
      assert.equal((await registerCandidateCv(owner,person,record.id,2,tx)).version,2);
      assert.equal((await owned<Person>(owner,"person",person,tx)).version,1);
      const [count]=await rows<{n:number}>(sql`SELECT count(*)::int n FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person}::uuid`,tx);
      assert.equal(count.n,3);
      const [permission]=await rows<{permission:string}>(sql`SELECT permission FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role}::uuid AND person_id=${person}::uuid`,tx);
      assert.equal(permission.permission,"unknown");
      const job=await prepareDeliverable(owner,{...input,request_key:randomUUID()},tx);
      const source=job.payload.source as {files:Array<{id:string;sha256:string;person_id:string}>};
      assert.deepEqual(source.files.map(f=>({id:f.id,sha256:f.sha256,person_id:f.person_id})),[{id:file.id,sha256:file.sha256,person_id:person}]);
      const [old]=await rows<{kind:string}>(sql`SELECT snapshot->>'kind' AS kind FROM hirelix_private_versions WHERE user_id=${owner}::uuid AND entity_type='record' AND entity_id=${record.id}::uuid AND version=1`,tx);
      assert.equal(old.kind,"profile");
      assert.equal((await owned<SourceRecord>(owner,"record",note.id,tx)).kind,"call");
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  finally{await closeDb();}
});
