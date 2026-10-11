import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import {
  assistantReply,
  conversationDetails,
  sendMessage,
} from "../../src/lib/workspace/conversations";
import {
  cancelJob,
  claimJob,
  finishJob,
  heartbeat,
} from "../../src/lib/workspace/jobs";
import { createRole } from "../../src/lib/workspace/roles";
import { json, owned, rows } from "../../src/lib/workspace/database";
import type { Deliverable } from "../../src/lib/workspace/types";
const database = new URL(
  process.env.DATABASE_URL || "postgres://invalid/invalid",
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(database.hostname) &&
    database.pathname.startsWith("/hirelix_workspace_qa_"),
);
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`,
  );
  await closeDb();
});
test(
  "real model and PG: the document selected in the UI overrides a different conversation document without crossing owners",
  { timeout: 180000 },
  async () => {
    const role = await createRole(owner, {
      title: "Product lead",
      client_name: "QA Document Focus",
      jd_text: "Lead product delivery. Benefits unconfirmed.",
    });
    async function document(title: string, content: string) {
      const [saved] = await rows<Deliverable>(
        sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission',${title},${content},${json({ audience: "internal", language: "en", people: [] })}) RETURNING *`,
      );
      return saved;
    }
    const old = await document(
      "Original interview assessment",
      "The candidate described six years of product delivery experience. Keep this assessment unchanged.",
    );
    const selected = await document(
      "Client progress report",
      "This report summarizes the current position on the product lead mandate. The client confirmed a two-round interview process during our requirements discussion. The first conversation is expected to explore product delivery experience, but the participants and detailed agenda have not yet been provided. The candidate has confirmed availability on Tuesday. This is availability only: no interview date has been agreed with the client, and we should not describe the interview as booked. Benefits remain unconfirmed because the client has not provided details. The next practical step is to ask the client whether the proposed availability works and request the interview agenda. Once that is confirmed, we can share the agreed details with the candidate. No interview has been completed in the evidence summarized here. This note is for internal planning and does not represent an email sent to the client.",
    );
    const initial = await sendMessage(owner, {
      message: "Discuss this assessment",
      document_id: old.id,
      request_key: randomUUID(),
    });
    await cancelJob(owner, initial.job.id);
    assert.equal(
      (await conversationDetails(owner, initial.conversation_id)).document?.id,
      old.id,
    );
    await assert.rejects(
      () =>
        sendMessage(randomUUID(), {
          message: "Shorten this",
          viewed_source: { kind: "deliverable", id: selected.id },
          request_key: randomUUID(),
        }),
      /not found/i,
    );
    const sent = await sendMessage(owner, {
      conversation_id: initial.conversation_id,
      viewed_source: { kind: "deliverable", id: selected.id },
      message:
        "Shorten this to no more than 45 words, keeping the title, confirmed facts and unknowns.",
      request_key: randomUUID(),
    });
    const job = await claimJob(["chat"], { id: sent.job.id, userId: owner });
    assert(job);
    const timer = setInterval(() => void heartbeat(job), 20000);
    try {
      await finishJob(
        job,
        await assistantReply(job, async (text) => {
          await heartbeat(job, text);
        }),
      );
    } finally {
      clearInterval(timer);
    }
    const details = await conversationDetails(owner, initial.conversation_id);
    assert.equal(details.document?.id, selected.id);
    assert.equal(
      details.document?.version,
      2,
      details.messages.at(-1)?.content,
    );
    assert.equal(details.document?.title, selected.title);
    assert.ok(details.document!.content.trim().split(/\s+/).length <= 45);
    assert.match(details.document!.content, /two|2/i);
    assert.match(
      details.document!.content,
      /unconfirmed|unknown|not.{0,20}(?:confirmed|provided)/i,
    );
    assert.equal(
      (await owned<Deliverable>(owner, "deliverable", old.id)).version,
      1,
    );
    assert.equal(
      (
        await rows(
          sql`SELECT id FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid`,
        )
      ).length,
      2,
    );
  },
);
