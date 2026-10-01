import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createRole } from "../../src/lib/workspace/roles";
import { addRecord } from "../../src/lib/workspace/records";
import { generateDeliverable, prepareDeliverable } from "../../src/lib/workspace/deliverables";
import { owned } from "../../src/lib/workspace/database";
import type { Deliverable } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_") ||
  process.env.WORKSPACE_REAL_AI_TEST !== "true")
  throw new Error("Use an isolated local QA database and real AI");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real search update distinguishes missing activity evidence and uses the reviewed brief over the original JD", { timeout: 180000 }, async () => {
  const role = await createRole(owner, {
    title: "QA VP Product",
    client_name: "QA Northstar",
    jd_text: "Lead product teams. Compensation has not been confirmed in this original JD.",
    brief: {
      priorities: ["Lead 12 product managers in enterprise B2B SaaS", "Client-confirmed compensation GBP 160,000–180,000", "Two office days each week in London, already confirmed and saved"],
      flexible: [],
      unknowns: ["Candidate availability and sharing permission"],
    },
  });
  const feedback = await addRecord(owner, {
    role_id: role.id, kind: "feedback", title: "Fictional QA compensation feedback",
    content: "Client confirmed GBP 160,000–180,000 compensation and two office days each week in London.",
    occurred_at: "2026-10-01T09:20:00+08:00",
  });
  const input = {
    kind: "search_update", role_id: role.id, person_ids: [], record_ids: [],
    period_start: "2026-09-30T00:00:00+08:00", period_end: "2026-10-01T23:59:00+08:00",
    period_local_start: "2026-09-30", period_local_end: "2026-10-01", language: "en",
    instructions: "Concise factual update. This is a fictional QA exercise.",
  };
  async function draft(recordIds: string[]) {
    const job = await prepareDeliverable(owner, { ...input, record_ids: recordIds, request_key: randomUUID() });
    const prepared = await generateDeliverable(job, async () => {});
    const result = await db.transaction(async (tx) => prepared.apply?.(tx));
    assert(result?.deliverable_id);
    return owned<Deliverable>(owner, "deliverable", String(result.deliverable_id));
  }
  const withoutActivity = await draft([]);
  assert.match(withoutActivity.content, /no .*activity.*recorded|no .*dated.*records/i);
  assert.doesNotMatch(withoutActivity.content, /(?:^|\n)(?:Activity:\s*)?No [^\n.]*(?:took place|occurred)|compensation[^\n.]*?(?:unconfirmed|not confirmed|needs to be confirmed)/i);
  assert.match(withoutActivity.content, /160,000/);
  const withActivity = await draft([feedback.id]);
  assert.match(withActivity.content, /160,000/);
  assert.match(withActivity.content, /confirm/i);
  assert.doesNotMatch(withActivity.content, /no .*feedback.*(?:recorded|occurred|took place)/i);
  assert.doesNotMatch(withActivity.content, /no candidates? (?:has|have|was|were|had).{0,35}(?:approach|contact|submit)|no (?:outreach|interviews?|submissions?) (?:has|have|was|were|had|occurred|took place)/i);
  assert.doesNotMatch(withActivity.content, /(?:update|amend|revise|reflect).{0,35}(?:role brief|requirements).{0,80}(?:office|London)/i);
  assert.deepEqual(withActivity.record_ids, [feedback.id]);
  assert.deepEqual(withoutActivity.record_ids, []);
});
