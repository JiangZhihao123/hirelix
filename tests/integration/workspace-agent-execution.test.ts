import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { commitAgentTool } from "../../src/lib/workspace/agent-execution";
import {
  sendMessage,
  conversationDetails,
} from "../../src/lib/workspace/conversations";
import {
  claimJob,
  cancelJob,
  finishJob,
  reclaimJobs,
  LostLease,
} from "../../src/lib/workspace/jobs";
import { enqueue, owned, rows } from "../../src/lib/workspace/database";
import { createPerson } from "../../src/lib/workspace/people";
import type { Job } from "../../src/lib/workspace/types";
const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname.startsWith("/hirelix_workspace_qa_"),
);
const owner = randomUUID();
after(async () => {
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`,
  );
  await closeDb();
});
async function request() {
  const sent = await sendMessage(owner, {
    message: "Save two candidates",
    request_key: randomUUID(),
  });
  const job = await claimJob(["chat"], { id: sent.job.id, userId: owner });
  assert(job);
  return { sent, job };
}
test("real PG: tool receipt and business data are atomic, replay survives worker replacement, stop retains saved work", async () => {
  const { sent, job } = await request();
  let writes = 0;
  const apply = async (
    tx: Parameters<Parameters<typeof commitAgentTool>[3]>[0],
  ) => {
    writes++;
    const person = await createPerson(
      owner,
      { name: "Execution Receipt QA" },
      tx,
    );
    return {
      output: { id: person.id },
      metadata: {
        sources: [
          { title: person.name, href: `/app/candidates?person=${person.id}` },
        ],
      },
    };
  };
  const input = {
    name: "Execution Receipt QA",
    authorization_quote: "Save two candidates",
  };
  const saved = await commitAgentTool(job, "save_candidate", input, apply);
  assert.deepEqual(
    await commitAgentTool(
      job,
      "save_candidate",
      { authorization_quote: "Save two", name: input.name },
      apply,
    ),
    saved,
  );
  assert.equal(writes, 1);
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET lease_until=now()-interval '1 second' WHERE id=${job.id}::uuid`,
  );
  await reclaimJobs();
  const resumed = await claimJob(["chat"], { id: job.id, userId: owner });
  assert(resumed);
  await assert.rejects(
    () => commitAgentTool(job, "save_candidate", input, apply),
    LostLease,
  );
  assert.deepEqual(
    await commitAgentTool(resumed, "save_candidate", input, apply),
    saved,
  );
  assert.equal(writes, 1);
  const stopped = await cancelJob(owner, job.id);
  assert.equal(stopped.result?.receipt_message_id, stopped.result?.message_id);
  const details = await conversationDetails(owner, sent.conversation_id);
  assert.equal(
    details.messages.filter((m) => m.role === "assistant").length,
    1,
  );
  assert.equal(details.messages.at(-1)!.metadata.turn_status, "cancelled");
  assert(details.messages.at(-1)!.metadata.sources);
  await assert.rejects(
    () => commitAgentTool(resumed, "save_candidate", { name: "late" }, apply),
    LostLease,
  );
  assert.equal(
    (
      await rows(
        sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`,
      )
    ).length,
    1,
  );
});
test("real PG: a failed tool transaction cannot leave a profile without a receipt", async () => {
  const { job } = await request();
  await assert.rejects(
    () =>
      commitAgentTool(
        job,
        "save_candidate",
        { name: "rollback" },
        async (tx) => {
          await createPerson(owner, { name: "Must roll back" }, tx);
          throw new Error("write failed");
        },
      ),
    /write failed/,
  );
  assert.equal(
    (
      await rows(
        sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND name='Must roll back'`,
      )
    ).length,
    0,
  );
  assert.equal(
    (await owned<Job>(owner, "job", job.id)).result?.tool_receipts,
    undefined,
  );
  await cancelJob(owner, job.id);
});
test("real PG: stopping a chat prevents an already prepared document job from committing", async () => {
  const { job } = await request();
  const child = await enqueue(owner, "import", randomUUID(), {
    parent_chat_job_id: job.id,
  });
  const claimed = await claimJob(["import"], { id: child.id, userId: owner });
  assert(claimed);
  await cancelJob(owner, job.id);
  let applied = false;
  await assert.rejects(
    () =>
      finishJob(claimed, {
        result: {},
        apply: async () => {
          applied = true;
        },
      }),
    LostLease,
  );
  assert.equal(applied, false);
  assert.equal((await owned<Job>(owner, "job", child.id)).status, "cancelled");
});

test("real PG: updating a brief reuses its feedback and rejects another role's source", async () => {
  const { createRole } = await import("../../src/lib/workspace/roles");
  const { addRecord } = await import("../../src/lib/workspace/records");
  const { applyAssistantAction } =
    await import("../../src/lib/workspace/conversation-actions");
  const role = await createRole(owner, {
    title: "Product lead",
    client_name: "Source QA",
    jd_text: "Original JD: Bristol, lead three PMs",
  });
  const other = await createRole(owner, {
    title: "Data engineer",
    client_name: "Other source QA",
    jd_text: "Python",
  });
  const source = await addRecord(owner, {
    kind: "feedback",
    role_id: role.id,
    title: "Client call",
    content: "Office Tuesday and Thursday",
  });
  const { sent, job } = await request();
  const action = {
    id: randomUUID(),
    kind: "update_role_brief" as const,
    title: "Update brief",
    status: "pending" as const,
    role_id: role.id,
    person_id: null,
    fields: { expected_version: role.version, feedback_record_id: source.id },
  };
  const brief = {
    priorities: ["Bristol Tuesday and Thursday", "Lead three PMs"],
    flexible: [],
    unknowns: ["Start date"],
  };
  await db.transaction((tx) =>
    applyAssistantAction(owner, sent.conversation_id, action, { brief }, tx),
  );
  const feedback = await rows(
    sql`SELECT id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND kind='feedback'`,
  );
  assert.equal(feedback.length, 1);
  const updated = await owned<import("../../src/lib/workspace/types").Role>(
    owner,
    "role",
    role.id,
  );
  assert.deepEqual(updated.brief, brief);
  assert.equal(updated.jd_text, role.jd_text);
  await assert.rejects(
    () =>
      db.transaction((tx) =>
        applyAssistantAction(
          owner,
          sent.conversation_id,
          {
            ...action,
            role_id: other.id,
            fields: { ...action.fields, expected_version: other.version },
          },
          { brief },
          tx,
        ),
      ),
    /exact role/,
  );
  assert.equal(
    (
      await owned<import("../../src/lib/workspace/types").Role>(
        owner,
        "role",
        other.id,
      )
    ).version,
    other.version,
  );
  await cancelJob(owner, job.id);
});

test("real PG: user retry of failed work releases the finished chat ownership", async () => {
  const { failJob, retryJob } = await import("../../src/lib/workspace/jobs");
  const { job } = await request();
  const work = await enqueue(owner, "import", randomUUID(), {
    parent_chat_job_id: job.id,
  });
  const claimed = await claimJob(["import"], { id: work.id, userId: owner });
  assert(claimed);
  await failJob(claimed, "Temporary failure");
  await finishJob(job, { result: {} });
  const retried = await retryJob(owner, work.id);
  assert.equal(retried.payload.parent_chat_job_id, undefined);
  const resumed = await claimJob(["import"], { id: work.id, userId: owner });
  assert(resumed);
  await finishJob(resumed, { result: { recovered: true } });
  assert.equal((await owned<Job>(owner, "job", work.id)).status, "done");
});
