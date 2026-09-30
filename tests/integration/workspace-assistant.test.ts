import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import {
  acceptAction,
  assistantReply,
  conversationDetails,
  sendMessage,
} from "../../src/lib/workspace/conversations";
import { createRole, linkPerson } from "../../src/lib/workspace/roles";
import { createPerson } from "../../src/lib/workspace/people";
import { readFile } from "../../src/lib/workspace/files";
import { rows } from "../../src/lib/workspace/database";
import { claimJob, finishJob } from "../../src/lib/workspace/jobs";
import { prepareImport } from "../../src/lib/workspace/imports";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_") ||
  process.env.WORKSPACE_REAL_AI_TEST !== "true"
) throw Error("Use an isolated local QA database and real AI for this test");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

async function askWithFile(message: string, name: string, contents: string) {
  const request = {
    message,
    locale: "zh" as const,
    request_key: randomUUID(),
    conversation_id: null,
    role_id: null,
    person_id: null,
  };
  const file = { name, type: "text/plain", bytes: Buffer.from(contents) };
  const created = await sendMessage(owner, request, file);
  const repeated = await sendMessage(owner, request, file);
  assert.equal(repeated.job.id, created.job.id);
  await assert.rejects(() => sendMessage(owner, request, {
    ...file,
    bytes: Buffer.from("different file"),
  }));
  const detail = await conversationDetails(owner, created.conversation_id);
  assert.equal(detail.messages.length, 1);
  assert.equal(detail.messages[0].content, message);
  const source = detail.messages[0].metadata.attachment as { file_id: string };
  assert.deepEqual((await readFile(owner, source.file_id)).bytes, file.bytes);
  assert.equal(created.job.kind, "chat");
  const prepared = await assistantReply(created.job, async () => {});
  await db.transaction(async (tx) => { await prepared.apply?.(tx); });
  const answered = await conversationDetails(owner, created.conversation_id);
  assert.equal(answered.messages.length, 2);
  return answered.messages[1];
}

test("assistant treats an unrelated file as conversation material and does not import a candidate", { timeout: 180000 }, async () => {
  const reply = await askWithFile(
    "请用中文概括这份文件，并说说需要什么食材。",
    "bread-recipe.txt",
    "Sourdough bread recipe. Ingredients: 500g bread flour, 350g water, 100g starter, 10g salt. Mix, ferment, shape and bake.",
  );
  assert.match(reply.content, /面包|酸种|面粉/);
  assert.equal(reply.metadata.import_job_id, undefined);
  const [imports] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import'`,
  );
  assert.equal(imports.total, 0);
});

test("assistant reads a JD without forcing a candidate import or an unrequested save", { timeout: 180000 }, async () => {
  const reply = await askWithFile(
    "这是客户的职位说明。先帮我抓住重点，不要建立职位。",
    "vp-product.txt",
    "Northstar is hiring a VP Product. The top priority is building and leading a product team of 12. Experience with B2B SaaS and enterprise buyers is important. Compensation is not yet confirmed.",
  );
  assert.match(reply.content, /产品|团队|Northstar/i);
  assert.equal(reply.metadata.import_job_id, undefined);
  assert.deepEqual(reply.metadata.actions, []);
});

