import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { createPerson } from "../../src/lib/workspace/people";
import { createRole } from "../../src/lib/workspace/roles";
import { indexRole } from "../../src/lib/workspace/role-retrieval";
import { sendMessage, assistantReply, conversationDetails, type AssistantMeta } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { enqueue, json, rows } from "../../src/lib/workspace/database";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createCanvas } from "@napi-rs/canvas";
import { uploadConversationFile } from "../../src/lib/workspace/files";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real models and PG: no suitable saved role completes matching without optional questions or writes", { timeout: 180000 }, async () => {
  await createPerson(owner, { name: "Fictional Dana Fox", headline: "Junior videographer", location: "Sheffield", skills: ["camera operation", "video editing"], note: "One year of video production experience. Wants junior photography and video production roles in Sheffield. No product-management leadership experience." });
  const role = await createRole(owner, { title: "VP Product", client_name: "Fictional Atlas Software", jd_text: "London based VP Product. Lead twelve product managers for enterprise SaaS, with at least eight years of product-management leadership. This role has no photography or video-production duties." });
  const indexing = await enqueue(owner, "index", randomUUID(), { role_id: role.id });
  const prepared = await indexRole(indexing, async () => {});
  await db.transaction(async tx => { await prepared.apply?.(tx); });
  const sent = await sendMessage(owner, { message: "Find suitable client roles for Fictional Dana Fox.", locale: "en", request_key: randomUUID() });
  const job = await claimJob(["chat"]);
  assert.equal(job?.id, sent.job.id);
  const timer = setInterval(() => void heartbeat(job!), 20000);
  try { await finishJob(job!, await assistantReply(job!, () => heartbeat(job!))); }
  finally { clearInterval(timer); }
  const message = (await conversationDetails(owner, sent.conversation_id)).messages.at(-1)!;
  const metadata = message.metadata as AssistantMeta;
  assert.equal(message.role, "assistant");
  assert.equal(metadata.question, undefined, JSON.stringify(metadata));
  assert.equal(metadata.actions?.length, 0);
  assert.equal(metadata.work?.length, 0);
  assert.match(message.content, /no suitable|no matching|not .*match|does not .*match|not .*fit|doesn.t .*fit|no .*fit/i);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`)).length, 1);
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`)).length, 1);
});

test("real vision model and PG: resume an image matching request despite a previous optional assistant menu", { timeout: 240000 }, async () => {
  const canvas = createCanvas(1000, 650), context = canvas.getContext("2d");
  context.fillStyle = "white"; context.fillRect(0, 0, 1000, 650);
  context.fillStyle = "black"; context.font = "28px sans-serif";
  ["Fictional QA CV: Dana Fox", "Junior videographer, Sheffield", "One year of camera operation and video editing.", "Wants junior photography or video production work.", "No product management or leadership experience."].forEach((line, index) => context.fillText(line, 35, 70 + index * 65));
  const file = await uploadConversationFile(owner, { name: "fictional-dana-cv.png", type: "image/png", bytes: canvas.toBuffer("image/png") });
  const initial = await sendMessage(owner, { message: "请看看这份简历", file_ids: [file.id], locale: "zh", request_key: randomUUID() });
  // Reproduce the already-saved, incorrect optional menu. The new reply uses
  // real vision, embeddings and PostgreSQL; this history is a fictional fixture.
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE id=${initial.job.id}::uuid AND user_id=${owner}::uuid`);
  for (let turn = 0; turn < 3; turn++) {
    const prior = "已收到匹配请求。Dana Fox 是一名谢菲尔德的初级摄像师，有一年摄像和剪辑经验，希望从事初级影视制作工作。现有伦敦 VP Product 要求八年产品管理与领导经验，没有适合她的职位。请问您是否希望创建一个新客户角色，或者将她存入候选人库？";
    const question = { status: turn === 2 ? "waiting" : "answered", question: "您希望如何处理匹配问题？", options: ["创建新客户角色", "存入候选人库"], request: "为她匹配合适的客户角色" + "\n\nUser clarification: 为她匹配合适的客户角色".repeat(turn), ...(turn < 2 ? { answer: "为她匹配合适的客户角色" } : {}) };
    await db.execute(sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${owner}::uuid,'assistant',${prior},${initial.conversation_id}::uuid,${json({question})})`);
    if (turn < 2) await db.execute(sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${owner}::uuid,'user','为她匹配合适的客户角色',${initial.conversation_id}::uuid,'{}'::jsonb)`);
  }
  const sent = await sendMessage(owner, { conversation_id: initial.conversation_id, message: "为她匹配合适的客户角色", locale: "zh", request_key: randomUUID() });
  const job = await claimJob(["chat"]); assert.equal(job?.id, sent.job.id);
  const timer = setInterval(() => void heartbeat(job!), 20000);
  try { await finishJob(job!, await assistantReply(job!, () => heartbeat(job!))); }
  finally { clearInterval(timer); }
  const message = (await conversationDetails(owner, sent.conversation_id)).messages.at(-1)!;
  const metadata = message.metadata as AssistantMeta;
  assert.equal(metadata.question, undefined, JSON.stringify(metadata));
  assert.equal(metadata.actions?.length, 0); assert.equal(metadata.work?.length, 0);
  assert.match(message.content, /没有|未找到|不匹配|不适合|无.*(?:合适|匹配)/);
  assert.doesNotMatch(message.content, /是否希望|存入候选人库|创建.*客户角色/);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`)).length, 1);
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`)).length, 1);
});
