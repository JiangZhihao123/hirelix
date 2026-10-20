import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb } from "../../src/db/client";
import { sendMessage, conversationDetails } from "../../src/lib/workspace/conversations";
import { rows } from "../../src/lib/workspace/database";
import { createPerson } from "../../src/lib/workspace/people";
import { createRole } from "../../src/lib/workspace/roles";
import type { Job } from "../../src/lib/workspace/types";

// Independent scheduler/worker must share this isolated QA database. No model mocks.
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname === "/hirelix_workspace_qa_search_scenarios_20261020");
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
const evidenceDirectory = "/Users/noah/projects/hirelix-local-archive/2026-10-20/recruiter-search-scenarios";
after(async () => { await closeDb(); });

type Evidence = {name: string; owner: string; conversation_id: string; job_id: string; request: string; reply: unknown; tools: string[]; job: Job; cost: unknown; duration_ms: number};
const results: Evidence[] = [];
async function turn(name: string, owner: string, message: string, context: {conversation_id?: string; role_ids?: string[]; candidate_ids?: string[]; locale?: "en" | "zh"} = {}) {
  const start = Date.now();
  const sent = await sendMessage(owner, {message, request_key: randomUUID(), timezone: "Europe/London", locale: "en", ...context});
  let job: Job | undefined;
  while (Date.now() - start < 300000) {
    [job] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${sent.job.id}::uuid`);
    if (job && ["done", "error", "cancelled"].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const details = await conversationDetails(owner, sent.conversation_id);
  const reply = details.messages.filter(m => m.role === "assistant").at(-1);
  const tools = ((job?.result?.agent_steps || []) as Array<{tools: string[]}>).flatMap(step => step.tools);
  const cost = await rows(sql`SELECT consumed_units,cost_nano_usd,pricing_snapshot FROM hirelix_agent_credit_usage WHERE job_id=${sent.job.id}::uuid`);
  const evidence = {name, owner, conversation_id: sent.conversation_id, job_id: sent.job.id, request: message, reply, tools, job: job!, cost, duration_ms: Date.now() - start};
  results.push(evidence);
  await mkdir(evidenceDirectory, {recursive: true});
  await writeFile(`${evidenceDirectory}/${name}.json`, JSON.stringify(evidence, null, 2));
  await writeFile(`${evidenceDirectory}/all-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({name, job_id: sent.job.id, status: job?.status, duration_ms: evidence.duration_ms, tools, reply: reply?.content}));
  assert.equal(job?.status, "done", `Independent worker did not finish: ${job?.status}; ${job?.error}`);
  assert.ok(reply);
  assert.ok(reply.content.trim());
  assert.equal(reply.metadata.question, undefined, "A bounded research/analysis request should deliver useful work without an optional decision gate");
  const writes = await rows(sql`SELECT 'role' AS kind,id FROM hirelix_private_roles WHERE user_id=${owner}::uuid UNION ALL SELECT 'person',id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);
  return {evidence, reply: reply!, writes};
}

test("ordinary recruiter request: get ready for a client founder call, then distinguish facts from hypotheses", {timeout: 660000}, async () => {
  const owner = randomUUID();
  const prep = await turn("founder-call", owner, "I'm speaking with the founder of Stord tomorrow about a senior sales hire. Can you help me get up to speed before the call?");
  assert.equal(prep.writes.length, 0);
  assert.ok(prep.evidence.tools.some(name => ["web_search", "web_fetch"].includes(name)), "Current company preparation needs actual public evidence");
  assert.ok((prep.reply.metadata.sources as Array<{href: string}> | undefined)?.some(s => s.href.startsWith("https://")));
  const checked = await turn("founder-follow-up", owner, "Which parts of that are actually confirmed and which are your suggestions? I don't want to repeat guesses to the founder.", {conversation_id: prep.evidence.conversation_id});
  assert.equal(checked.writes.length, 0);
});

test("ordinary recruiter request: explain the client's website and sales hiring difficulty", {timeout: 330000}, async () => {
  const result = await turn("client-website", randomUUID(), "客户官网是 https://www.veeqo.com/ ，他们到底做什么的？这个销售负责人为什么可能不好招？", {locale: "zh"});
  assert.equal(result.writes.length, 0);
  assert.ok(result.evidence.tools.includes("web_fetch"), "The client supplied a website; the Agent should read it rather than only infer from its domain");
  assert.ok((result.reply.metadata.sources as Array<{href: string}> | undefined)?.some(s => s.href.includes("veeqo.com")));
});

test("ordinary recruiter request: a LinkedIn profile against the selected JD", {timeout: 330000}, async () => {
  const owner = randomUUID();
  const role = await createRole(owner, {title: "Product Director", client_name: "Fictional Warehouse SaaS QA", jd_text: "Product Director for a warehouse operations SaaS company. Must have personally shipped warehouse software workflows, directly managed at least four product managers, and owned product strategy and delivery."});
  const before = await rows(sql`SELECT id,version,jd_text,brief FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  const result = await turn("linkedin-jd", owner, "What do you make of this person for the role? https://www.linkedin.com/in/ryanpetersen/", {role_ids: [role.id]});
  assert.equal(result.writes.length, 1, "Analysis does not authorize saving a candidate");
  assert.deepEqual(await rows(sql`SELECT id,version,jd_text,brief FROM hirelix_private_roles WHERE user_id=${owner}::uuid`), before);
  assert.ok(result.evidence.tools.includes("read_role"));
  assert.ok(result.evidence.tools.some(name => ["web_search", "web_fetch"].includes(name)));
});

test("ordinary recruiter request: existing candidate evidence takes precedence over employer assumptions", {timeout: 330000}, async () => {
  const owner = randomUUID();
  const a = await createPerson(owner, {name: "Fictional Alex Warehouse", headline: "Product Manager, Manhattan Associates", note: "Recruiter phone notes: personally led receiving and putaway workflow releases in the warehouse management product for three years. No information yet about direct reports."});
  const b = await createPerson(owner, {name: "Fictional Jamie Commerce", headline: "Product Manager, Manhattan Associates", note: "Recruiter phone notes: worked on the customer-facing ecommerce storefront and promotions product. We have not discussed warehouse software projects yet."});
  const before = await rows(sql`SELECT id,version,note,profile FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`);
  const result = await turn("existing-candidates", owner, "客户说必须亲自做过仓储软件。你看这两个人，谁有依据，谁还需要问？", {candidate_ids: [a.id, b.id], locale: "zh"});
  assert.equal(result.writes.length, 2);
  assert.deepEqual(await rows(sql`SELECT id,version,note,profile FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`), before);
  assert.ok(result.evidence.tools.includes("read_candidate"));
  assert.ok(!result.evidence.tools.includes("web_search") && !result.evidence.tools.includes("web_fetch"), "Private notes already settle this narrow comparison; don't send candidate details outside");
});
