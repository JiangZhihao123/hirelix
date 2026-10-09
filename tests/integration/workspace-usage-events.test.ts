import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { recordLlmUsageEvent, flushPendingLlmUsageEvents } from "../../src/lib/search/persistence";
import { sendMessage } from "../../src/lib/workspace/conversations";
import { rows } from "../../src/lib/workspace/database";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
after(closeDb);

test("real PG: the shared usage writer retains private Agent job IDs", async () => {
  const owner = randomUUID();
  const sent = await sendMessage(owner, { message: "Fictional usage ledger schema QA", request_key: randomUUID() });
  try {
    // Fixture usage tests the database relation only, not a real model call.
    await recordLlmUsageEvent({ jobId: sent.job.id, userId: owner, stage: "qa_ledger_schema", model: "schema-fixture", provider: "qa", status: "success" });
    await flushPendingLlmUsageEvents();
    const events = await rows<{ job_id: string; user_id: string }>(sql`SELECT job_id,user_id FROM hirelix_llm_usage_events WHERE job_id=${sent.job.id}::uuid`);
    assert.equal(events.length, 1);
    assert.equal(events[0].job_id, sent.job.id);
    assert.equal(events[0].user_id, owner);
  } finally {
    await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE id=${sent.job.id}::uuid AND user_id=${owner}::uuid`);
  }
});
