// Controlled embedding provider; real PostgreSQL, Docker, file and batch services.
// Opt in only on an exclusively owned local QA database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, mock, test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { sql } from "drizzle-orm";

const enabled = process.env.RECORD_BATCH_DISTINCT_SCALE === "true";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
if (enabled) assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && /^\/hirelix_workspace_qa_coldstart_scale_/.test(database.pathname));
const owner = randomUUID();
const count = 500, attachments = 25;
const vector = Array.from({length:1536}, (_, i) => i === 0 ? 1 : 0);
const ready = (async () => {
  mock.module("../../src/lib/candidate-index/embedding.ts", {namedExports:{
    getEmbeddingConfig: () => ({model:"controlled-scale-embedding",dimensions:1536,apiKey:"not-used",baseUrl:"not-used"}),
    generateEmbeddings: async (texts: string[]) => ({embeddings:texts.map(() => vector),model:"controlled-scale-embedding",dimensions:1536,inputTokens:0}),
  }});
  const connection = await import("../../src/db/client");
  const databaseModule = await import("../../src/lib/workspace/database");
  const conversations = await import("../../src/lib/workspace/conversations");
  const files = await import("../../src/lib/workspace/files");
  const jobs = await import("../../src/lib/workspace/jobs");
  const batches = await import("../../src/lib/workspace/record-batches");
  const sandbox = await import("../../src/lib/workspace/file-execution");
  const retrieval = await import("../../src/lib/workspace/retrieval");
  return {...connection,...databaseModule,...conversations,...files,...jobs,...batches,...sandbox,...retrieval};
})();
after(async () => {
  const s = await ready;
  if (enabled) await s.db.transaction(async tx => {
    await tx.execute(sql`DELETE FROM hirelix_private_import_rows WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_private_embeddings WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_private_versions WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_private_notifications WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_private_files WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);
    await tx.execute(sql`DELETE FROM hirelix_agent_access WHERE user_id=${owner}::uuid`);
  });
  await s.closeDb(); mock.restoreAll();
});

test("500 distinct candidates, notes, original files, queue, indexing and later retrieval", {skip:!enabled,timeout:300000}, async t => {
  const s = await ready;
  const csv = ["name,email,note", ...Array.from({length:count}, (_, i) => `Fictional Candidate ${String(i).padStart(4,"0")},person${i}@example.test,Original note ${i}`), "Fictional Candidate 0000,person0@example.test,Original note 0"].join("\n") + "\n";
  const entries: Record<string, Uint8Array> = {"candidates.csv":strToU8(csv)};
  for (let i = 0; i < attachments; i++) entries[`files/${i}.txt`] = strToU8(`Original attachment ${i}`);
  const archive = Buffer.from(zipSync(entries));
  const source = await s.saveFile(owner, {name:"source.zip",type:"application/zip",bytes:archive});
  const sent = await s.sendMessage(owner, {message:"Save these candidates and their notes and keep the original files.",request_key:randomUUID()});
  const parent = await s.claimJob(["chat"], {id:sent.job.id,userId:owner}); assert.ok(parent);
  const conversation = await s.conversationDetails(owner,sent.conversation_id);
  const question = conversation.messages.find(message => message.id === parent.payload.message_id)!;
  const ctx = {userId:owner,conversationId:sent.conversation_id,jobId:parent.id,leaseKey:parent.lease_token!,commit:<T>(apply:(tx:import("../../src/lib/workspace/database").Runner)=>Promise<T>)=>s.db.transaction(apply)};
  let peakRss = process.memoryUsage().rss, peakHeap = process.memoryUsage().heapUsed;
  const sample = () => {const memory=process.memoryUsage(); peakRss=Math.max(peakRss,memory.rss); peakHeap=Math.max(peakHeap,memory.heapUsed);};
  const [beforeSize] = await s.rows<{bytes:string}>(sql`SELECT pg_database_size(current_database())::text AS bytes`);
  const start = performance.now();
  try {
    const script = `const fs=require('fs'); const {unzipSync,strFromU8}=require('fflate'); const {parse}=require('csv-parse/sync');
const zip=unzipSync(fs.readFileSync('/inputs/${source.id}.zip')); const rows=parse(strFromU8(zip['candidates.csv']),{columns:true});
const output=rows.map((row,i)=>JSON.stringify({input:{person_id:null,expected_version:null,changes:{name:row.name,email:row.email},source_file_id:'${source.id}',separate_candidate_quote:null},source:{file_id:'${source.id}',archive_path:'candidates.csv',page:null,row:i+2,sheet:null}}));
fs.writeFileSync('/work/candidates.jsonl',output.join('\\n')+'\\n'); console.log('rows='+output.length);`;
    const converted = await s.executeBash(ctx,{command:`node - <<'NODE'\n${script}\nNODE\ndf -m /work`,input_file_ids:[source.id],output_paths:["candidates.jsonl"]});
    assert.equal(converted.exit_code,0,converted.stderr); assert.match(converted.stdout,/rows=501/); assert.match(converted.stdout,/tmpfs\s+128/);
    const runBatch = async (operation:"save_candidate"|"save_record", file:{file_id:string;sha256:string}) => {
      await s.heartbeat(parent);
      const queued = await s.db.transaction(tx=>s.enqueueRecordBatch(parent,question,{write_operation:operation,input_file:file},randomUUID(),tx));
      const job = await s.claimJob(["import"],{id:queued.id,userId:owner}); assert.ok(job);
      const prepared = await s.prepareRecordBatch(job,async()=>{sample(); await s.heartbeat(parent); await s.heartbeat(job);});
      const replay = await s.prepareRecordBatch(job,async()=>{});
      assert.deepEqual(replay.result.counts,prepared.result.counts);
      await s.finishJob(job,prepared);
      return {job,prepared};
    };
    const created = await runBatch("save_candidate",{file_id:converted.outputs[0].file_id,sha256:converted.outputs[0].sha256});
    assert.deepEqual(created.prepared.result.counts,{applied:count,unchanged:0,conflict:1,failed:0,unprocessed:0});
    const repeated = await runBatch("save_candidate",{file_id:converted.outputs[0].file_id,sha256:converted.outputs[0].sha256});
    assert.deepEqual(repeated.prepared.result.counts,{applied:0,unchanged:0,conflict:count+1,failed:0,unprocessed:0});
    const people = await s.rows<{id:string;email:string}>(sql`SELECT id,email FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY email`);
    assert.equal(people.length,count); assert.equal(new Set(people.map(p=>p.email)).size,count);
    const sourceIndex = (person:{email:string}) => Number(person.email.slice(6,person.email.indexOf("@")));
    people.sort((a,b)=>sourceIndex(a)-sourceIndex(b));
    const input: unknown[] = people.map((person,i)=>({input:{operation:"create",person_id:person.id,role_id:null,record:{kind:"note",title:`Historical note ${i}`,content:`Original note ${i}`,occurred_at:null,occurred_on:null},recommendation:null,file_id:null,archive_path:null},source:{file_id:source.id,archive_path:"candidates.csv",page:null,row:i+2,sheet:null}}));
    for (let i=0;i<attachments;i++) input.push({input:{operation:"create",person_id:people[i].id,role_id:null,record:{kind:"attachment",title:`Attachment ${i}`,content:`Original attachment ${i}`,occurred_at:null,occurred_on:null},recommendation:null,file_id:source.id,archive_path:`files/${i}.txt`},source:{file_id:source.id,archive_path:`files/${i}.txt`,page:null,row:null,sheet:null}});
    const noteFile = await s.saveFile(owner,{name:"records.jsonl",type:"application/x-ndjson",bytes:Buffer.from(input.map(line=>JSON.stringify(line)).join("\n")+"\n")});
    const written = await runBatch("save_record",{file_id:noteFile.id,sha256:noteFile.sha256});
    assert.deepEqual(written.prepared.result.counts,{applied:count+attachments,unchanged:0,conflict:0,failed:0,unprocessed:0});
    const pending = await s.rows<{id:string;person:string}>(sql`SELECT id,payload->>'person_id' AS person FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued' ORDER BY created_at,id`);
    assert.equal(pending.length,count); assert.equal(new Set(pending.map(job=>job.person)).size,count);
    const batchSeconds = (performance.now()-start)/1000;
    const indexStart=performance.now();
    for (const [index,pendingJob] of pending.entries()) {
      if (index % 10 === 0) await s.heartbeat(parent);
      const job=await s.claimJob(["index"],{id:pendingJob.id,userId:owner}); assert.ok(job);
      await s.finishJob(job,await s.indexCandidate(job,async()=>{}));
      sample();
    }
    const indexed = await s.rows<{people:number;passages:number}>(sql`SELECT count(DISTINCT person_id)::int AS people,count(*)::int AS passages FROM hirelix_private_embeddings WHERE user_id=${owner}::uuid`);
    assert.equal(indexed[0].people,count);
    const matches=await s.retrieveCandidates(owner,{query:"synthetic search",limit:20});
    assert.equal(matches.coverage.total,count); assert.equal(matches.coverage.indexed,count); assert.equal(matches.coverage.pending,0); assert.equal(matches.matches.length,20);
    assert.equal((await s.retrieveCandidates(randomUUID(),{query:"synthetic search",limit:20})).matches.length,0);
    const archived=await s.readFile(owner,source.id); assert.deepEqual(archived.bytes,archive);
    const notes = await s.rows<{email:string;content:string;details:{declared_source:{file_id:string;archive_path:string;row:number}}}>(sql`SELECT p.email,r.content,r.details FROM hirelix_private_records r JOIN hirelix_agent_people p ON p.id=r.person_id AND p.user_id=r.user_id WHERE r.user_id=${owner}::uuid AND r.kind='note'`);
    assert.equal(notes.length,count);
    for (const note of notes) {
      const index=sourceIndex(note);
      assert.equal(note.content,`Original note ${index}`);
      assert.deepEqual([note.details.declared_source.file_id,note.details.declared_source.archive_path,note.details.declared_source.row],[source.id,"candidates.csv",index+2]);
    }
    const fileCounts=await s.rows<{files:number;records:number}>(sql`SELECT count(*)::int AS records,count(*) FILTER(WHERE file_id IS NOT NULL)::int AS files FROM hirelix_private_records WHERE user_id=${owner}::uuid AND kind='attachment'`);
    assert.deepEqual(fileCounts[0],{files:attachments,records:attachments});
    const attached=await s.rows<{email:string;file_id:string;details:{source_archive_file_id:string;source_archive_path:string}}>(sql`SELECT p.email,r.file_id,r.details FROM hirelix_private_records r JOIN hirelix_agent_people p ON p.id=r.person_id AND p.user_id=r.user_id WHERE r.user_id=${owner}::uuid AND r.kind='attachment'`);
    for (const item of attached) {
      const index=sourceIndex(item);
      assert.equal(item.details.source_archive_file_id,source.id);
      assert.equal(item.details.source_archive_path,`files/${index}.txt`);
      assert.equal((await s.readFile(owner,item.file_id)).bytes.toString(),`Original attachment ${index}`);
    }
    const [afterSize] = await s.rows<{bytes:string}>(sql`SELECT pg_database_size(current_database())::text AS bytes`);
    t.diagnostic(`500 candidates + 525 records: ${batchSeconds.toFixed(2)} s; 500 index jobs: ${((performance.now()-indexStart)/1000).toFixed(2)} s; ${indexed[0].passages} indexed passages; source ZIP ${archive.length} bytes; DB delta ${Number(afterSize.bytes)-Number(beforeSize.bytes)} bytes; sampled Node RSS/heap ${(peakRss/1048576).toFixed(1)}/${(peakHeap/1048576).toFixed(1)} MiB. Embeddings are controlled, not a real model.`);
    await s.heartbeat(parent); await s.finishJob(parent,{result:{tested:true}});
  } finally {await s.cleanupFileWorkspace(ctx);}
});
