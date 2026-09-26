import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import {
  assistantOpening,
  assistantReply,
  conversationDetails,
  sendMessage,
} from "../../src/lib/workspace/conversations";
import { createRole } from "../../src/lib/workspace/roles";
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

test("assistant opens with a grounded, proactive question about active work", { timeout: 180000 }, async () => {
  const openingOwner = randomUUID();
  await createRole(openingOwner, {
    title: "VP Product",
    client_name: "Northstar",
    jd_text: "Build and lead the product team.",
    brief: {
      priorities: ["Build and lead the product team"],
      flexible: [],
      unknowns: ["Compensation range has not been confirmed"],
    },
  });
  const opening = await assistantOpening(openingOwner, "zh");
  assert.match(opening.message, /Northstar|产品|薪酬/);
  assert(opening.suggested_prompt.length > 5);
});

test("a simple greeting reconnects to a real active role instead of asking how to help", { timeout: 180000 }, async () => {
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
    locale: "zh",
    request_key: randomUUID(),
    conversation_id: null,
    role_id: null,
    person_id: null,
  });
  const prepared = await assistantReply(created.job, async () => {});
  await db.transaction(async (tx) => { await prepared.apply?.(tx); });
  const detail = await conversationDetails(owner, created.conversation_id);
  assert.equal(detail.messages.length, 2);
  assert.match(detail.messages[1].content, /Northstar|VP Product/);
  assert.match(detail.messages[1].content, /薪酬|预算|范围/);
  assert.match(detail.messages[1].content, /？|\?/);
});
