import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, test} from "node:test";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../../src/db/client";
import {initializeGlobalOutboundProxy} from "../../src/lib/server-outbound-proxy";
import {assistantReply, conversationDetails, sendMessage} from "../../src/lib/workspace/conversations";
import {createRole, linkPerson} from "../../src/lib/workspace/roles";
import {createPerson} from "../../src/lib/workspace/people";
import {readFile} from "../../src/lib/workspace/files";
import {rows} from "../../src/lib/workspace/database";
import {claimJob, finishJob, failJob, withJobLease} from "../../src/lib/workspace/jobs";
import {agentCreditContext, executionTrace} from "../../src/lib/agent-credit-context";
import type {Job} from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owners: string[] = [];
after(async () => {
  for (const owner of owners) await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});
async function run(owner: string, source: Job) {
  const job = await claimJob(["chat"], {id: source.id, userId: owner}); assert(job);
  try {
    await withJobLease(job, async (signal, progress) => {
      const result = await agentCreditContext.run({...job, signal, trace: executionTrace(job)}, () => assistantReply(job, progress));
      await finishJob(job, result);
    });
  } catch (error) {await failJob(job, "Assistant QA execution failed"); throw error;}
}
async function snapshot(owner: string) {
  return {
    people: await rows(sql`SELECT id,version FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`),
    roles: await rows(sql`SELECT id,version FROM hirelix_private_roles WHERE user_id=${owner}::uuid ORDER BY id`),
    records: await rows(sql`SELECT id,version FROM hirelix_private_records WHERE user_id=${owner}::uuid ORDER BY id`),
  };
}

test("natural analysis of an unrelated attachment preserves the owned source and creates no business records", {timeout: 180000}, async () => {
  const owner = randomUUID(); owners.push(owner);
  const file = {name: "bread-recipe.txt", type: "text/plain", bytes: Buffer.from("Sourdough bread. Ingredients: flour, water, starter and salt.")};
  const request = {message: "请用中文概括这份文件，仅分析，不保存候选人或职位。", locale: "zh", request_key: randomUUID()};
  const first = await sendMessage(owner, request, file), repeated = await sendMessage(owner, request, file);
  assert.equal(first.job.id, repeated.job.id);
  await assert.rejects(() => sendMessage(owner, request, {...file, bytes: Buffer.from("different")}), /request key/i);
  const before = await snapshot(owner);
  await run(owner, first.job);
  assert.deepEqual(await snapshot(owner), before);
  const details = await conversationDetails(owner, first.conversation_id);
  const attachments = details.messages.find(message => message.role === "user")!.metadata.attachments as Array<{file_id:string}>;
  assert.deepEqual((await readFile(owner, attachments[0].file_id)).bytes, file.bytes);
  await assert.rejects(() => readFile(randomUUID(), attachments[0].file_id), /not found/);
});

test("natural comparison stays read-only and cannot cite another owner's candidate", {timeout: 180000}, async t => {
  const owner = randomUUID(), other = randomUUID(); owners.push(owner, other);
  await createPerson(owner, {name: "QA Morgan Reed", note: "Fictional QA profile: product leader in enterprise SaaS."});
  await createPerson(owner, {name: "QA Taylor Park", note: "Fictional QA profile: accounting and tax director."});
  const outsider = await createPerson(other, {name: "QA Taylor Park", note: "Other account's private candidate evidence."});
  const role = await createRole(owner, {title: "QA VP Product", client_name: "QA client", jd_text: "Lead a product team in enterprise SaaS."});
  const before = await snapshot(owner), outsideBefore = await snapshot(other);
  const sent = await sendMessage(owner, {message: "Compare QA Morgan Reed and QA Taylor Park for this role. Only analyze, do not modify records.", locale: "en", request_key: randomUUID(), role_id: role.id});
  await run(owner, sent.job);
  assert.deepEqual(await snapshot(owner), before); assert.deepEqual(await snapshot(other), outsideBefore);
  const detail = await conversationDetails(owner, sent.conversation_id), answer = detail.messages.find(message => message.role === "assistant");
  const sources = (answer?.metadata.sources || []) as Array<{href:string}>;
  assert.ok(!sources.some(source => source.href.includes(outsider.id)));
  t.diagnostic(`Model returned ${sources.length} owned source links; business judgment is observed separately.`);
});