test("assistant proactively prepares a candidate draft only from a grounded CV", { timeout: 240000 }, async () => {
  const reply = await askWithFile(
    "把这份简历加入我的候选人池。",
    "morgan-reed.txt",
    "Morgan Reed\nProduct Director at Atlas Software, 2021-present.\nPreviously Senior Product Manager at Beacon Cloud, 2017-2021.\nLed B2B SaaS teams and enterprise product launches.\nEmail: morgan.reed@example.test",
  );
  const importId = reply.metadata.import_job_id;
  assert.equal(typeof importId, "string");
  const [before] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_agent_people WHERE user_id=${owner}::uuid`,
  );
  assert.equal(before.total, 0);
  const claimed = await claimJob(["import"]);
  assert(claimed);
  assert.equal(claimed.id, importId);
  await finishJob(claimed, await prepareImport(claimed, async () => {}));
  const [draft] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_private_import_rows WHERE user_id=${owner}::uuid AND job_id=${importId}::uuid AND status='review'`,
  );
  assert.equal(draft.total, 1);
  const [afterImport] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_agent_people WHERE user_id=${owner}::uuid`,
  );
  assert.equal(afterImport.total, 0);
});

test("a Chinese greeting follows the message language even in an English interface", { timeout: 180000 }, async () => {
  await createRole(owner, {
    title: "VP Product",
    client_name: "Northstar",
    jd_text: "Build and lead the product team.",
    brief: {
      priorities: ["Build and lead the product team"],
      flexible: [],
      unknowns: ["Compensation range has not been confirmed"],
    },
  });
  const created = await sendMessage(owner, {
    message: "你好",
    locale: "en",
    request_key: randomUUID(),
    conversation_id: null,
    role_id: null,
    person_id: null,
  });
  const prepared = await assistantReply(created.job, async () => {});
  await db.transaction(async (tx) => { await prepared.apply?.(tx); });
  const detail = await conversationDetails(owner, created.conversation_id);
  assert.equal(detail.messages.length, 2);
  assert.match(detail.messages[1].content, /你想处理什么/);
  assert.doesNotMatch(detail.messages[1].content, /Northstar|VP Product|薪酬/);
});

test("named comparison retrieves each saved person independently, without role links or another owner's evidence", { timeout: 180000 }, async () => {
  const first = await createPerson(owner, {
    name: "QA Morgan Reed",
    note: "Fictional QA profile. Led 12 product managers in enterprise B2B SaaS. Availability and consent unknown.",
  });
  const second = await createPerson(owner, {
    name: "QA Taylor Park",
    note: "Fictional QA profile. Corporate accounting and tax director. No product leadership evidence. Availability and consent unknown.",
  });
  const outsider = await createPerson(randomUUID(), {
    name: "QA Taylor Park",
    note: "Other account's private candidate evidence.",
  });
  const role = await createRole(owner, {
    title: "QA VP Product comparison",
    client_name: "QA comparison client",
    jd_text: "Lead a team of 12 product managers in enterprise B2B SaaS. Accounting alone does not meet this role.",
  });
  const created = await sendMessage(owner, {
    message: "Compare QA Morgan Reed and QA Taylor Park from my saved pool for this role. Cite both profiles, distinguish missing evidence, and do not assume availability or consent. These are fictional QA profiles.",
    locale: "en",
    request_key: randomUUID(),
    role_id: role.id,
  });
  const prepared = await assistantReply(created.job, async () => {});
  await db.transaction(async (tx) => { await prepared.apply?.(tx); });
  const reply = (await conversationDetails(owner, created.conversation_id)).messages[1];
  const coverage = reply.metadata.coverage as { lookup: string; lookups: Array<{ total: number; returned: number }> };
  assert.equal(coverage.lookup, "exact");
  assert.equal(coverage.lookups.length, 2);
  assert(coverage.lookups.every((lookup) => lookup.total === 1 && lookup.returned === 1));
  const sources = reply.metadata.sources as Array<{ href: string }>;
  assert(sources.some((source) => source.href.includes(first.id)));
  assert(sources.some((source) => source.href.includes(second.id)));
  assert(!sources.some((source) => source.href.includes(outsider.id)));
  assert.match(reply.content, /Morgan Reed/);
  assert.match(reply.content, /Taylor Park/);
  assert.match(reply.content, /accounting|tax/i);
});

test("reported sharing consent stays pending until one review saves both evidence and role permission", { timeout: 180000 }, async () => {
  const role = await createRole(owner, {
    title: "Engineering Director",
    client_name: "Harbor Labs",
    jd_text: "Lead the engineering group at Harbor Labs.",
  });
  const person = await createPerson(owner, { name: "Priya Desai (QA)" });
  const otherPerson = await createPerson(owner, { name: "Alex Chen (QA)" });
  await linkPerson(owner, role.id, person.id);
  await linkPerson(owner, role.id, otherPerson.id);
  const created = await sendMessage(owner, {
    message: "Priya 已口头同意把她的资料分享给 Harbor Labs，Alex 还没确认。先不要发送推荐。",
    locale: "zh",
    request_key: randomUUID(),
    conversation_id: null,
    role_id: role.id,
    person_id: null,
  });
  const prepared = await assistantReply(created.job, async () => {});
  await db.transaction(async (tx) => { await prepared.apply?.(tx); });
  const detail = await conversationDetails(owner, created.conversation_id);
  const reply = detail.messages[1];
  assert.doesNotMatch(reply.content, /已记录[:：]|已保存[:：]/);
  assert.doesNotMatch(reply.content, /\b(?:role|person|source|attachment)_\d+\b/);
  const actions = reply.metadata.actions as Array<{ id: string; kind: string; fields: Record<string, unknown> }>;
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "update_sharing_permission");
  assert.match(String(actions[0].fields.content), /Priya|口头/);
  assert.doesNotMatch(String(actions[0].fields.content), /Alex/);
  const [before] = await rows<{ permission: string; permission_record_id: string | null }>(
    sql`SELECT permission,permission_record_id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`,
  );
  assert.equal(before.permission, "unknown");
  assert.equal(before.permission_record_id, null);
  const [unsavedRecords] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`,
  );
  assert.equal(unsavedRecords.total, 0);
  await acceptAction(owner, created.conversation_id, reply.id, actions[0].id, actions[0].fields);
  await acceptAction(owner, created.conversation_id, reply.id, actions[0].id, actions[0].fields);
  const [afterConsent] = await rows<{ permission: string; permission_record_id: string | null; content: string }>(
    sql`SELECT rc.permission,rc.permission_record_id,r.content FROM hirelix_private_role_candidates rc JOIN hirelix_private_records r ON r.id=rc.permission_record_id AND r.user_id=rc.user_id WHERE rc.user_id=${owner}::uuid AND rc.role_id=${role.id}::uuid AND rc.person_id=${person.id}::uuid`,
  );
  assert.equal(afterConsent.permission, "confirmed");
  assert.match(afterConsent.content, /Priya|口头/);
  const [otherConsent] = await rows<{ permission: string; permission_record_id: string | null }>(
    sql`SELECT permission,permission_record_id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${otherPerson.id}::uuid`,
  );
  assert.equal(otherConsent.permission, "unknown");
  assert.equal(otherConsent.permission_record_id, null);
  const [records] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`,
  );
  assert.equal(records.total, 1);
  const [sent] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND status='submitted'`,
  );
  assert.equal(sent.total, 0);
});

