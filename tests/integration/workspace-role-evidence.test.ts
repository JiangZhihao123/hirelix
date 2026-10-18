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
