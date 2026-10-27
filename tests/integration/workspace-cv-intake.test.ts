import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, test} from "node:test";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../../src/db/client";
import {initializeGlobalOutboundProxy} from "../../src/lib/server-outbound-proxy";
import {uploadConversationFile, readFile} from "../../src/lib/workspace/files";
import {sendMessage, assistantReply, conversationDetails} from "../../src/lib/workspace/conversations";
import {rows} from "../../src/lib/workspace/database";
import {claimJob, finishJob, failJob, withJobLease} from "../../src/lib/workspace/jobs";
import {agentCreditContext, executionTrace} from "../../src/lib/agent-credit-context";
import type {Person} from "../../src/lib/workspace/types";
import {makeCandidateIntakePdf} from "../helpers/workspace-file-fixtures";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});
async function chat(message: string, conversation_id?: string, file_ids: string[] = []) {
  const sent = await sendMessage(owner, {message, conversation_id, file_ids, locale: "zh", timezone: "Asia/Shanghai", request_key: randomUUID()});
  const job = await claimJob(["chat"], {id: sent.job.id, userId: owner}); assert(job);
  try {
    await withJobLease(job, async (signal, progress) => {
      const result = await agentCreditContext.run({...job, signal, trace: executionTrace(job)}, () => assistantReply(job, progress));
      await finishJob(job, result);
    });
  } catch (error) { await failJob(job, "CV intake QA execution failed"); throw error; }
  return conversationDetails(owner, sent.conversation_id);
}
async function people() {return rows<Person>(sql`SELECT * FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`);}

test("real PDF + model + PG: observe authorized CV handling, original ownership and later read-only work", {timeout: 900000}, async t => {
  const bytes = await makeCandidateIntakePdf();
  const file = await uploadConversationFile(owner, {name: "resume.pdf", type: "application/pdf", bytes});
  const first = await chat("", undefined, [file.id]);
  assert.equal((await people()).length, 0, "a bare attachment cannot authorize a candidate write");
  const second = await chat("加入候选人库吧。", first.conversation.id);
  const saved = await people();
  const records = await rows<{person_id: string; file_id: string | null; kind: string}>(sql`SELECT person_id,file_id,kind FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id IS NOT NULL`);
  for (const person of saved) assert.ok(records.some(record => record.person_id === person.id && record.file_id === file.id), "a persisted candidate must retain the supplied source");
  const [legacy] = await rows<{count: number}>(sql`SELECT count(*)::int count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import' AND payload->>'operation' IS DISTINCT FROM 'record_batch'`);
  assert.equal(legacy.count, 0);
  assert.deepEqual((await readFile(owner, file.id)).bytes, bytes);
  await assert.rejects(() => readFile(randomUUID(), file.id), /not found/);
  const before = await people();
  await chat("查一下刚才简历中的工作经验，只查询，不修改资料。", second.conversation.id);
  const afterRead = await people();
  assert.deepEqual(afterRead.map(person => [person.id, person.version]), before.map(person => [person.id, person.version]));
  t.diagnostic(`Model saved ${saved.length} candidate(s); read-only follow-up preserved their versions.`);
});
