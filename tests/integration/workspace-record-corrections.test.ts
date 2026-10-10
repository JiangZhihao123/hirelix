import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createPerson } from "../../src/lib/workspace/people";
import { updateRecord } from "../../src/lib/workspace/records";
import { sendMessage, assistantReply, conversationDetails, type AssistantMeta } from "../../src/lib/workspace/conversations";
import { applyAssistantAction, acceptAction } from "../../src/lib/workspace/conversation-actions";
import { claimJob, heartbeat, finishJob, failJob } from "../../src/lib/workspace/jobs";
import { rows } from "../../src/lib/workspace/database";
import type { SourceRecord } from "../../src/lib/workspace/types";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});
async function chat(message: string, conversation_id?: string, sentAt?: string) {
  const sent = await sendMessage(owner, {message, conversation_id, request_key: randomUUID(), locale: "en", timezone: "Asia/Shanghai"});
  if (sentAt) await db.execute(sql`UPDATE hirelix_agent_messages SET created_at=${sentAt}::timestamptz WHERE id=${String(sent.job.payload.message_id)}::uuid AND user_id=${owner}::uuid`);
  const job = await claimJob(["chat"]);
  assert(job); assert.equal(job.id, sent.job.id);
  const timer = setInterval(() => void heartbeat(job), 20000);
  try { await finishJob(job, await assistantReply(job, message => heartbeat(job, message))); }
  catch (error) { await failJob(job, "Record correction QA failed"); throw error; }
  finally { clearInterval(timer); }
  const result = await conversationDetails(owner, sent.conversation_id);
  console.log(JSON.stringify({request: message, answer: result.messages.at(-1)!.content, metadata: result.messages.at(-1)!.metadata}));
  return result;
}
async function records() { return rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${owner}::uuid ORDER BY created_at`); }
test("real model and PG: local-day notes, in-place corrections, cross-chat recall and version fences", {timeout: 360000}, async () => {
  await createPerson(owner, {name: "Quinn Cedar UX1011", headline: "Product Director", location: "Bristol"});
  const first = await chat("Today at 00:01 Asia/Shanghai I spoke with Quinn Cedar UX1011. Three-month notice, GBP 135,000 base expectation, interested in logistics product leadership. No permission to share the CV has been given. Save this call note.", undefined, "2026-10-10T16:05:00Z");
  const [original] = await records(); assert(original);
  assert.equal(new Date(original.occurred_at!).toISOString(), "2026-10-10T16:01:00.000Z", "today must use the local 11 October date, not 10 October UTC");
  const changed = await chat("Correct that call note's time to 11 October 2026 at 00:02 Asia/Shanghai. Keep all other facts unchanged and save the correction.", first.conversation.id);
  const [updated] = await records(); assert.equal((await records()).length, 1, "a correction must not add a second note");
  assert.equal(updated.id, original.id); assert.equal(updated.version, original.version + 1);
  assert.equal(new Date(updated.occurred_at!).toISOString(), "2026-10-10T16:02:00.000Z");
  assert.match(updated.content, /135[,.]?000/); assert.match(updated.content, /three.month|3.month/i);
  assert.equal(updated.person_id, original.person_id); assert.equal(updated.file_id, original.file_id);
  const savedMessage = changed.messages.at(-1)!;
  const saved = (savedMessage.metadata as AssistantMeta).actions!.find(action => action.kind === "update_record")!;
  assert.equal(saved.status, "saved");
  await acceptAction(owner, changed.conversation.id, savedMessage.id, saved.id, {});
  assert.equal((await records())[0].version, updated.version, "acceptance retry must not apply twice");
  const recall = await chat("When was the saved call with Quinn Cedar UX1011, in Asia/Shanghai? What were the notice period and base salary expectation? Read only.");
  assert.match(recall.messages.at(-1)!.content, /00:02/);
  assert.match(recall.messages.at(-1)!.content, /135[,.]?000/);
  assert.equal((await records())[0].version, updated.version);
  const preview = await chat("Preview changing that call note's title to Initial screening call. Do not save until I review it.", first.conversation.id);
  const message = preview.messages.at(-1)!;
  const action = (message.metadata as AssistantMeta).actions!.find(action => action.kind === "update_record")!;
  assert(action, message.content); assert.equal(action.status, "pending");
  await assert.rejects(() => db.transaction(tx => applyAssistantAction(randomUUID(), preview.conversation.id, action, action.fields, tx)), /not found/);
  await updateRecord(owner, updated.id, {...updated, occurred_at: new Date(updated.occurred_at!).toISOString(), title: "Recruiter edited title"}, updated.version);
  await assert.rejects(() => acceptAction(owner, preview.conversation.id, message.id, action.id, action.fields), /changed|version/i);
  assert.equal((await records())[0].title, "Recruiter edited title");
  const latest = (await records())[0];
  await db.transaction(tx => applyAssistantAction(owner, preview.conversation.id, {...action, fields: {...action.fields, expected_version: latest.version}}, action.fields, tx));
  const final = (await records())[0];
  assert.equal(final.title, "Initial screening call");
  assert.equal(new Date(final.occurred_at!).toISOString(), "2026-10-10T16:02:00.000Z", "title-only edits preserve the stored time");
  assert.equal((await records()).length, 1);
  const future = await chat("I completed another call with Quinn Cedar UX1011 today at 23:00 Asia/Shanghai. Save that call note.", undefined, "2026-10-10T16:05:00Z");
  assert.equal((future.messages.at(-1)!.metadata as AssistantMeta).question?.status, "waiting", "a completed call in the future needs clarification");
  assert.equal((await records()).length, 1, "do not silently move a contradictory event to yesterday");
});
