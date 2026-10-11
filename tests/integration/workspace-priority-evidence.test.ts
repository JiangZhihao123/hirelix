import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import {
  recordEvidence,
  reminderEvidence,
} from "../../src/lib/workspace/agent-evidence";
import { commitAgentTool } from "../../src/lib/workspace/agent-execution";
import { addRecord } from "../../src/lib/workspace/records";
import { applyAssistantAction } from "../../src/lib/workspace/conversation-actions";
import { createRole } from "../../src/lib/workspace/roles";
import { rows, owned } from "../../src/lib/workspace/database";
import {
  sendMessage,
  assistantReply,
  conversationDetails,
} from "../../src/lib/workspace/conversations";
import {
  claimJob,
  finishJob,
  heartbeat,
  cancelJob,
} from "../../src/lib/workspace/jobs";
import type { SourceRecord } from "../../src/lib/workspace/types";

const database = new URL(
  process.env.DATABASE_URL || "postgresql://invalid/invalid",
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

test("record evidence retains original reports and corrections without leaking another owner", async () => {
  const role = await createRole(owner, {
    title: "QA research lead",
    client_name: "Harbor",
    jd_text: "Lead customer research. Benefits not confirmed.",
  });
  const initial = await sendMessage(owner, {
    message:
      "Harbor has not chosen an interview time. Independently, I promised to send my questions about benefits today.",
    request_key: randomUUID(),
  });
  await cancelJob(owner, initial.job.id);
  const record = await addRecord(owner, {
    role_id: role.id,
    kind: "note",
    title: "Planning note",
    content: "Waiting for interview scheduling.",
    details: { source_message_id: initial.job.payload.message_id },
  });
  const correction = await sendMessage(owner, {
    conversation_id: initial.conversation_id,
    message:
      "Correct the note: the benefits questions are due tomorrow, not today. Interview timing still pending.",
    request_key: randomUUID(),
  });
  await cancelJob(owner, correction.job.id);
  await db.transaction(async (tx) =>
    applyAssistantAction(
      owner,
      initial.conversation_id,
      {
        id: randomUUID(),
        kind: "update_record",
        title: "Correct the planning note",
        status: "pending",
        person_id: null,
        role_id: role.id,
        fields: {
          record_id: record.id,
          expected_version: 1,
          source_message_id: correction.job.payload.message_id,
          changes: {
            title: null,
            content:
              "Benefits questions due tomorrow; interview timing pending.",
            occurred_at: null,
            occurred_on: null,
          },
        },
      },
      {},
      tx,
    ),
  );
  const current = await owned<SourceRecord>(owner, "record", record.id);
  assert.equal(
    current.details.source_message_id,
    correction.job.payload.message_id,
  );
  const evidence = await recordEvidence(owner, [current]);
  assert.equal(evidence.reported_messages.length, 2);
  assert.match(evidence.reported_messages[0].text, /Independently/);
  assert.match(evidence.reported_messages[1].text, /tomorrow, not today/);
  assert.deepEqual(evidence.reported_messages[0].record_versions, [
    { record_id: record.id, record_version: 1 },
  ]);
  assert.deepEqual(evidence.reported_messages[1].record_versions, [
    { record_id: record.id, record_version: 2 },
  ]);
  await assert.rejects(
    () => recordEvidence(randomUUID(), [current]),
    /not found/i,
  );
  const foreign = await sendMessage(randomUUID(), {
    message: "Private unrelated fact",
    request_key: randomUUID(),
  });
  await cancelJob(foreign.job.user_id, foreign.job.id);
  const dangling = await addRecord(owner, {
    role_id: role.id,
    kind: "note",
    title: "Unverifiable source",
    content: "Stored text",
    details: { source_message_id: foreign.job.payload.message_id },
  });
  assert.equal(
    (await recordEvidence(owner, [dangling])).reported_messages.length,
    0,
  );
});

test("committed record versions recover the exact correction source", async () => {
  const role = await createRole(owner, {
    title: "Engineering lead",
    client_name: "Elm",
    jd_text: "Engineering leadership",
  });
  const first = await sendMessage(owner, {
    message: "Follow up with Elm on Monday.",
    request_key: randomUUID(),
  });
  await cancelJob(owner, first.job.id);
  const record = await addRecord(owner, {
    role_id: role.id,
    kind: "note",
    title: "Follow up",
    content: "Monday",
    details: { source_message_id: first.job.payload.message_id },
  });
  const next = await sendMessage(owner, {
    conversation_id: first.conversation_id,
    message: "Correct Monday to Wednesday.",
    request_key: randomUUID(),
  });
  const job = await claimJob(["chat"], { id: next.job.id, userId: owner });
  assert(job);
  await commitAgentTool(
    job,
    "update_record",
    { record_id: record.id },
    async (tx) => {
      await applyAssistantAction(
        owner,
        first.conversation_id,
        {
          id: randomUUID(),
          kind: "update_record",
          title: "Correct date",
          status: "pending",
          person_id: null,
          role_id: role.id,
          fields: {
            record_id: record.id,
            expected_version: 1,
            changes: {
              title: null,
              content: "Wednesday",
              occurred_at: null,
              occurred_on: null,
            },
          },
        },
        {},
        tx,
      );
      return {
        output: {
          record: await owned<SourceRecord>(owner, "record", record.id, tx),
        },
      };
    },
  );
  await finishJob(job, { result: {} });
  const current = await owned<SourceRecord>(owner, "record", record.id);
  assert.equal(current.details.source_message_id, first.job.payload.message_id);
  const evidence = await recordEvidence(owner, [current]);
  const correction = evidence.reported_messages.find(
    (item) => item.id === next.job.payload.message_id,
  );
  assert.equal(correction?.text, "Correct Monday to Wednesday.");
  assert.deepEqual(correction?.record_versions, [
    { record_id: record.id, record_version: 2 },
  ]);
  assert.deepEqual(
    evidence.reported_messages.find(
      (item) => item.id === first.job.payload.message_id,
    )?.record_versions,
    [{ record_id: record.id, record_version: 1 }],
  );
});

test("a delivered notification is not a completed business action", () => {
  const evidence = reminderEvidence({
    id: randomUUID(),
    title: "Ask about benefits",
    next_run_at: "2026-10-10T09:00:00Z",
    timezone: "Europe/London",
    enabled: false,
    completed_at: "2026-10-10T09:00:01Z",
    version: 1,
    conversation_id: randomUUID(),
  });
  assert.equal(evidence.notification_status, "delivered");
  assert.equal(evidence.notification_delivered_at, "2026-10-10T09:00:01Z");
  assert.equal("completed_at" in evidence, false);
});

test(
  "real priority review can advance independent work while appointment scheduling is pending",
  { timeout: 180000 },
  async () => {
    const role = await createRole(owner, {
      title: "Design lead",
      client_name: "Quarry",
      jd_text: "Lead product design. Benefits not provided.",
    });
    const original = await sendMessage(owner, {
      message:
        "Quarry has not chosen an interview slot yet. I promised the candidate a comparison of the confirmed benefits by tomorrow. I can ask Quarry about benefits independently of the interview slot.",
      request_key: randomUUID(),
    });
    await cancelJob(owner, original.job.id);
    await addRecord(owner, {
      role_id: role.id,
      kind: "note",
      title: "Quarry planning",
      content: "Interview scheduling pending. Benefits unknown.",
      details: { source_message_id: original.job.payload.message_id },
    });
    const sent = await sendMessage(owner, {
      message:
        "Quarry has not replied about the interview slot. What useful work can I do on that mandate now?",
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
    const details = await conversationDetails(owner, sent.conversation_id);
    const answer = details.messages.at(-1)!.content;
    process.stdout.write(`PRIORITY_REPLY ${JSON.stringify(answer)}\n`);
    assert.match(answer, /benefits/i);
    assert.match(answer, /tomorrow/i);
    assert.doesNotMatch(
      answer,
      /nothing (?:else|more|useful)|cannot (?:do|proceed|progress)|all .*blocked/i,
    );
    const [count] = await rows<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid`,
    );
    assert.equal(count.count, 2); // Original JD and the explicitly saved note only.
    const [schedules] = await rows<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM hirelix_private_schedules WHERE user_id=${owner}::uuid`,
    );
    assert.equal(schedules.count, 0);
  },
);

test("exact document edits preserve unrelated text, versions and ownership atomically", async () => {
  const { editDocument } = await import("../../src/lib/workspace/revisions");
  const role = await createRole(owner, {
    title: "Support lead",
    client_name: "Elm edits",
    jd_text: "Support leadership",
  });
  const [document] = await rows<
    import("../../src/lib/workspace/types").Deliverable
  >(
    sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content) VALUES(${owner}::uuid,${role.id}::uuid,'submission','Original recommendation','Salary band GBP 100,000 to 130,000.\n\nBenefits unknown. Keep this sentence.') RETURNING *`,
  );
  const edits = [
    { old_text: "GBP 100,000 to 130,000", new_text: "GBP 100,000 to 125,000" },
  ];
  await assert.rejects(
    () =>
      db.transaction((tx) =>
        editDocument(randomUUID(), document.id, 1, edits, tx),
      ),
    /not found/i,
  );
  await assert.rejects(
    () =>
      db.transaction((tx) => editDocument(owner, document.id, 2, edits, tx)),
    /changed/i,
  );
  await assert.rejects(
    () =>
      db.transaction((tx) =>
        editDocument(
          owner,
          document.id,
          1,
          [...edits, { old_text: "Missing passage", new_text: "x" }],
          tx,
        ),
      ),
    /exactly once/i,
  );
  assert.equal(
    (
      await owned<import("../../src/lib/workspace/types").Deliverable>(
        owner,
        "deliverable",
        document.id,
      )
    ).content,
    document.content,
  );
  const updated = await db.transaction((tx) =>
    editDocument(owner, document.id, 1, edits, tx),
  );
  assert.equal(updated.id, document.id);
  assert.equal(updated.version, 2);
  assert.equal(
    updated.content,
    document.content.replace(edits[0].old_text, edits[0].new_text),
  );
  assert.equal(updated.title, document.title);
});
