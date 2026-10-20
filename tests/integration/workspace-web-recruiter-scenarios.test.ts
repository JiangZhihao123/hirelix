import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb } from "../../src/db/client";
import { sendMessage, conversationDetails } from "../../src/lib/workspace/conversations";
import { rows } from "../../src/lib/workspace/database";
import { createPerson } from "../../src/lib/workspace/people";
import { uploadConversationFile, readFile as readWorkspaceFile } from "../../src/lib/workspace/files";
import { cancelJob } from "../../src/lib/workspace/jobs";
import { createRole } from "../../src/lib/workspace/roles";
import type { Job } from "../../src/lib/workspace/types";

// Independent scheduler/worker must share this isolated QA database. No model mocks.
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname === "/hirelix_workspace_qa_engineering_20261020");
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
const evidenceDirectory = process.env.WORKSPACE_QA_EVIDENCE_DIR || "";
assert.ok(evidenceDirectory.startsWith("/Users/noah/projects/hirelix-local-archive/2026-10-20/engineering-"), "Run with the observed QA worker and an engineering evidence directory");
after(async () => { await closeDb(); });

type Evidence = {name: string; owner: string; conversation_id: string; job_id: string; request: string; reply: unknown; tools: string[]; job: Job; cost: unknown; duration_ms: number};
const results: Evidence[] = [];
async function turn(name: string, owner: string, message: string, context: {conversation_id?: string; role_ids?: string[]; candidate_ids?: string[]; file_ids?: string[]; delivery?: "queue" | "immediate"; locale?: "en" | "zh"} = {}) {
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
  assert.ok(reply.content.trim() || reply.metadata.question, "A completed turn exposes a reply or an explicit question");

  await verifyEngineering(evidence, context);
  const writes = await rows(sql`SELECT 'role' AS kind,id FROM hirelix_private_roles WHERE user_id=${owner}::uuid UNION ALL SELECT 'person',id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);
  return {evidence, reply: reply!, writes};
}

test("ordinary recruiter request: get ready for a client founder call, then distinguish facts from hypotheses", {timeout: 660000}, async () => {
  const owner = randomUUID();
  const prep = await turn("founder-call", owner, "I'm speaking with the founder of Stord tomorrow about a senior sales hire. Can you help me get up to speed before the call?");
  assert.equal(prep.writes.length, 0);


  const checked = await turn("founder-follow-up", owner, "Which parts of that are actually confirmed and which are your suggestions? I don't want to repeat guesses to the founder.", {conversation_id: prep.evidence.conversation_id});
  assert.equal(checked.writes.length, 0);
});

test("ordinary recruiter request: explain the client's website and sales hiring difficulty", {timeout: 330000}, async () => {
  const result = await turn("client-website", randomUUID(), "客户官网是 https://www.veeqo.com/ ，他们到底做什么的？这个销售负责人为什么可能不好招？", {locale: "zh"});
  assert.equal(result.writes.length, 0);


});

test("ordinary recruiter request: a LinkedIn profile against the selected JD", {timeout: 330000}, async () => {
  const owner = randomUUID();
  const role = await createRole(owner, {title: "Product Director", client_name: "Fictional Warehouse SaaS QA", jd_text: "Product Director for a warehouse operations SaaS company. Must have personally shipped warehouse software workflows, directly managed at least four product managers, and owned product strategy and delivery."});
  const before = await rows(sql`SELECT id,version,jd_text,brief FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  const result = await turn("linkedin-jd", owner, "What do you make of this person for the role? https://www.linkedin.com/in/ryanpetersen/", {role_ids: [role.id]});
  assert.equal(result.writes.length, 1, "Analysis does not authorize saving a candidate");
  assert.deepEqual(await rows(sql`SELECT id,version,jd_text,brief FROM hirelix_private_roles WHERE user_id=${owner}::uuid`), before);


});

test("ordinary recruiter request: selected candidate context and analysis data boundaries", {timeout: 330000}, async () => {
  const owner = randomUUID();
  const a = await createPerson(owner, {name: "Fictional Alex Warehouse", headline: "Product Manager, Manhattan Associates", note: "Recruiter phone notes: personally led receiving and putaway workflow releases in the warehouse management product for three years. No information yet about direct reports."});
  const b = await createPerson(owner, {name: "Fictional Jamie Commerce", headline: "Product Manager, Manhattan Associates", note: "Recruiter phone notes: worked on the customer-facing ecommerce storefront and promotions product. We have not discussed warehouse software projects yet."});
  const before = await rows(sql`SELECT id,version,note,profile FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`);
  const result = await turn("existing-candidates", owner, "客户说必须亲自做过仓储软件。你看这两个人，谁有依据，谁还需要问？", {candidate_ids: [a.id, b.id], locale: "zh"});
  assert.equal(result.writes.length, 2);
  assert.deepEqual(await rows(sql`SELECT id,version,note,profile FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`), before);


});

