import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { getGlobalDispatcher } from "undici";
import { closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { sendMessage, assistantReply, conversationDetails } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { rows } from "../../src/lib/workspace/database";
import { createPerson } from "../../src/lib/workspace/people";
import { workspaceHandlers } from "../../src/lib/workspace/worker";
import { closeTurnChannel } from "../../src/lib/workspace/turn-channel";
import { createAgentTools } from "../../src/lib/workspace/agent-tools";
import type { Role } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
after(async () => {
  await closeTurnChannel();
  await closeDb();
  await getGlobalDispatcher().close();
});

async function turn(owner: string, message: string, conversation_id?: string) {
  const sent = await sendMessage(owner, { message, conversation_id, locale: "en", request_key: randomUUID() });
  const job = await claimJob(["chat"], { id: sent.job.id, userId: owner });
  assert(job);
  const timer = setInterval(() => void heartbeat(job), 20000);
  try { await finishJob(job, await assistantReply(job, () => heartbeat(job))); }
  finally { clearInterval(timer); }
  const details = await conversationDetails(owner, sent.conversation_id);
  const reply = details.messages.at(-1)!;
  const [saved] = await rows<{result: {agent_steps: Array<{tools: string[]; results: Array<{tool: string; ok: boolean}>}>}}>(sql`SELECT result FROM hirelix_private_jobs WHERE id=${job.id}::uuid`);
  const steps = saved.result.agent_steps;
  console.log(JSON.stringify({ conversation_id: sent.conversation_id, request: message, answer: reply.content, steps }));
  return { conversationId: sent.conversation_id, reply, steps, tools: steps.flatMap(step => step.tools) };
}

test("real model: material alone is not a mandate; accepting the suggested internal work saves and matches", { timeout: 300000 }, async () => {
  const owner = randomUUID();
  const jd = "Fictional Harbor North QA1019 — Head of Product\nWe build B2B SaaS for logistics operations. We need a hands-on product leader who has owned pricing and packaging, shipped warehouse exception-management workflows, and directly managed at least 3 product managers. Based in New York, hybrid 3 days per week. Base salary $180,000–$210,000 plus equity. Reports to the CEO.";
  const received = await turn(owner, `客户刚发来这份 JD：\n\n${jd}\n\n这就是目前客户给我的资料。`);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`)).length, 0);
  assert.ok(!received.tools.some(name => ["update_role", "web_search"].includes(name)));
  assert.ok(received.steps.every(step => step.results.every(result => !(result.ok && ["save_role", "save_candidate", "save_record"].includes(result.tool)))));
  assert.match(received.reply.content, /保存|入库|存.*(?:职位|岗位|角色)|建(?:档|[^\n。]*?(?:职位|岗位|角色)[^\n。]*?记录)/);
  assert.match(received.reply.content, /匹配|检索|候选人/);

  await createPerson(owner, { name: "Fictional Quinn Vale", headline: "Product Director", location: "New York", note: "Owned pricing and packaging for logistics B2B SaaS, shipped warehouse exception-management workflows, directly managed 4 PMs. Accepts New York hybrid three days weekly. Wants $195,000 base." });
  const indexing = await rows<{id:string}>(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued'`);
  for (const item of indexing) {
    const job = await claimJob(["index"], { id: item.id, userId: owner });
    assert(job);
    await finishJob(job, await workspaceHandlers.index!(job, () => heartbeat(job)));
  }
  const accepted = await turn(owner, "好，就按你建议的保存这个职位，再找已有候选人里合适的人，给我匹配理由和待核实的地方。", received.conversationId);
  const roles = await rows<Role>(sql`SELECT * FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  assert.equal(roles.length, 1);
  assert.equal(roles[0].jd_text, jd);
  assert.equal(roles[0].client_name, "Fictional Harbor North QA1019");
  assert.match(roles[0].brief.priorities.join(" "), /180[,.]?000/);
  assert.match(accepted.reply.content, /Quinn/);
  assert.equal(accepted.reply.metadata.question, undefined);
  assert.ok(accepted.tools.includes("save_role"));
  assert.ok(accepted.tools.includes("find_candidates"));
  assert.ok(!accepted.tools.includes("web_search") && !accepted.tools.includes("update_role"));
  assert.ok(accepted.steps.every(step => step.results.every(result => result.ok === true)));
});

test("real model: another kind of supplied material also stays read-only without a delegation", { timeout: 180000 }, async () => {
  const owner = randomUUID();
  const received = await turn(owner, "A colleague just sent me these notes: Fictional Taylor Reed, account executive in Austin, sold enterprise security software for five years, $1.2m annual quota. That's all they sent.");
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`)).length, 0);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_records WHERE user_id=${owner}::uuid`)).length, 0);
  assert.ok(!received.tools.some(name => ["save_candidate", "save_record", "web_search"].includes(name)));
  assert.equal(received.reply.metadata.question, undefined);
});

test("real authorization model: a verbatim receipt quote cannot authorize a tool write", { timeout: 180000 }, async () => {
  const owner = randomUUID();
  const text = "A client just sent this brief: Fictional Test Client — Account Executive. Austin, enterprise security software. That's all they sent.";
  const sent = await sendMessage(owner, { message: text, request_key: randomUUID() });
  const job = await claimJob(["chat"], { id: sent.job.id, userId: owner });
  assert(job);
  const details = await conversationDetails(owner, sent.conversation_id);
  const question = details.messages.find(message => message.role === "user")!;
  const tools = createAgentTools({ job, conversation: details.conversation, question, messages: details.messages, document: null, attachments: [], locale: "en", timezone: "UTC", signal: new AbortController().signal, progress: async () => {}, sources: new Map(), clarification: null });
  const save = tools.save_role as unknown as { execute: (input: unknown) => Promise<{ok: boolean; error?: {code: number}}> };
  const result = await save.execute({ authorization_quote: "A client just sent this brief", role: { title: "Account Executive", client_name: "Fictional Test Client", jd_text: "Fictional Test Client — Account Executive. Austin, enterprise security software.", brief: { priorities: [], flexible: [], unknowns: [] } }, source_file_id: null, notes: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 403);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`)).length, 0);
  await finishJob(job, { result: { rejected_unauthorized_write: true } });
});
