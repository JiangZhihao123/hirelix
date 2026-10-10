import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, test} from "node:test";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../../src/db/client";
import {initializeGlobalOutboundProxy} from "../../src/lib/server-outbound-proxy";
import {uploadConversationFile, readFile} from "../../src/lib/workspace/files";
import {sendMessage, assistantReply, conversationDetails, type AssistantMeta} from "../../src/lib/workspace/conversations";
import {rows} from "../../src/lib/workspace/database";
import {prepareImport} from "../../src/lib/workspace/imports";
import {indexCandidate, retrieveCandidates} from "../../src/lib/workspace/retrieval";
import {claimJob, heartbeat, finishJob, failJob, type JobHandler} from "../../src/lib/workspace/jobs";
import {agentCreditContext} from "../../src/lib/agent-credit-context";
import type {Person, SourceRecord, JobKind} from "../../src/lib/workspace/types";
import {makeCandidateIntakePdf} from "../helpers/workspace-file-fixtures";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});
async function execute(kind: JobKind, handler: JobHandler, expected?: string) {
  const job = await claimJob([kind]);
  assert(job); assert.equal(job.user_id, owner); if (expected) assert.equal(job.id, expected);
  const timer = setInterval(() => void heartbeat(job), 20000);
  try { await finishJob(job, await agentCreditContext.run(job, () => handler(job, message => heartbeat(job, message)))); }
  catch (error) { await failJob(job, "CV intake QA execution failed"); throw error; }
  finally { clearInterval(timer); }
}
async function chat(message: string, conversation_id?: string, file_ids: string[] = []) {
  const sent = await sendMessage(owner, {message, conversation_id, file_ids, locale: "zh", timezone: "Asia/Shanghai", request_key: randomUUID()});
  await execute("chat", assistantReply, sent.job.id);
  const detail = await conversationDetails(owner, sent.conversation_id);
  console.log(JSON.stringify({stage: "chat", message, answer: detail.messages.at(-1)!.content, metadata: detail.messages.at(-1)!.metadata}));
  return detail;
}
async function people() {return rows<Person>(sql`SELECT * FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);}
async function indexAll() {
  for (;;) {
    const pending = await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued'`);
    if (!pending.length) break;
    await execute("index", indexCandidate);
  }
}
test("real PDF + native DeepSeek vision + PG: bare upload asks, natural answer saves, originals persist, new conversation retrieves and edits", {timeout: 900000}, async () => {
  const bytes = await makeCandidateIntakePdf();
  const file = await uploadConversationFile(owner, {name: "resume.pdf", type: "application/pdf", bytes});
  const first = await chat("", undefined, [file.id]);
  const question = first.messages.at(-1)!;
  assert.equal((question.metadata as AssistantMeta).question?.status, "waiting", "bare CV must ask the intended use before any import");
  assert.equal((await people()).length, 0);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import'`)).length, 0);
  await chat("加入候选人库吧。", first.conversation.id);
  const imports = await rows<{id: string}>(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import' AND status='queued'`);
  assert.equal(imports.length, 1, "the natural answer must continue the original PDF intake");
  await execute("import", prepareImport, imports[0].id);
  const [person] = await people(); assert(person); assert.equal((await people()).length, 1);
  assert.equal(person.name, "Avery Moss Intake 1010"); assert.match(person.headline, /Senior Product Manager/i);
  assert.equal(person.email, "avery.moss.intake1010@example.test");
  assert.match(JSON.stringify(person.profile), /9 hours.*4 hours|9.*4/);
  assert.deepEqual((await readFile(owner, file.id)).bytes, bytes);
  await assert.rejects(() => readFile(randomUUID(), file.id), /not found/);
  const records = await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid AND kind='cv'`);
  assert.equal(records.length, 1); assert.equal(records[0].file_id, file.id); assert.match(records[0].content, /Avery Moss/);
  const answered = (await conversationDetails(owner, first.conversation.id)).messages.find(m => m.id === question.id)!;
  assert.equal((answered.metadata as AssistantMeta).question?.status, "answered");
  await indexAll();
  const retrieval = await retrieveCandidates(owner, {query: "warehouse logistics exception workflow reduced resolution time from nine hours to four hours"});
  assert.equal(retrieval.matches[0]?.person.id, person.id);
  assert.equal((await retrieveCandidates(randomUUID(), {query: "warehouse logistics exception workflow"})).matches.length, 0);
  const found = await chat("找一下我库里做过物流仓库异常处理产品、把处理耗时从9小时降到4小时的候选人，告诉我姓名和经历。只查询。");
  assert.notEqual(found.conversation.id, first.conversation.id);
  assert.match(found.messages.at(-1)!.content, /Avery Moss/);
  assert.equal((await people())[0].version, person.version);
  await chat("把 Avery Moss Intake 1010 的头衔更正为 Product Director，其他资料保持不变，保存。", found.conversation.id);
  const [updated] = await people(); assert.equal(updated.id, person.id); assert.equal(updated.headline, "Product Director");
  assert.equal(updated.version, person.version + 1); assert.equal(updated.email, person.email); assert.deepEqual(updated.profile, person.profile);
  assert.deepEqual((await readFile(owner, file.id)).bytes, bytes);
  await indexAll();
  assert.match((await retrieveCandidates(owner, {query: "logistics product director"})).matches[0].person.headline, /Product Director/);
  console.log(JSON.stringify({verified: ["question", "natural_answer", "one_candidate", "original_pdf", "file_isolation", "new_conversation_retrieval", "partial_update", "reindex"], owner, person_id: person.id, file_id: file.id}));
});