// This evaluates transport and persistence contracts, not the LLM's chosen path or conclusions.
async function verifyEngineering(evidence: Evidence, context: {role_ids?: string[]; candidate_ids?: string[]; file_ids?: string[]}) {
  const transport = await Promise.all((await readdir(`${evidenceDirectory}/transport`)).map(async name => JSON.parse(await readFile(`${evidenceDirectory}/transport/${name}`, "utf8")) as {id: string; job_id?: string; phase: string; path: string; status?: number; body: Record<string, unknown>}));
  const [message] = await rows<{created_at: string}>(sql`SELECT created_at FROM hirelix_agent_messages WHERE user_id=${evidence.owner}::uuid AND id=${String(evidence.job.payload.message_id)}::uuid`);
  const modelRequests = transport.filter(event => event.phase === "request" && event.path.endsWith("/chat/completions") && Array.isArray(event.body.tools) && containsText(event.body.messages, evidence.request) && containsText(event.body.messages, message.created_at));
  assert.ok(modelRequests.length, "The real model must receive the user's current request");
  for (const id of [...context.role_ids || [], ...context.candidate_ids || [], ...context.file_ids || []]) assert.ok(containsText(modelRequests[0].body.messages, id), "Selected object references must reach the real model");
  const toolNames = (modelRequests[0].body.tools as Array<{function: {name: string}}>).map(t => t.function.name);
  assert.ok(toolNames.includes("web_search") && toolNames.includes("web_fetch"), "Retrieval capabilities must be available; their use is the model's decision");
  const publicResponses = transport.filter(event => event.job_id === evidence.job_id && event.phase === "response" && event.path.startsWith("/v1/tools/"));
  for (const event of publicResponses) {
    const observed = modelRequests.flatMap(request => request.body.messages as Array<{role: string; content: unknown}>).filter(message => message.role === "tool");
    if (event.status === 200) {
      // After a successful call, its real observation must be visible to the next model step.
      const expected = event.path.endsWith("/search") ? (event.body.results as Array<{url: string}>).map(r => r.url) : [String(event.body.content).slice(0, 120)];
      if (event.path.endsWith("/search")) {
        for (const url of expected.filter(url => /^https?:/.test(url))) assert.ok(containsText(observed, new URL(url).href), "Provider source URL must reach the model");
      } else if (expected[0]) assert.ok(containsText(observed, expected[0]), "Fetched page content must reach the next model step");
    } else {
      assert.ok(containsText(observed, `HTTP ${event.status}`), "Provider failure must be exposed as an error observation");
    }
  }
  const observations = modelRequests.flatMap(request => request.body.messages as Array<{role: string; content: string}>).filter(message => message.role === "tool").map(message => { try { return JSON.parse(message.content) as {ok: boolean; result?: Record<string, unknown>}; } catch { return null; } });
  for (const event of publicResponses.filter(e => e.status === 200 && e.path.endsWith("/search"))) {
    const request = transport.find(e => e.id === event.id && e.phase === "request")!;
    const observation = observations.find(o => o?.ok && o.result?.query === request.body.query)?.result;
    assert.ok(observation);
    assert.ok(typeof observation.searched_at === "string" && Number.isFinite(Date.parse(observation.searched_at)));
    for (const source of observation.sources as Array<{href: string; snippet: string; summary: string; content: string; relevance: number; authority: number; publishedAt: string | null; truncated: boolean}>) {
      const raw = (event.body.results as Array<{url: string; snippet: string; summary: string; content: string; rerank_score: number; authority: number; date: string | null}>).find(r => new URL(r.url).href === source.href)!;
      assert.ok(raw, "Every source given to the LLM came from the provider");
      assert.equal(source.relevance, raw.rerank_score); assert.equal(source.authority, raw.authority); assert.equal(source.publishedAt, raw.date);
      assert.ok(raw.snippet.startsWith(source.snippet) && raw.summary.startsWith(source.summary) && raw.content.startsWith(source.content), "Source text must not be rewritten by the engineering layer");
      assert.equal(source.truncated, source.content.length < raw.content.length);
    }
  }
  for (const event of publicResponses.filter(e => e.status === 200 && e.path.endsWith("/fetch"))) {
    const request = transport.find(e => e.id === event.id && e.phase === "request")!;
    const observation = observations.find(o => o?.ok && o.result?.href === request.body.url && typeof o.result?.fetched_at === "string")?.result;
    assert.ok(observation);
    assert.equal(observation.content, String(event.body.content).slice(0, 40000));
    assert.equal(observation.truncated, String(event.body.content).length > 40000);
  }
  for (const id of context.candidate_ids || []) {
    const observation = observations.find(o => o?.ok && (o.result?.person as {id?: string})?.id === id)?.result;
    if (observation) {
      const [person] = await rows<{note: string; profile: unknown}>(sql`SELECT note,profile FROM hirelix_agent_people WHERE user_id=${evidence.owner}::uuid AND id=${id}::uuid`);
      const actual = observation.person as {note: string; profile: unknown};
      assert.equal(actual.note, person.note); assert.deepEqual(actual.profile, person.profile);
    }
  }
  for (const id of context.role_ids || []) {
    const observation = observations.find(o => o?.ok && (o.result?.role as {id?: string})?.id === id)?.result;
    if (observation) {
      const [role] = await rows<{jd_text: string}>(sql`SELECT jd_text FROM hirelix_private_roles WHERE user_id=${evidence.owner}::uuid AND id=${id}::uuid`);
      assert.equal((observation.role as {jd_text: string}).jd_text, role.jd_text);
    }
  }
  for (const id of context.file_ids || []) {
    const observation = observations.find(o => o?.ok && o.result?.file_id === id && typeof o.result?.text === "string")?.result;
    if (observation) {
      const file = await readWorkspaceFile(evidence.owner, id);
      if (file.name.endsWith(".txt")) {
        assert.equal(observation.text, file.bytes.toString("utf8").slice(0, 100000));
        assert.equal(observation.truncated, file.bytes.toString("utf8").length > 100000);
      }
    }
  }
  const publicRequests = transport.filter(e => e.job_id === evidence.job_id && e.phase === "request" && e.path.startsWith("/v1/tools/"));
  for (const id of context.candidate_ids || []) {
    const [person] = await rows<{name: string; note: string}>(sql`SELECT name,note FROM hirelix_agent_people WHERE user_id=${evidence.owner}::uuid AND id=${id}::uuid`);
    assert.ok(publicRequests.every(e => !containsText(e.body, person.name) && (!person.note || !containsText(e.body, person.note))), "Private candidate names and notes must not be sent to the public retrieval API");
  }
  for (const receipt of Object.values(evidence.job.result?.tool_receipts || {}) as Array<{output: {record?: {id: string; content: string; person_id: string | null}}}>) {
    if (receipt.output.record) {
      const [saved] = await rows<{id: string; content: string; person_id: string | null}>(sql`SELECT id,content,person_id FROM hirelix_private_records WHERE user_id=${evidence.owner}::uuid AND id=${receipt.output.record.id}::uuid`);
      assert.ok(saved, "A committed record receipt must point to owned persisted data");
      assert.equal(saved.content, receipt.output.record.content); assert.equal(saved.person_id, receipt.output.record.person_id);
    }
  }
  const steps = (evidence.job.result?.agent_steps || []) as Array<{results: Array<{tool: string; ok: unknown}>}>;
  assert.ok(steps.every(step => step.results.every(r => typeof r.ok === "boolean")), "Every executed tool has an explicit outcome");
  const parts = (evidence.reply as {metadata: {parts?: Array<{type: string; status?: string}>}}).metadata.parts || [];
  assert.ok(parts.filter(p => p.type === "tool").every(p => ["done", "error"].includes(p.status || "")), "Terminal progress must not retain running tool cards");
  const ledger = (evidence.cost as Array<{pricing_snapshot: Array<{stage: string; requests?: number; cost_usd: number}>}>)[0];
  const billedRetrieval = ledger.pricing_snapshot.filter(s => s.stage.startsWith("private_web_"));
  const validResponses = publicResponses.filter(event => event.status === 200 && (event.path.endsWith("/search") ? (event.body.results as unknown[]).length > 0 : !!String(event.body.content).trim()));
  assert.equal(billedRetrieval.reduce((sum, s) => sum + (s.requests || 0), 0), validResponses.length, "Retrieval request charges match actual valid provider responses");
  await writeFile(`${evidenceDirectory}/${evidence.name}-engineering.json`, JSON.stringify({model_request_count: modelRequests.length, public_responses: publicResponses.map(e => ({path: e.path, status: e.status})), billed_requests: validResponses.length, selected_ids: [...context.role_ids || [], ...context.candidate_ids || [], ...context.file_ids || []]}, null, 2));
}
function containsText(value: unknown, text: string): boolean {
  if (typeof value === "string") {
    if (value.includes(text)) return true;
    try { const decoded = JSON.parse(value); if (decoded && typeof decoded === "object") return containsText(decoded, text); } catch {}
    return false;
  }
  if (Array.isArray(value)) return value.some(item => containsText(item, text));
  if (value && typeof value === "object") return Object.values(value).some(item => containsText(item, text));
  return false;
}


