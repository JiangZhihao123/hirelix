import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb } from "../../src/db/client";
import { createRole } from "../../src/lib/workspace/roles";
import {
  rows,
  json,
  owned,
  WorkspaceError,
} from "../../src/lib/workspace/database";
import {
  requestRevision,
  applyRevision,
  generateRevision,
} from "../../src/lib/workspace/revisions";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { updateDeliverable } from "../../src/lib/workspace/deliverables";
import type { Deliverable } from "../../src/lib/workspace/types";
const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_")
)
  throw new Error("Use an isolated local QA database");
after(closeDb);

test("real AI: explicit separate unknowns list overrides the default recommendation email layout", { skip: process.env.WORKSPACE_REAL_AI_TEST !== "true", timeout: 180000 }, async () => {
  initializeGlobalOutboundProxy();
  const owner = randomUUID();
  const personId = randomUUID();
  const role = await createRole(owner, { title: "VP Product", client_name: "Fictional QA", jd_text: "London, Monday and Thursday office attendance. Annual base GBP 155,000–175,000." });
  const [draft] = await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','Fictional QA recommendation','Dear team, QA Rowan Lake led six product managers. Availability, salary expectations, engineering collaboration, Monday/Thursday attendance, interest, and sharing permission are unconfirmed. Kind regards, [Your name]',${json({ audience: "client", language: "en", role: { title: role.title, client_name: role.client_name, brief: { priorities: ["London office on Mondays and Thursdays", "Annual base GBP 155,000–175,000"] } }, people: [{ id: personId, name: "QA Rowan Lake", location: "London", summary: "Led six product managers for enterprise SaaS onboarding.", sharing_permission: "unknown" }], records: [] })}) RETURNING *`);
  const job = await requestRevision(owner, draft.id, { expected_version: draft.version, request_key: randomUUID(), instructions: "Keep this client recommendation under 220 words. Use a short evidence paragraph, then a separate Markdown bullet list of exactly six unconfirmed items: availability, salary expectations, engineering collaboration, Monday/Thursday attendance willingness, interest, and permission to share. Keep six product managers led and the client-confirmed GBP 155,000–175,000. London location does not confirm attendance. Do not send anything." });
  try {
    const proposal = await generateRevision(job, async () => {});
    const content = String(proposal.result.content);
    const bullets = content.split(/\r?\n/).filter(line => /^\s*(?:[-*]|\d+\.)\s+/.test(line));
    assert.equal(bullets.length, 6, content);
    assert.ok(content.trim().split(/\s+/).length < 220, content);
    assert.match(content, /six product managers|6 product managers/i);
    assert.match(content, /155,000[–-]175,000/);
    assert.equal(proposal.result.audience, "client");
    assert.equal((await owned<Deliverable>(owner, "deliverable", draft.id)).version, 1, "generation remains a proposal until reviewed");
  } finally {
    await rows(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE id=${job.id}::uuid AND status='queued'`);
  }
});
const failure = (status: number) => (error: unknown) =>
  error instanceof WorkspaceError && error.status === status;
test("revision proposals preserve draft, fence concurrent edits and apply exactly once", async () => {
  const owner = randomUUID(),
    other = randomUUID();
  const role = await createRole(owner, {
    title: "VP Product",
    client_name: "QA",
    jd_text: "Team leadership",
  });
  const [draft] = await rows<Deliverable>(
    sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','Original','Permission is unknown',${json({ people: [] })}) RETURNING *`,
  );
  const key = randomUUID(),
    input = {
      expected_version: 1,
      instructions: "Make it concise",
      request_key: key,
    };
  const job = await requestRevision(owner, draft.id, input);
  assert.equal((await requestRevision(owner, draft.id, input)).id, job.id);
  await assert.rejects(
    () =>
      requestRevision(owner, draft.id, {
        ...input,
        instructions: "Another request",
      }),
    failure(409),
  );
  assert.equal(
    (await owned<Deliverable>(owner, "deliverable", draft.id)).content,
    draft.content,
  );
  const result = {
    title: "Revised",
    content: "Sharing permission remains unconfirmed.",
    changes: "Shortened wording",
  };
  await rows(
    sql`UPDATE hirelix_private_jobs SET status='done',result=${json(result)} WHERE id=${job.id}::uuid`,
  );
  await assert.rejects(
    () =>
      applyRevision(other, draft.id, { job_id: job.id, expected_version: 1 }),
    failure(404),
  );
  const applied = await applyRevision(owner, draft.id, {
    job_id: job.id,
    expected_version: 1,
  });
  assert.equal(applied.version, 2);
  assert.equal(
    (
      await applyRevision(owner, draft.id, {
        job_id: job.id,
        expected_version: 1,
      })
    ).version,
    2,
  );
  const stale = await requestRevision(owner, draft.id, {
    ...input,
    expected_version: 2,
    request_key: randomUUID(),
  });
  await rows(
    sql`UPDATE hirelix_private_jobs SET status='done',result=${json(result)} WHERE id=${stale.id}::uuid`,
  );
  await updateDeliverable(owner, draft.id, {
    title: "My manual edit",
    content: "Keep my changes",
    expected_version: 2,
  });
  await assert.rejects(
    () =>
      applyRevision(owner, draft.id, { job_id: stale.id, expected_version: 3 }),
    failure(409),
  );
  assert.equal(
    (await owned<Deliverable>(owner, "deliverable", draft.id)).content,
    "Keep my changes",
  );
});
