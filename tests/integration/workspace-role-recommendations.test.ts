import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { createRole, linkPerson } from "../../src/lib/workspace/roles";
import { createPerson } from "../../src/lib/workspace/people";
import { addRecord } from "../../src/lib/workspace/records";
import {
  markSubmitted,
  updateDeliverable,
} from "../../src/lib/workspace/deliverables";
import {
  publishDocument,
  activeDocumentShare,
} from "../../src/lib/workspace/document-sharing";
import { reserveEmailDelivery } from "../../src/lib/workspace/gmail";
import { recommendations } from "../../src/lib/workspace/recommendations";
import { json, rows, uuidArray } from "../../src/lib/workspace/database";
import type { Deliverable } from "../../src/lib/workspace/types";
const database = new URL(
  process.env.DATABASE_URL || "postgres://invalid/invalid",
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(database.hostname) &&
    database.pathname.startsWith("/hirelix_workspace_qa_"),
);
const owner = randomUUID();
after(async () => {
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`,
  );
  await closeDb();
});
async function fixture() {
  const role = await createRole(owner, {
    title: "QA Role recommendations",
    client_name: "QA client",
    jd_text: "Leadership",
  });
  const people = await Promise.all([
    createPerson(owner, { name: "QA Alice" }),
    createPerson(owner, { name: "QA Ben" }),
  ]);
  for (const p of people) await linkPerson(owner, role.id, p.id);
  const [doc] = await rows<Deliverable>(
    sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,person_ids,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','QA recommendation','Original copy',${uuidArray(people.map((p) => p.id))},${json({ audience: "client", language: "en", people: people.map((p) => ({ id: p.id, name: p.name })), files: [], role: { title: role.title, client_name: role.client_name } })}) RETURNING *`,
  );
  return { role, people, doc };
}
test("real PG: role overview counts actual people, external retries dedupe, feedback stays person and role scoped", async () => {
  const { role, people, doc } = await fixture();
  await publishDocument(owner, doc.id, doc.version);
  let view = (await recommendations(owner, role.id)).roles[0];
  assert.equal(view.recommended_count, 0);
  assert.equal(view.events[0].status, "published");
  const request = {
    expected_version: doc.version,
    submitted_at: new Date().toISOString(),
    submission_note: "Shared with HR",
    recipient: "QA HR",
    channel: "email",
    request_key: randomUUID(),
  };
  const results = await Promise.all(
    Array.from({ length: 5 }, () => markSubmitted(owner, doc.id, request)),
  );
  assert.ok(results.every((r) => r.version === results[0].version));
  await assert.rejects(
    () => markSubmitted(owner, doc.id, { ...request, recipient: "Another HR" }),
    /another record/,
  );
  await markSubmitted(owner, doc.id, {
    ...request,
    expected_version: results[0].version,
    recipient: "Hiring manager",
    request_key: randomUUID(),
  });
  await addRecord(owner, {
    role_id: role.id,
    person_id: people[0].id,
    kind: "feedback",
    title: "Interview interest",
    content: "HR asks for interview",
    details: { response: "interview" },
  });
  await addRecord(owner, {
    role_id: role.id,
    person_id: people[1].id,
    kind: "feedback",
    title: "Hold",
    content: "Wait for budget",
    details: { response: "hold" },
  });
  view = (await recommendations(owner, role.id)).roles[0];
  assert.equal(view.recommended_count, 2);
  assert.equal(view.events.filter((e) => e.status === "recorded").length, 2);
  assert.deepEqual(
    new Set(view.feedback.map((f) => f.person_id)),
    new Set(people.map((p) => p.id)),
  );
  assert.equal(
    view.events.find((e) => e.status === "recorded")?.snapshot.content,
    "Original copy",
  );
  assert.equal((await activeDocumentShare(owner, doc.id))?.current_copy, true);
  assert.equal((await recommendations(randomUUID())).roles.length, 0);
  await assert.rejects(
    () => recommendations(randomUUID(), role.id),
    /not found/,
  );
  await assert.rejects(
    () => markSubmitted(randomUUID(), doc.id, request),
    /not found/,
  );
});
test("real PG: recording an older shared copy preserves that copy and leaves the changed draft editable", async () => {
  const { role, doc } = await fixture();
  const share = await publishDocument(owner, doc.id, doc.version);
  const draft = await updateDeliverable(owner, doc.id, {
    title: doc.title,
    content: "A newer draft",
    expected_version: doc.version,
  });
  assert.equal((await activeDocumentShare(owner, doc.id))?.current_copy, false);
  const saved = await markSubmitted(owner, doc.id, {
    expected_version: draft.version,
    submitted_at: new Date().toISOString(),
    submission_note: "Forwarded previous link",
    recipient: "QA HR",
    channel: "link",
    share_id: share.id,
    request_key: randomUUID(),
  });
  assert.equal(saved.status, "draft");
  assert.equal(saved.content, "A newer draft");
  const delivery = (await recommendations(owner, role.id)).roles[0].events.find(
    (e) => e.status === "recorded",
  )!;
  assert.equal(delivery.version, doc.version);
  assert.equal(delivery.snapshot.content, "Original copy");
  await assert.rejects(
    () =>
      markSubmitted(owner, doc.id, {
        expected_version: draft.version,
        submitted_at: new Date().toISOString(),
        submission_note: "Wrong share",
        channel: "link",
        share_id: randomUUID(),
        request_key: randomUUID(),
      }),
    /not found/,
  );
});
test("real PG: Gmail link and text use one snapshot; only sent receipts count and legacy markers do not double count", async () => {
  const { role, doc } = await fixture();
  const share = await publishDocument(owner, doc.id, doc.version);
  const input = {
    expected_version: doc.version,
    to: "qa@example.test",
    request_key: randomUUID(),
    share_id: share.id,
  };
  const reserved = await Promise.all(
    Array.from({ length: 6 }, () =>
      reserveEmailDelivery(
        owner,
        doc.id,
        input,
        "sender@example.test",
        "<qa@test>",
        "http://localhost:3000",
      ),
    ),
  );
  assert.equal(reserved.filter((r) => r.send).length, 1);
  const email = reserved[0].receipt;
  assert.match(String(email.snapshot.content), /Original copy/);
  assert.ok(String(email.snapshot.content).includes(share.path));
  assert.equal(
    (await recommendations(owner, role.id)).roles[0].recommended_count,
    0,
  );
  await db.execute(
    sql`UPDATE hirelix_private_email_deliveries SET status='failed' WHERE id=${email.id}::uuid`,
  );
  assert.equal(
    (await recommendations(owner, role.id)).roles[0].recommended_count,
    0,
  );
  // Simulate receipt states only, without contacting Gmail; this does not prove real sending.
  await db.execute(
    sql`UPDATE hirelix_private_email_deliveries SET status='sent' WHERE id=${email.id}::uuid`,
  );
  await markSubmitted(owner, doc.id, {
    expected_version: doc.version,
    submitted_at: new Date().toISOString(),
    submission_note: "Legacy Gmail marker",
  });
  const view = (await recommendations(owner, role.id)).roles[0];
  assert.equal(view.recommended_count, 2);
  assert.equal(
    view.events.filter((e) => ["sent", "recorded"].includes(e.status)).length,
    1,
  );
  assert.equal(
    view.events.find((e) => e.status === "sent")?.snapshot.content,
    email.snapshot.content,
  );
});