test("ordinary recruiter request: save a call note with replay-safe submission", {timeout: 330000}, async () => {
  const owner = randomUUID();
  const person = await createPerson(owner, {name: "Fictional Rowan Call", headline: "Product lead"});
  const message = "Please save this call note for Rowan: we spoke today; they can start in six weeks, want GBP 110000–120000 base, and can work in Bristol on Tuesdays.";
  const result = await turn("save-call-note", owner, message, {candidate_ids: [person.id]});
  const records = await rows<{id: string; person_id: string; content: string}>(sql`SELECT id,person_id,content FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid`);
  const recordReceipts = Object.values(result.evidence.job.result?.tool_receipts || {}) as Array<{name: string; output: {record?: {id: string}}}>;
  assert.equal(records.length, new Set(recordReceipts.flatMap(r => r.output.record ? [r.output.record.id] : [])).size, "Persisted records match the writes actually committed by the model; tool choice is not prescribed");
  const savedJob = result.evidence.job;
  await assert.rejects(() => sendMessage(owner, {...savedJob.payload.request as object, message: `${message} Changed payload.`}), /already used/, "A reused key with different content must be rejected");
  const replay = await sendMessage(owner, savedJob.payload.request);
  assert.equal(replay.job.id, savedJob.id, "Replaying the same submitted request must not create another job");
  assert.deepEqual(await rows(sql`SELECT id,person_id,content FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid`), records);
  await assert.rejects(() => conversationDetails(randomUUID(), result.evidence.conversation_id), "A different user cannot read the conversation");
});

