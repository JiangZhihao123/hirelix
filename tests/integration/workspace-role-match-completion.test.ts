import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { createPerson } from "../../src/lib/workspace/people";
import { createRole } from "../../src/lib/workspace/roles";
import { indexRole } from "../../src/lib/workspace/role-retrieval";
import { sendMessage, assistantReply, conversationDetails, type AssistantMeta } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat } from "../../src/lib/workspace/jobs";
import { enqueue, rows } from "../../src/lib/workspace/database";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real models and PG: no suitable saved role completes matching without optional questions or writes", { timeout: 180000 }, async () => {
  await createPerson(owner, { name: "Fictional Dana Fox", headline: "Junior videographer", location: "Sheffield", skills: ["camera operation", "video editing"], note: "One year of video production experience. Wants junior photography and video production roles in Sheffield. No product-management leadership experience." });
  const role = await createRole(owner, { title: "VP Product", client_name: "Fictional Atlas Software", jd_text: "London based VP Product. Lead twelve product managers for enterprise SaaS, with at least eight years of product-management leadership. This role has no photography or video-production duties." });
  const indexing = await enqueue(owner, "index", randomUUID(), { role_id: role.id });
  const prepared = await indexRole(indexing, async () => {});
  await db.transaction(async tx => { await prepared.apply?.(tx); });
  const sent = await sendMessage(owner, { message: "Find suitable client roles for Fictional Dana Fox.", locale: "en", request_key: randomUUID() });
  const job = await claimJob(["chat"]);
  assert.equal(job?.id, sent.job.id);
  const timer = setInterval(() => void heartbeat(job!), 20000);
  try { await finishJob(job!, await assistantReply(job!, () => heartbeat(job!))); }
  finally { clearInterval(timer); }
  const message = (await conversationDetails(owner, sent.conversation_id)).messages.at(-1)!;
  const metadata = message.metadata as AssistantMeta;
  assert.equal(message.role, "assistant");
  assert.equal(metadata.question, undefined, JSON.stringify(metadata));
  assert.equal(metadata.actions?.length, 0);
  assert.equal(metadata.work?.length, 0);
  assert.match(message.content, /no suitable|no matching|not .*match|does not .*match|not .*fit|doesn.t .*fit|no .*fit/i);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_roles WHERE user_id=${owner}::uuid`)).length, 1);
  assert.equal((await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`)).length, 1);
});