test("reported consent is scoped to its candidate and role and does not send anything", {timeout: 180000}, async t => {
  const owner = randomUUID(); owners.push(owner);
  const role = await createRole(owner, {title: "QA Engineering Director", client_name: "QA Harbor", jd_text: "Lead an engineering group."});
  const person = await createPerson(owner, {name: "QA Priya Desai"}), other = await createPerson(owner, {name: "QA Alex Chen"});
  await linkPerson(owner, role.id, person.id); await linkPerson(owner, role.id, other.id);
  const sent = await sendMessage(owner, {message: "Priya 已口头同意把她的资料分享给 QA Harbor，请把此事实保存到该职位的资料中。Alex 还没确认。不要发送或分享。", locale: "zh", request_key: randomUUID(), role_id: role.id});
  await run(owner, sent.job);
  const links = await rows<{person_id:string;permission:string;permission_record_id:string|null}>(sql`SELECT person_id,permission,permission_record_id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid`);
  const priya = links.find(link => link.person_id === person.id)!, alex = links.find(link => link.person_id === other.id)!;
  assert.equal(alex.permission, "unknown"); assert.equal(alex.permission_record_id, null);
  if (priya.permission !== "unknown") {
    assert.ok(priya.permission_record_id);
    const [evidence] = await rows<{person_id:string;role_id:string}>(sql`SELECT person_id,role_id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND id=${priya.permission_record_id}::uuid`);
    assert.deepEqual(evidence, {person_id: person.id, role_id: role.id});
  }
  const [sentCount] = await rows<{count:number}>(sql`SELECT count(*)::int count FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND status='submitted'`);
  assert.equal(sentCount.count, 0);
  t.diagnostic(`Model recorded candidate permission as ${priya.permission}.`);
});

test("dated client feedback does not alter the original JD", {timeout: 180000}, async t => {
  const owner = randomUUID(); owners.push(owner);
  const role = await createRole(owner, {title: "QA Product Leader", client_name: "QA Dated Feedback", jd_text: "Original JD; compensation not confirmed."});
  const eventTime = "2026-10-01T09:15:00+08:00";
  const sent = await sendMessage(owner, {message: `Client feedback at ${eventTime}: compensation is GBP 160,000–180,000. Save the updated requirements and the dated feedback. Do not send anything.`, locale: "en", request_key: randomUUID(), role_id: role.id});
  await run(owner, sent.job);
  const [current] = await rows<{jd_text:string}>(sql`SELECT jd_text FROM hirelix_private_roles WHERE user_id=${owner}::uuid AND id=${role.id}::uuid`);
  assert.equal(current.jd_text, role.jd_text);
  const records = await rows<{occurred_at:string|null}>(sql`SELECT occurred_at FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND kind='feedback'`);
  for (const record of records) if (record.occurred_at) assert.equal(new Date(record.occurred_at).getTime(), new Date(eventTime).getTime());
  t.diagnostic(`Model saved ${records.length} feedback record(s).`);
});

test("authorized existing-candidate CV handling preserves identity and original file without a review workflow", {timeout: 240000}, async t => {
  const owner = randomUUID(); owners.push(owner);
  const person = await createPerson(owner, {name: "QA Rowan Ellis", email: "rowan.qa@example.test", headline: "Product Director"});
  const cv = {name: "rowan-cv.txt", type: "text/plain", bytes: Buffer.from("QA Rowan Ellis\nrowan.qa@example.test\nProduct Director. Fictional QA CV.")};
  const sent = await sendMessage(owner, {message: "Save this CV for the already saved QA Rowan Ellis. Do not create another person or share it.", locale: "en", request_key: randomUUID(), person_id: person.id}, cv);
  await run(owner, sent.job);
  const details = await conversationDetails(owner, sent.conversation_id);
  const sourceId = (details.messages.find(message => message.role === "user")!.metadata.attachments as Array<{file_id:string}>)[0].file_id;
  assert.deepEqual((await readFile(owner, sourceId)).bytes, cv.bytes);
  const people = await rows<{id:string}>(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND lower(email)=lower('rowan.qa@example.test')`);
  assert.deepEqual(people.map(item => item.id), [person.id]);
  const sources = await rows<{person_id:string}>(sql`SELECT person_id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND file_id=${sourceId}::uuid`);
  assert.ok(sources.every(source => source.person_id === person.id));
  const [legacy] = await rows<{count:number}>(sql`SELECT count(*)::int count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import' AND payload->>'operation' IS DISTINCT FROM 'record_batch'`);
  assert.equal(legacy.count, 0);
  t.diagnostic(`Model saved ${sources.length} record(s) linked to the original CV.`);
});