test("ordinary recruiter request: interrupt real work and continue with the latest instruction", {timeout: 390000}, async () => {
  const owner = randomUUID();
  const message = "I'm meeting the founder of Stord about hiring a sales leader. Help me prepare for that call.";
  const sent = await sendMessage(owner, {message, request_key: randomUUID(), locale: "en"});
  let active: Job | undefined;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    [active] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${sent.job.id}::uuid`);
    const files = await readdir(`${evidenceDirectory}/transport`);
    const requests = await Promise.all(files.map(async name => JSON.parse(await readFile(`${evidenceDirectory}/transport/${name}`, "utf8"))));
    if (active?.status === "running" && requests.some(e => e.phase === "request" && e.path.endsWith("/chat/completions") && Array.isArray(e.body.tools) && containsText(e.body.messages, message) && requests.some(connected => connected.id === e.id && connected.phase === "connected" && connected.status === 200))) break;
    if (active?.status === "done" || active?.status === "error") break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(active?.status, "running", "The cancellation must interrupt a real model execution");
  await cancelJob(owner, sent.job.id);
  const next = await turn("after-interruption", owner, "Change of plan: leave the company research. Just tell me which files I've attached in this conversation.", {conversation_id: sent.conversation_id, delivery: "immediate"});
  const [stopped] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${sent.job.id}::uuid`);
  assert.equal(stopped.status, "cancelled", "Old execution must remain cancelled after the newer turn completes");
  assert.equal(next.writes.length, 0);
  await writeFile(`${evidenceDirectory}/interruption.json`, JSON.stringify({interrupted_job: stopped, next_job_id: next.evidence.job_id}, null, 2));
});


test("ordinary recruiter request: attached JD and file ownership reach the model intact", {timeout: 330000}, async () => {
  const owner = randomUUID();
  const text = "Client brief: Fictional Meridian Tools. Platform Engineering Lead, London. Lead five engineers; Kubernetes operations and PostgreSQL are required. Salary has not been supplied. Client allows two remote days weekly.";
  const file = await uploadConversationFile(owner, {name: "client-jd.txt", type: "text/plain", bytes: Buffer.from(text)});
  const same = await uploadConversationFile(owner, {name: "client-jd.txt", type: "text/plain", bytes: Buffer.from(text)});
  assert.equal(same.id, file.id, "An upload replay must retain the same owned source");
  assert.equal((await readWorkspaceFile(owner, file.id)).bytes.toString("utf8"), text);
  await assert.rejects(() => readWorkspaceFile(randomUUID(), file.id), "Another user cannot read the uploaded file");
  await assert.rejects(() => sendMessage(randomUUID(), {message: "Help me understand this JD", request_key: randomUUID(), file_ids: [file.id]}), "Cannot attach another user's file");
  const result = await turn("attached-jd", owner, "客户发来的 JD 在附件里，帮我理解一下重点。", {file_ids: [file.id], locale: "zh"});
  assert.equal(result.writes.length, 0);
});

test("read back engineering evidence without rating model conclusions", async () => {
  for (const name of ["founder-call", "founder-follow-up", "client-website", "linkedin-jd", "existing-candidates", "save-call-note", "after-interruption", "attached-jd"]) {
    const evidence = JSON.parse(await readFile(`${evidenceDirectory}/${name}.json`, "utf8")) as Evidence;
    const request = evidence.job.payload.request as {role_ids?: string[]; candidate_ids?: string[]; file_ids?: string[]};
    await verifyEngineering(evidence, request);
  }
});
