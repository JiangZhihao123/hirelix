import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createRole } from "../../src/lib/workspace/roles";
import { sendMessage, assistantReply, conversationDetails } from "../../src/lib/workspace/conversations";
import { claimJob, heartbeat, finishJob, failJob } from "../../src/lib/workspace/jobs";
import { rows } from "../../src/lib/workspace/database";
import type { SourceRecord } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
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
  }
  const saved = await rows<{ id: string; jd_text: string }>(sql`SELECT id,jd_text FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
  assert.equal(saved.find(r => r.id === first.id)!.jd_text, firstJd);
  assert.equal(saved.find(r => r.id === second.id)!.jd_text, secondJd);
});