test("dated client feedback preserves the reviewed event time with its role update", { timeout: 180000 }, async () => {
  const role = await createRole(owner, {
    title: "QA Product Leader",
    client_name: "QA Dated Feedback",
    jd_text: "Product leadership; compensation not confirmed.",
  });
  const eventTime = "2026-10-01T09:15:00+08:00";
  const created = await sendMessage(owner, {
    message: `Fictional QA feedback received at ${eventTime}: the client confirmed compensation of GBP 160,000–180,000. Prepare an update to this role's requirements for review and preserve the feedback event time. Do not send anything.`,
    locale: "en",
    request_key: randomUUID(),
    role_id: role.id,
  });
  const prepared = await assistantReply(created.job, async () => {});
  await db.transaction(async (tx) => { await prepared.apply?.(tx); });
  const reply = (await conversationDetails(owner, created.conversation_id)).messages[1];
  const actions = reply.metadata.actions as Array<{ id: string; kind: string; fields: Record<string, unknown> }>;
  const action = actions.find((item) => item.kind === "update_role_brief");
  assert(action);
  assert.equal(new Date(String(action.fields.occurred_at)).getTime(), new Date(eventTime).getTime());
  const reviewedTime = "2026-10-01T09:20:00+08:00";
  await acceptAction(owner, created.conversation_id, reply.id, action.id, { ...action.fields, occurred_at: reviewedTime });
  await acceptAction(owner, created.conversation_id, reply.id, action.id, { ...action.fields, occurred_at: reviewedTime });
  const records = await rows<{ occurred_at: string; content: string }>(
    sql`SELECT occurred_at,content FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND kind='feedback'`,
  );
  assert.equal(records.length, 1);
  assert.equal(new Date(records[0].occurred_at).getTime(), new Date(reviewedTime).getTime());
  assert.match(records[0].content, /160,000/);
});
