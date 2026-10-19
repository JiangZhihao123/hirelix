import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { getGlobalDispatcher } from "undici";
import { closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { sendMessage, assistantReply, conversationDetails } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { rows, owned, enqueue } from "../../src/lib/workspace/database";
import { createPerson } from "../../src/lib/workspace/people";
import { createRole, linkPerson } from "../../src/lib/workspace/roles";
import { workspaceHandlers } from "../../src/lib/workspace/worker";
import { closeTurnChannel } from "../../src/lib/workspace/turn-channel";
import { flushPendingLlmUsageEvents } from "../../src/lib/search/persistence";
import { agentModel, agentProviderOptions } from "../../src/lib/workspace/agent-model";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Role, SourceRecord } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
after(async () => { await closeTurnChannel(); await getGlobalDispatcher().close(); await flushPendingLlmUsageEvents(); await closeDb(); });

test("real models and PG: changed client requirements replace superseded constraints and drive fresh matching", { timeout: 480000 }, async () => {
  const owner = randomUUID();
  const jd = "Fictional Cobalt Revision QA — Head of Customer Success. Enterprise B2B SaaS; owned customer renewals; directly managed at least four CSMs. London hybrid three days weekly. Base salary GBP 140000–160000. Reports to CEO.";
  const role = await createRole(owner, { title: "Head of Customer Success", client_name: "Fictional Cobalt Revision QA", jd_text: jd, brief: { priorities: ["Enterprise B2B SaaS", "Owned customer renewals", "Directly managed at least four CSMs", "London hybrid three days weekly", "Base GBP 140000–160000", "Reports to CEO"], flexible: [], unknowns: ["Client contact email"] } });
  const other = await createRole(owner, { title: "Head of Customer Success", client_name: "Fictional Unrelated QA", jd_text: jd.replace("Cobalt Revision", "Unrelated") });
  await createPerson(owner, { name: "Fictional Morgan North", headline: "CS Director", location: "London", note: "Enterprise B2B SaaS. Owned renewals. Directly managed five CSMs. Can attend London three days per week. Salary expectation unconfirmed." });
  await createPerson(owner, { name: "Fictional Riley Gray", headline: "Senior Customer Success Manager", location: "Leeds", note: "Enterprise B2B SaaS. Owned renewals for 14 customers. Coordinated eight CSMs on a retention project. Direct-report responsibility is unconfirmed. Accepts UK remote only; cannot commute to London. Salary expectation unconfirmed." });
  await createPerson(owner, { name: "Fictional Casey Frost", headline: "Customer Support Manager", location: "Manchester", note: "Consumer ecommerce, manages nine support agents. No enterprise SaaS or renewals experience. UK remote only." });
  const peopleBefore = await rows(sql`SELECT * FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`);
  async function indexAll() {
    for (const item of await rows<{id: string}>(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued'`)) {
      const job = await claimJob(["index"], { id: item.id, userId: owner }); assert(job);
      await finishJob(job, await workspaceHandlers.index!(job, () => heartbeat(job)));
    }
  }
  await indexAll();
  let conversationId: string | undefined;
  async function turn(message: string) {
    const sent = await sendMessage(owner, { message, conversation_id: conversationId, role_ids: [role.id], locale: "en", timezone: "Europe/London", request_key: randomUUID() });
    conversationId = sent.conversation_id;
    const job = await claimJob(["chat"], { id: sent.job.id, userId: owner }); assert(job);
    const timer = setInterval(() => void heartbeat(job), 20000);
    try { await finishJob(job, await assistantReply(job, () => heartbeat(job))); }
    finally { clearInterval(timer); }
    const reply = (await conversationDetails(owner, conversationId)).messages.at(-1)!;
    const [saved] = await rows<{result: {agent_steps: Array<{tools: string[]; results: Array<{ok: boolean}>}>}}>(sql`SELECT result FROM hirelix_private_jobs WHERE id=${job.id}::uuid`);
    const current = await owned<Role>(owner, "role", role.id);
    assert.equal(current.jd_text, jd, "client feedback must not overwrite the original JD");
    assert.deepEqual(await owned<Role>(owner, "role", other.id), other, "do not update a similarly named role");
    assert.deepEqual(await rows(sql`SELECT * FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`), peopleBefore, "role changes do not rewrite candidate facts");
    assert.equal((await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`)).length, 2);
    assert.equal(reply.metadata.question, undefined, "do not ask again for a delegated update or optional facts");
    const feedback = await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND kind='feedback' AND details->>'source_message_id'=${String(job.payload.message_id)}`);
    assert.equal(feedback.length, 1, "one source message creates one scoped feedback event");
    // ReAct can recover from a rejected write. Judge completion from the saved
    // evidence, versions and assessments below, not a prescribed error-free path.
    assert.ok(saved.result.agent_steps.some(step => step.tools.includes("update_role")));
    const assessments = await rows<{name: string; decision: string; assessed_role_version: number}>(sql`SELECT p.name, rc.assessment->>'decision' AS decision, rc.assessed_role_version FROM hirelix_private_role_candidates rc JOIN hirelix_agent_people p ON p.id=rc.person_id WHERE rc.user_id=${owner}::uuid AND rc.role_id=${role.id}::uuid`);
    assert.equal(assessments.length, 3, "all existing candidates must be reconsidered");
    assert.ok(assessments.every(item => item.assessed_role_version === current.version), "assessments must refer to the revised role, not the old version");
    console.log(JSON.stringify({conversationId, job: job.id, request: message, reply: reply.content, brief: current.brief, feedback: feedback[0].content, steps: saved.result.agent_steps}));
    return { current, reply, assessments };
  }
  const tightened = await turn("Client update for this role: increase the minimum from four to six direct-report CSMs, change the base budget to GBP 170000–190000, and reduce London attendance from three days to one day a week. Everything else stays the same. Update the role and rematch my existing candidates. Keep the role-specific assessments current as I bring further client corrections in this conversation.");
  assert.match(tightened.current.brief.priorities.join(" "), /six|6/i);
  assert.match(tightened.current.brief.priorities.join(" "), /170[,.]?000/);
  assert.doesNotMatch(tightened.current.brief.priorities.join(" "), /140[,.]?000|three days|four CSM/i);
  assert.ok(tightened.assessments.every(item => item.decision !== "worth_discussing"), "no candidate has evidence of the raised mandatory threshold");
  await indexAll();
  const relaxed = await turn("The client has now accepted past project coordination of at least eight CSMs instead of requiring six direct reports. No direct-report minimum remains. Cancel London attendance entirely: UK remote is fine. Keep the SaaS, renewals, budget and CEO reporting requirements unchanged. Please continue with the revised brief.");
  const revised = relaxed.current.brief.priorities.join(" ");
  assert.match(revised, /eight|8/i);
  assert.match(revised, /remote/i);
  assert.match(revised, /170[,.]?000/);
  assert.doesNotMatch(revised, /140[,.]?000/i);
  // A brief can explicitly say an old restriction was removed. The decisions
  // below prove the old reporting/attendance conditions no longer exclude a
  // remote-only candidate whose evidence is project coordination, not reports.
  assert.match(relaxed.reply.content, /Riley/);
  assert.equal(relaxed.assessments.find(item => item.name.includes("Riley"))?.decision, "worth_discussing");
  assert.equal(relaxed.assessments.find(item => item.name.includes("Morgan"))?.decision, "needs_more_information");
  await indexAll();
  const corrected = await turn("Correction: base budget GBP 160000–180000. I misstated the range. Everything else stays as just agreed.");
  assert.match(corrected.current.brief.priorities.join(" "), /160[,.]?000/);
  assert.match(corrected.current.brief.priorities.join(" "), /180[,.]?000/);
  assert.doesNotMatch(corrected.current.brief.priorities.join(" "), /170[,.]?000|190[,.]?000/);
  assert.match(corrected.current.brief.priorities.join(" "), /eight|8/i);
  assert.match(corrected.current.brief.priorities.join(" "), /remote/i);
  assert.match(corrected.reply.content, /Riley/);
  assert.equal(corrected.assessments.find(item => item.name.includes("Riley"))?.decision, "worth_discussing");
  assert.equal(corrected.assessments.find(item => item.name.includes("Morgan"))?.decision, "needs_more_information");
  assert.equal(corrected.current.version, role.version + 3);
});

test("real models and PG: an additional mandatory qualification changes an otherwise relevant candidate's assessment", { timeout: 180000 }, async () => {
  const owner = randomUUID();
  const jd = "Finance Director for Fictional Maple QA. Own consolidated monthly close and manage at least three finance staff. UK remote. Base GBP 120000–140000.";
  const role = await createRole(owner, { title: "Finance Director", client_name: "Fictional Maple QA", jd_text: jd, brief: { priorities: ["Owned consolidated monthly close", "Managed at least three finance staff", "UK remote", "Base GBP 120000–140000"], flexible: [], unknowns: [] } });
  const person = await createPerson(owner, { name: "Fictional Dana Brooks", headline: "Financial Controller", location: "Bristol", note: "Owns consolidated monthly close and manages four finance staff. UK remote accepted. Base expectation GBP 130000. ERP implementation experience is not documented." });
  for (const item of await rows<{id: string}>(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index' AND status='queued'`)) {
    const job = await claimJob(["index"], { id: item.id, userId: owner }); assert(job);
    await finishJob(job, await workspaceHandlers.index!(job, () => heartbeat(job)));
  }
  const sent = await sendMessage(owner, { message: "The client has added a new must-have: personally led an end-to-end ERP implementation. All existing requirements remain. Add this requirement to the role, rematch my existing candidates and save the current assessments. Do not assume ERP experience just from a finance title.", role_ids: [role.id], locale: "en", request_key: randomUUID() });
  const job = await claimJob(["chat"], { id: sent.job.id, userId: owner }); assert(job);
  const timer = setInterval(() => void heartbeat(job), 20000);
  try { await finishJob(job, await assistantReply(job, () => heartbeat(job))); }
  finally { clearInterval(timer); }
  const current = await owned<Role>(owner, "role", role.id);
  assert.equal(current.jd_text, jd);
  assert.equal(current.version, role.version + 1);
  assert.match(current.brief.priorities.join(" "), /ERP/);
  assert.match(current.brief.priorities.join(" "), /monthly close/i);
  assert.match(current.brief.priorities.join(" "), /three|3/i);
  const [assessment] = await rows<{decision: string; assessed_role_version: number}>(sql`SELECT assessment->>'decision' AS decision, assessed_role_version FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`);
  assert.equal(assessment?.decision, "needs_more_information", "a job title does not prove the added mandatory experience");
  assert.equal(assessment.assessed_role_version, current.version);
  const details = await conversationDetails(owner, sent.conversation_id);
  const reply = details.messages.at(-1)!;
  assert.equal(reply.metadata.question, undefined);
  console.log(JSON.stringify({conversationId: sent.conversation_id, job: job.id, reply: reply.content, brief: current.brief, assessment}));
});

test("real assessment model and PG: the same evidence respects conjunctions versus explicit alternatives in another profession", { timeout: 180000 }, async () => {
  const owner = randomUUID();
  const person = await createPerson(owner, { name: "Fictional Avery Stone", headline: "Quality Lead", profile: { summary: "Personally led supplier audits for medical-device manufacturers. Participated in process validation projects; individual responsibility for leading a complete validation is not documented." } });
  const jd = "Quality Lead: personally led supplier audits AND personally led a complete process validation for medical-device manufacturing.";
  for (const variant of [
    { requirement: "Personally led supplier audits AND personally led a complete process validation for medical-device manufacturing", expected: "needs_more_information" },
    { requirement: "Either personally led supplier audits OR personally led a complete process validation for medical-device manufacturing; either is sufficient", expected: "worth_discussing" },
  ]) {
    const role = await createRole(owner, { title: "Quality Lead", client_name: "Fictional Evidence Logic QA", jd_text: jd, brief: { priorities: [variant.requirement], flexible: [], unknowns: [] } });
    await linkPerson(owner, role.id, person.id);
    const queued = await enqueue(owner, "assessment", randomUUID(), { role_id: role.id, person_id: person.id, locale: "en" });
    const job = await claimJob(["assessment"], { id: queued.id, userId: owner }); assert(job);
    await finishJob(job, await workspaceHandlers.assessment!(job, () => heartbeat(job)));
    const [saved] = await rows<{ assessment: { decision: string; summary: string }; assessed_role_version: number }>(sql`SELECT assessment,assessed_role_version FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`);
    assert.equal(saved.assessment.decision, variant.expected, JSON.stringify(saved.assessment));
    assert.equal(saved.assessed_role_version, role.version);
    assert.deepEqual(await owned(owner, "person", person.id), person, "changing role logic cannot change the person's evidence");
    console.log(JSON.stringify({ job: job.id, requirement: variant.requirement, assessment: saved.assessment }));
  }
});

test("real model: format repair usage cannot overwrite a reply credit reservation", { timeout: 120000 }, async () => {
  const owner = randomUUID();
  const sent = await sendMessage(owner, { message: "Fictional local format repair verification", request_key: randomUUID() });
  const job = await claimJob(["chat"], { id: sent.job.id, userId: owner }); assert(job);
  const before = await rows(sql`SELECT reserved_units,consumed_units FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
  assert.equal(before.length, 1);
  const answer = await generateText({ model: agentModel(job, "tool_input_repair"), providerOptions: agentProviderOptions(), maxOutputTokens: 1024, output: Output.object({schema: z.object({input: z.string()})}), system: "Fix only the missing closing brace in the supplied JSON and return it as input. Keep facts unchanged.", prompt: '{"source":"fictional","count":3' });
  assert.deepEqual(JSON.parse(answer.output.input), {source: "fictional", count: 3});
  const after = await rows(sql`SELECT reserved_units,consumed_units FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid`);
  assert.deepEqual(after, before, "repair costs must not consume or collapse the active reply reservation");
  await flushPendingLlmUsageEvents();
  const events = await rows(sql`SELECT id FROM hirelix_llm_usage_events WHERE job_id=${job.id}::uuid AND stage='private_agent_tool_input_repair' AND status='success'`);
  assert.equal(events.length, 1, "provider usage must still be recorded");
  await finishJob(job, {result: {repair_usage_verified: true}});
});
