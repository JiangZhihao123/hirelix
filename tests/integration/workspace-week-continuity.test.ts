import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createRole } from "../../src/lib/workspace/roles";
import { createPerson } from "../../src/lib/workspace/people";
import { sendMessage, assistantReply, conversationDetails } from "../../src/lib/workspace/conversations";
import { claimJob, heartbeat, finishJob, failJob } from "../../src/lib/workspace/jobs";
import { rows } from "../../src/lib/workspace/database";
import type { SourceRecord } from "../../src/lib/workspace/types";
import { prepareDeliverable } from "../../src/lib/workspace/deliverables";

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real consecutive calls stay separate while a correction updates only the second call", { timeout: 240000 }, async () => {
  const person = await createPerson(owner, {name: "Riley Vale Week", headline: "Product Lead", location: "Bristol"});
  const first = await chat("On Tuesday 6 October 2026 at 10:00 Europe/London I spoke with Riley Vale Week. Expected base GBP 160,000; three months' notice. Current base GBP 145,000 must remain internal and never go into client materials. Save the call note.");
  const notes = () => rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid AND kind='call' ORDER BY occurred_at`);
  const [initial] = await notes(); assert(initial);
  await chat("Spoke to Riley again on Wednesday 7 October 2026 at 11:00 Europe/London. After discussing the scope, Riley would move for GBP 158,000 and does not want to manage more than five PMs. Save this conversation.", first.conversation.id);
  const separate = await notes();
  assert.equal(separate.length, 2, "a later conversation is a new event, not a correction of the first one");
  assert.equal(separate[0].id, initial.id); assert.equal(separate[0].content, initial.content); assert.equal(separate[0].version, initial.version);
  assert.match(separate[1].content, /158[,.]?000/);
  const corrected = await chat("Sorry, Riley said GBP 155,000 in Wednesday's call, not GBP 158,000. Correct that figure; keep everything else.", first.conversation.id);
  const final = await notes(); assert.equal(final.length, 2, corrected.messages.at(-1)!.content);
  assert.equal(final[0].content, initial.content); assert.equal(final[0].version, initial.version);
  assert.equal(final[1].id, separate[1].id); assert.equal(final[1].version, separate[1].version + 1);
  assert.match(final[1].content, /155[,.]?000/); assert.match(final[1].content, /five|5/);
  assert.equal(new Date(final[1].occurred_at!).toISOString(), "2026-10-07T10:00:00.000Z");
});
async function chat(message: string, conversation_id?: string) {
  const sent = await sendMessage(owner, { message, conversation_id, request_key: randomUUID(), locale: "en", timezone: "Europe/London" });
  const job = await claimJob(["chat"]);
  assert(job); assert.equal(job.id, sent.job.id);
  const timer = setInterval(() => void heartbeat(job), 20000);
  try { await finishJob(job, await assistantReply(job, message => heartbeat(job, message))); }
  catch (cause) { await failJob(job, "Weekly continuity regression failed"); throw cause; }
  finally { clearInterval(timer); }
  return conversationDetails(owner, sent.conversation_id);
}

test("real multi-client updates preserve scoped feedback and original JDs", { timeout: 180000 }, async () => {
  const firstJd = "Head of Product. Lead at least three PMs. Bristol office twice weekly. Days and interview process unknown.";
  const secondJd = "Senior Data Engineer. Python, SQL, dbt. UK remote. On-call frequency and interview process unknown.";
  const first = await createRole(owner, { title: "Head of Product", client_name: "Fictional Elm", jd_text: firstJd });
  const second = await createRole(owner, { title: "Senior Data Engineer", client_name: "Fictional Ash", jd_text: secondJd });
  const result = await chat("Client calls on Monday 5 October 2026: Fictional Elm confirmed its Head of Product must attend Bristol on Tuesday and Thursday, with two interview rounds. Fictional Ash confirmed its Senior Data Engineer has one on-call week in four, with three interview rounds. Both clients still need to confirm target start dates. Save each update against its own role, keeping the original JDs.");
  const records = await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid AND kind='feedback'`);
  assert.equal(records.length, 2, result.messages.at(-1)!.content);
  const elm = records.find(r => r.role_id === first.id)!;
  const ash = records.find(r => r.role_id === second.id)!;
  assert.match(elm.content, /Tuesday/); assert.match(elm.content, /Thursday/);
  assert.doesNotMatch(elm.content, /Ash|on.call|three interview/i);
  assert.match(ash.content, /on.call/i); assert.match(ash.content, /three|3/);
  assert.doesNotMatch(ash.content, /Elm|Bristol|Tuesday|Thursday/);
  for (const record of records) {
    assert.match(record.content, /5 October 2026|2026-10-05|October 5,? 2026/);
    assert(record.details.source_message_id, "retain the original shared message as provenance");
    assert.equal(record.occurred_at, null);
    assert.equal(record.details.occurred_on, "2026-10-05");
  }
  const report = await prepareDeliverable(owner, {kind: "search_update", role_id: first.id, person_ids: [], record_ids: [elm.id],
    period_start: "2026-10-04T23:00:00Z", period_end: "2026-10-09T22:59:59Z", report_timezone: "Europe/London", request_key: randomUUID()});
  assert.match(JSON.stringify(report.payload.source), /"date_precision":"day"/);
  const saved = await rows<{ id: string; jd_text: string }>(sql`SELECT id,jd_text FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  assert.equal(saved.find(r => r.id === first.id)!.jd_text, firstJd);
  assert.equal(saved.find(r => r.id === second.id)!.jd_text, secondJd);
});

test("real combined call and permission report retains dated non-permission activity", {timeout: 240000}, async () => {
  const person = await createPerson(owner, {name: "Jordan Moss Week", headline: "Data Engineer"});
  const role = await createRole(owner, {title: "Data Engineer", client_name: "Fictional Birch", jd_text: "UK remote data engineering. One on-call week in eight."});
  await chat("Friday 9 October 2026 at 10:00 Europe/London I spoke with Jordan Moss Week about Fictional Birch's Data Engineer role. Jordan accepts the one-week-in-eight on-call rota, expects GBP 105,000, has one month's notice and UK right to work. Jordan also permits sharing the CV with Birch for this role only. They agreed a future first interview on Tuesday 13 October at 14:00 Europe/London. Save this update and future interview; I handled the communication myself.");
  const records = await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid AND role_id=${role.id}::uuid`);
  const [relation] = await rows<{permission:string;permission_record_id:string}>(sql`SELECT permission,permission_record_id FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid AND role_id=${role.id}::uuid`);
  assert.equal(relation.permission,"confirmed");
  const calls = records.filter(r => r.id !== relation.permission_record_id && r.kind === "call");
  assert(calls.some(r => /105[,.]?000/.test(r.content) && /eight|8/.test(r.content) && new Date(r.occurred_at!).toISOString() === "2026-10-09T09:00:00.000Z"), "non-permission call facts must remain a dated source for the weekly report");
});
