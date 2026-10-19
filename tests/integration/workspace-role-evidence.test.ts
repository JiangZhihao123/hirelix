import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { sendMessage } from "../../src/lib/workspace/conversations";
import { rows } from "../../src/lib/workspace/database";
import type { Job, Role } from "../../src/lib/workspace/types";

// Run against a local QA database with the independent development worker.
// No in-process handler or simulated model can satisfy this test.
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname)
  && database.port !== "15432"
  && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real worker and model preserve a supplied brief without inventing flexible requirements", { timeout: 180000 }, async () => {
  const jd = "Product Director for Fictional Birch Evidence. Warehouse operations SaaS. Must have shipped warehouse exception workflows and managed at least 4 PMs. Bristol office Tuesdays. Base budget GBP 140000–160000.";
  const sent = await sendMessage(owner, {
    message: `Save this new client role from my brief: ${jd}`,
    locale: "en", timezone: "Asia/Shanghai", request_key: randomUUID(),
  });
  let job: Job | undefined;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    [job] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${sent.job.id}::uuid`);
    if (job && ["done", "error", "cancelled"].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(job?.status, "done", `Independent worker did not finish: ${job?.status}; ${job?.error}`);
  const roles = await rows<Role>(sql`SELECT * FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  assert.equal(roles.length, 1);
  assert.deepEqual(roles[0].brief.flexible, [], "Unspecified conditions must not become client concessions");
  assert.equal(roles[0].jd_text, jd, "Dictated source must be preserved, not expanded into an invented JD");
});

test("real worker recommendation uses the selected role's confirmed interest", { timeout: 180000 }, async () => {
  const { createRole, linkPerson, updateRelationship } = await import("../../src/lib/workspace/roles");
  const { createPerson } = await import("../../src/lib/workspace/people");
  const { prepareDeliverable } = await import("../../src/lib/workspace/deliverables");
  const role = await createRole(owner, {title: "Product Lead", client_name: "Fictional Interest QA", jd_text: "Lead warehouse software products"});
  const person = await createPerson(owner, {name: "Fictional Morgan Evidence", headline: "Product Lead", profile: {summary: "Delivered warehouse exception workflows and managed five PMs."}});
  const link = await linkPerson(owner, role.id, person.id);
  await updateRelationship(owner, role.id, person.id, {...link, interest: "Confirmed interest in this role", expected_version: link.version});
  const queued = await prepareDeliverable(owner, {
    kind: "submission", role_id: role.id, person_ids: [person.id], record_ids: [], file_ids: [],
    language: "en", format: "recommendation", period_start: null, period_end: null, request_key: randomUUID(),
    instructions: "Prepare an internal recruiter review under 150 words. Include the candidate's recorded interest in this role, management experience and direct-report count. Do not send or publish.",
  });
  let job: Job | undefined;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    [job] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${queued.id}::uuid`);
    if (job && ["done", "error", "cancelled"].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(job?.status, "done", `Independent worker did not finish: ${job?.status}; ${job?.error}`);
  const [document] = await rows<{content: string; source_snapshot: {people: Array<{role_interest: string}>}}>(sql`SELECT content,source_snapshot FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid`);
  assert.equal(document.source_snapshot.people[0].role_interest, "Confirmed interest in this role");
  assert.doesNotMatch(document.content, /(?:five|5) direct (?:PMs|reports|product managers)/i);
  assert.match(document.content, /confirm[^\n.]*interest|interest[^\n.]*confirm/i);
  // An unknown sharing permission in the same sentence does not negate interest.
  assert.doesNotMatch(document.content.replace(/\*/g, ""), /interest\s*(?:in (?:this|the) role\s*)?(?:(?:is|was|remains|:)\s*)?(?:unknown|unconfirmed|not confirmed)/i);
});

test("real worker preserves management scope and displays feedback in the request timezone", { timeout: 360000 }, async () => {
  const { createRole, linkPerson } = await import("../../src/lib/workspace/roles");
  const { createPerson } = await import("../../src/lib/workspace/people");
  const { addRecord } = await import("../../src/lib/workspace/records");
  const role = await createRole(owner, {title: "Product Director", client_name: "Fictional Scope QA", jd_text: "Warehouse SaaS; managed at least four PMs."});
  const person = await createPerson(owner, {name: "Robin Scope QA", profile: {summary: "Delivered warehouse exception workflows. Managed five product managers."}});
  await linkPerson(owner, role.id, person.id);
  await addRecord(owner, {person_id: person.id, role_id: role.id, kind: "feedback", title: "Client feedback", content: "Client requested an interview.", occurred_at: "2026-10-17T20:20:32Z", details: {}});
  const { localTimeEvidence } = await import("../../src/lib/workspace/agent-time");
  const saved = await rows(sql`SELECT occurred_at FROM hirelix_private_records WHERE person_id=${person.id}::uuid`);
  assert.equal(localTimeEvidence(saved, "America/New_York")["[0].occurred_at"], "17/10/2026, 16:20:32 GMT-04:00 (America/New_York)");
  for (const timezone of ["Asia/Shanghai", "America/New_York"]) {
    const sent = await sendMessage(owner, {message: `Read candidate ${person.name} (${person.id}) and role ${role.id}. Summarize their management experience, direct-report count, fit to the management requirement, and exactly when the recorded client feedback arrived. Read only.`, locale: "en", timezone, request_key: randomUUID()});
    let job: Job | undefined;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      [job] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${sent.job.id}::uuid`);
      if (job && ["done", "error", "cancelled"].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(job?.status, "done", `${job?.status}: ${job?.error}`);
    const messages = await rows<{content:string}>(sql`SELECT content FROM hirelix_agent_messages WHERE conversation_id=${sent.conversation_id}::uuid AND role='assistant' ORDER BY created_at DESC`);
    const content = messages.map(item => item.content).join("\n");
    console.log(JSON.stringify({timezone, conversation: sent.conversation_id, content}));
    assert.match(content, /direct[\s-]report[^\n]*(?:unconfirmed|not (?:confirmed|documented|specified|established)|unknown)|(?:unconfirmed|unknown)[^\n]*direct[\s-]report/i);
    // Inspect affirmative count claims; a phrase such as "not as five direct
    // reports" is a correct distinction, not an invented reporting relationship.
    assert.doesNotMatch(content.replace(/\*/g, ""), /direct[\s-]reports?(?: count)?\s*[:–—-]\s*(?:five|5)\b|\b(?:has|had|managed|with)\s+(?:five|5) direct (?:PMs|reports|product managers)/i);
    assert.match(content, timezone === "Asia/Shanghai" ? /04:20:32/ : /16:20:32|4:20:32\s*PM/i);
    assert.match(content, timezone === "Asia/Shanghai" ? /Shanghai|UTC\+0?8|GMT\+0?8/ : /New_York|New York|UTC[−-]0?4|GMT[−-]0?4|EDT/);
  }
});
