import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { conversationDetails, sendMessage } from "../../src/lib/workspace/conversations";
import { rows } from "../../src/lib/workspace/database";
import { readFile, saveFile } from "../../src/lib/workspace/files";
import { claimJob, finishJob } from "../../src/lib/workspace/jobs";
import { createPerson } from "../../src/lib/workspace/people";
import { enqueueRecordBatch, prepareRecordBatch } from "../../src/lib/workspace/record-batches";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real PG: 10,000 individual business writes have durable receipts beyond the tool receipt limit", {skip: process.env.RECORD_BATCH_SCALE !== "true", timeout: 240000}, async t => {
  const person = await createPerson(owner, {name: `Batch scale ${owner}`});
  const source = {file_id: null, archive_path: null, page: null, row: null, sheet: null};
  const items = Array.from({length: 10000}, (_, i) => JSON.stringify({
    input: {operation: "create", person_id: person.id, role_id: null,
      record: {kind: "note", title: `Note ${i + 1}`, content: `Fact ${i + 1}`, occurred_at: null, occurred_on: null},
      recommendation: null, file_id: null, archive_path: null}, source,
  }));
  const file = await saveFile(owner, {name: "scale.jsonl", type: "application/x-ndjson", bytes: Buffer.from(`${items.join("\n")}\n`)});
  const sent = await sendMessage(owner, {message: "Save these notes to my candidate.", request_key: randomUUID()});
  const parent = await claimJob(["chat"], {id: sent.job.id, userId: owner});
  assert.ok(parent);
  const conversation = await conversationDetails(owner, sent.conversation_id);
  const question = conversation.messages.find(message => message.id === parent.payload.message_id)!;
  const child = await db.transaction(tx => enqueueRecordBatch(parent, question, {write_operation: "save_record", input_file: {file_id: file.id, sha256: file.sha256}}, randomUUID(), tx));
  const active = await claimJob(["import"], {id: child.id, userId: owner});
  assert.ok(active);
  const initialMemory = process.memoryUsage();
  let peakRss = initialMemory.rss, peakHeap = initialMemory.heapUsed, peakExternal = initialMemory.external;
  const started = performance.now();
  const prepared = await prepareRecordBatch(active, async () => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss); peakHeap = Math.max(peakHeap, memory.heapUsed); peakExternal = Math.max(peakExternal, memory.external);
  });
  t.diagnostic(`Processing: ${(performance.now() - started).toFixed(0)} ms; sampled Node RSS/heap/external peaks: ${(peakRss / 1024 / 1024).toFixed(0)}/${(peakHeap / 1024 / 1024).toFixed(0)}/${(peakExternal / 1024 / 1024).toFixed(0)} MiB`);
  assert.deepEqual(prepared.result.counts, {applied: 10000, unchanged: 0, conflict: 0, failed: 0, unprocessed: 0});
  await finishJob(active, prepared);
  const [written] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid`);
  const [receipts] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_import_rows WHERE user_id=${owner}::uuid AND job_id=${child.id}::uuid AND batch_receipt->>'status'='applied'`);
  const [pendingIndex] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued' AND payload->>'person_id'=${person.id}`);
  assert.equal(written.count, 10000);
  assert.equal(receipts.count, 10000);
  assert.equal(pendingIndex.count, 1, "same-candidate writes reuse the pending index snapshot");
  const report = await readFile(owner, String(prepared.result.result_file_id));
  assert.deepEqual(JSON.parse(report.bytes.toString().trim().split("\n").at(-1)!).counts, prepared.result.counts);
  await finishJob(parent, {result: {tested: true}});
});
