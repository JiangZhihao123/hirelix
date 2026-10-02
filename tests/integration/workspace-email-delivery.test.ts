import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { createRole } from "../../src/lib/workspace/roles";
import { rows, json } from "../../src/lib/workspace/database";
import { updateDeliverable } from "../../src/lib/workspace/deliverables";
import {
  reserveEmailDelivery,
  gmailConnection,
  sendRecommendation,
  sendRecommendationInput,
  emailReceipts,
} from "../../src/lib/workspace/gmail";
import type { Deliverable } from "../../src/lib/workspace/types";
const database = new URL(
  process.env.DATABASE_URL || "postgresql://invalid/invalid",
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(database.hostname) &&
    database.pathname.startsWith("/hirelix_workspace_qa_"),
);
after(closeDb);
// Exercises durable reservation and rejection paths only; does not claim a real Gmail send.
test("real DB: concurrent clicks and uncertain responses cannot reserve a duplicate email", async () => {
  const owner = randomUUID();
  const role = await createRole(owner, {
    title: "QA",
    client_name: "QA Client",
    jd_text: "QA",
  });
  const [doc] = await rows<Deliverable>(
    sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','Subject','Reviewed text',${json({ audience: "client", language: "en", people: [], files: [], role: { title: "QA", client_name: "QA" } })}) RETURNING *`,
  );
  const input = {
    expected_version: doc.version,
    to: "recipient@example.test",
    request_key: randomUUID(),
  };
  assert.equal((await gmailConnection(owner)).connected, false);
  await assert.rejects(
    () => sendRecommendation(owner, doc.id, input),
    /Connect Gmail/,
  );
  for (const to of [
    "recipient@example.test\r\nBcc:other@example.test",
    "first@example.test,second@example.test",
  ])
    assert.equal(
      sendRecommendationInput.safeParse({ ...input, to }).success,
      false,
    );
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () =>
      reserveEmailDelivery(
        owner,
        doc.id,
        { ...input, request_key: randomUUID() },
        "sender@example.test",
        "<qa@hirelix.online>",
      ),
    ),
  );
  assert.equal(attempts.filter((a) => a.send).length, 1);
  assert.equal(new Set(attempts.map((a) => a.receipt.id)).size, 1);
  const receipt = attempts[0].receipt;
  await db.execute(
    sql`UPDATE hirelix_private_email_deliveries SET status='unknown' WHERE id=${receipt.id}::uuid`,
  );
  assert.equal(
    (
      await reserveEmailDelivery(
        owner,
        doc.id,
        input,
        "sender@example.test",
        "<qa@hirelix.online>",
      )
    ).send,
    false,
  );
  await db.execute(
    sql`UPDATE hirelix_private_deliverables SET version=version+1 WHERE id=${doc.id}::uuid`,
  );
  assert.equal(
    (
      await reserveEmailDelivery(
        owner,
        doc.id,
        {
          ...input,
          expected_version: doc.version + 1,
          request_key: randomUUID(),
        },
        "sender@example.test",
        "<qa@hirelix.online>",
      )
    ).send,
    false,
    "status-only version changes must not allow duplicate sends",
  );
  const updated = await updateDeliverable(owner, doc.id, {
    title: doc.title,
    content: "Actually revised body",
    expected_version: doc.version + 1,
  });
  const fresh = await reserveEmailDelivery(
    owner,
    doc.id,
    { ...input, expected_version: updated.version, request_key: randomUUID() },
    "sender@example.test",
    "<qa2@hirelix.online>",
  );
  assert.equal(fresh.send, true);
  await db.execute(
    sql`UPDATE hirelix_private_email_deliveries SET created_at=now()-interval '3 minutes' WHERE id=${fresh.receipt.id}::uuid`,
  );
  const receipts = await emailReceipts(owner, doc.id);
  assert.equal(
    receipts.find((r) => r.id === fresh.receipt.id)?.status,
    "unknown",
  );
  assert.equal(
    receipts.find((r) => r.id === fresh.receipt.id)?.current_copy,
    true,
  );
  assert.equal(receipts.find((r) => r.id === receipt.id)?.current_copy, false);
  await assert.rejects(
    () =>
      reserveEmailDelivery(
        randomUUID(),
        doc.id,
        { ...input, expected_version: updated.version },
        "sender@example.test",
        "<qa@hirelix.online>",
      ),
    /not found/,
  );
});
