import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import {
  sendMessage,
  conversationDetails,
} from "../../src/lib/workspace/conversations";
import { controlConversation } from "../../src/lib/workspace/conversation-control";
import {
  claimJob,
  finishJob,
  failJob,
  reclaimJobs,
  LostLease,
} from "../../src/lib/workspace/jobs";
import { commitAgentTool } from "../../src/lib/workspace/agent-execution";
import { createPerson } from "../../src/lib/workspace/people";
import { rows, owned } from "../../src/lib/workspace/database";
import {
  closeTurnChannel,
  subscribeTurnStop,
} from "../../src/lib/workspace/turn-channel";
import type { Job } from "../../src/lib/workspace/types";
const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname.startsWith("/hirelix_workspace_qa_"),
);
const owner = randomUUID();
const send = (message: string, id?: string, delivery = "queue") =>
  sendMessage(owner, {
    message,
    conversation_id: id,
    delivery,
    request_key: randomUUID(),
  });
const claim = (id: string) => claimJob(["chat"], { id, userId: owner });
after(async () => {
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`,
  );
  await closeTurnChannel();
  await closeDb();
});

test("real PG: queue is FIFO and two workers cannot run the same conversation concurrently", async () => {
  const a = await send("First"),
    b = await send("Second", a.conversation_id),
    c = await send("Third", a.conversation_id);
  assert.equal(await claim(b.job.id), null);
  const claims = await Promise.all([
    claim(a.job.id),
    claim(a.job.id),
    claim(b.job.id),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const first = claims.find(Boolean)!;
  await finishJob(first, { result: {} });
  const second = await claim(b.job.id);
  assert(second);
  assert.equal(await claim(c.job.id), null);
  await finishJob(second, { result: {} });
  const third = await claim(c.job.id);
  assert(third);
  await finishJob(third, { result: {} });
});
test("real PG: queued edits/removal persist, hidden messages never enter the delivered transcript", async () => {
  const a = await send("Active"),
    job = await claim(a.job.id);
  assert(job);
  const b = await send("Old queued text", a.conversation_id),
    c = await send("Remove this", a.conversation_id);
  await controlConversation(owner, a.conversation_id, {
    action: "edit",
    job_id: b.job.id,
    message: "Corrected queued text",
  });
  await controlConversation(owner, a.conversation_id, {
    action: "remove",
    job_id: c.job.id,
  });
  const detail = await conversationDetails(owner, a.conversation_id);
  assert.equal(detail.queue.length, 1);
  assert.equal(
    (detail.queue[0].payload.request as { message: string }).message,
    "Corrected queued text",
  );
  assert(
    !detail.messages.some(
      (m) =>
        m.content === "Corrected queued text" || m.content === "Remove this",
    ),
  );
  await assert.rejects(() =>
    controlConversation(randomUUID(), a.conversation_id, {
      action: "remove",
      job_id: b.job.id,
    }),
  );
  await assert.rejects(
    () =>
      controlConversation(owner, a.conversation_id, {
        action: "edit",
        job_id: job.id,
        message: "stale",
      }),
    /already started/,
  );
  await finishJob(job, { result: {} });
  const next = await claim(b.job.id);
  assert(next);
  assert(
    (await conversationDetails(owner, a.conversation_id)).messages.some(
      (m) => m.content === "Corrected queued text",
    ),
  );
  await finishJob(next, { result: {} });
  assert.equal(
    (await conversationDetails(owner, a.conversation_id)).job?.id,
    b.job.id,
    "removed queue entries never become the current reply",
  );
});
test("real PG: stop revokes the lease and signals worker, holds queue across reload, resume reuses receipts", async () => {
  const a = await send("Save fictional Queue Receipt QA"),
    job = await claim(a.job.id);
  assert(job);
  const b = await send("Next task", a.conversation_id);
  let writes = 0;
  const input = { name: "Queue Receipt QA" };
  const apply = async (
    tx: Parameters<Parameters<typeof commitAgentTool>[3]>[0],
  ) => {
    writes++;
    const p = await createPerson(owner, input, tx);
    return {
      output: { id: p.id },
      metadata: {
        sources: [{ title: p.name, href: `/app/candidates?person=${p.id}` }],
      },
    };
  };
  const original = await commitAgentTool(job, "save_candidate", input, apply);
  let notify: () => void = () => {};
  const notified = new Promise<void>((r) => {
    notify = r;
  });
  const unsub = await subscribeTurnStop(job.id, job.lease_token!, notify);
  await controlConversation(owner, a.conversation_id, { action: "stop" });
  await Promise.race([
    notified,
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(Error("No stop notification")),
        2000,
      );
      timer.unref();
    }),
  ]);
  await unsub();
  const held = await conversationDetails(owner, a.conversation_id);
  assert.equal(held.conversation.stopped, true);
  assert.equal(held.queue[0].id, b.job.id);
  assert.equal(await claim(b.job.id), null);
  await assert.rejects(
    () => commitAgentTool(job, "save_candidate", { name: "late" }, apply),
    LostLease,
  );
  await assert.rejects(() => finishJob(job, { result: {} }), LostLease);
  await controlConversation(owner, a.conversation_id, { action: "resume" });
  assert.equal(await claim(b.job.id), null);
  const resumed = await claim(job.id);
  assert(resumed);
  assert.deepEqual(
    await commitAgentTool(resumed, "save_candidate", input, apply),
    original,
  );
  assert.equal(writes, 1);
  await finishJob(resumed, { result: {} });
  const next = await claim(b.job.id);
  assert(next);
  await finishJob(next, { result: {} });
  assert.equal(
    (
      await rows(
        sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND name='Queue Receipt QA'`,
      )
    ).length,
    1,
  );
});
test("real PG: send now interrupts the active turn, inherits receipts and runs before existing queue", async () => {
  const a = await send("Original goal"),
    job = await claim(a.job.id);
  assert(job);
  const output = await commitAgentTool(
    job,
    "save_candidate",
    { name: "Immediate receipt" },
    async (tx) => {
      const p = await createPerson(owner, { name: "Immediate receipt" }, tx);
      return { output: { id: p.id } };
    },
  );
  const b = await send("Preserve backlog", a.conversation_id),
    c = await send("Change direction now", a.conversation_id, "immediate");
  assert.equal((await owned<Job>(owner, "job", a.job.id)).status, "cancelled");
  assert.equal(await claim(b.job.id), null);
  const immediate = await claim(c.job.id);
  assert(immediate);
  assert.deepEqual(
    await commitAgentTool(
      immediate,
      "save_candidate",
      { name: "Immediate receipt" },
      async () => {
        throw Error("duplicate");
      },
    ),
    output,
  );
  await finishJob(immediate, { result: {} });
  const next = await claim(b.job.id);
  assert(next);
  await finishJob(next, { result: {} });
});
test("real PG: stop before any worker claim keeps all messages queued; promotion resumes only selected message first", async () => {
  const a = await send("First"),
    b = await send("Second", a.conversation_id);
  await controlConversation(owner, a.conversation_id, { action: "stop" });
  const held = await conversationDetails(owner, a.conversation_id);
  assert.equal(held.job, null);
  assert.equal(held.queue.length, 2);
  assert.equal(await claim(a.job.id), null);
  await controlConversation(owner, a.conversation_id, {
    action: "immediate",
    job_id: b.job.id,
  });
  assert.equal(await claim(a.job.id), null);
  const promoted = await claim(b.job.id);
  assert(promoted);
  await finishJob(promoted, { result: {} });
  const next = await claim(a.job.id);
  assert(next);
  await finishJob(next, { result: {} });
});
test("real PG: failure holds follow-ups, continuation retries the failed task first", async () => {
  const a = await send("Fail then continue"),
    job = await claim(a.job.id);
  assert(job);
  const b = await send("After failure", a.conversation_id);
  await failJob(job, "Temporary test failure");
  assert.equal(await claim(b.job.id), null);
  await controlConversation(owner, a.conversation_id, { action: "resume" });
  const resumed = await claim(job.id);
  assert(resumed);
  await finishJob(resumed, { result: {} });
  const next = await claim(b.job.id);
  assert(next);
  await finishJob(next, { result: {} });
});
test("real PG: exhausted worker lease holds queued follow-ups", async () => {
  const a = await send("Expired worker"),
    job = await claim(a.job.id);
  assert(job);
  const b = await send("Wait after exhausted worker", a.conversation_id);
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET attempts=3,lease_until=now()-interval '1 second' WHERE id=${job.id}::uuid`,
  );
  await reclaimJobs();
  assert.equal(await claim(b.job.id), null);
  assert.equal(
    (await conversationDetails(owner, a.conversation_id)).conversation.stopped,
    true,
  );
});

test("real PG: queued answers do not consume a question until executed; edits/removal stay reversible", async () => {
  const { json } = await import("../../src/lib/workspace/database");
  const { resolveQueuedQuestion } =
    await import("../../src/lib/workspace/conversation-questions");
  const a = await send("Question context"),
    active = await claim(a.job.id);
  assert(active);
  await finishJob(active, { result: {} });
  const [question] = await rows<{ id: string }>(
    sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content,metadata) VALUES(${owner}::uuid,${a.conversation_id}::uuid,'assistant','Which date?',${json({ question: { status: "waiting", question: "Which date?", options: [], request: "Schedule fictional call" } })}) RETURNING id`,
  );
  await controlConversation(owner, a.conversation_id, { action: "stop" });
  const answer = await send("Tomorrow", a.conversation_id);
  await controlConversation(owner, a.conversation_id, {
    action: "remove",
    job_id: answer.job.id,
  });
  const replacement = await send("Next week", a.conversation_id);
  await controlConversation(owner, a.conversation_id, {
    action: "edit",
    job_id: replacement.job.id,
    message: "Monday 09:00 UTC",
  });
  let detail = await conversationDetails(owner, a.conversation_id);
  assert.equal(
    (
      detail.messages.find((m) => m.id === question.id)!.metadata.question as {
        status: string;
      }
    ).status,
    "waiting",
  );
  await controlConversation(owner, a.conversation_id, { action: "resume" });
  const running = await claim(replacement.job.id);
  assert(running);
  await resolveQueuedQuestion(running);
  await resolveQueuedQuestion(running);
  detail = await conversationDetails(owner, a.conversation_id);
  const receipt = detail.messages.find((m) => m.id === question.id)!.metadata
    .question as { status: string; answer: string };
  assert.equal(receipt.status, "answered");
  assert.equal(receipt.answer, "Monday 09:00 UTC");
  await finishJob(running, { result: {} });
});
test("real PG: last explicit promotion wins even when another message already has priority", async () => {
  const a = await send("First queued"),
    b = await send("Second queued", a.conversation_id),
    c = await send("Third queued", a.conversation_id);
  await controlConversation(owner, a.conversation_id, {
    action: "immediate",
    job_id: b.job.id,
  });
  await controlConversation(owner, a.conversation_id, {
    action: "immediate",
    job_id: c.job.id,
  });
  assert.equal(await claim(b.job.id), null);
  const top = await claim(c.job.id);
  assert(top);
  await finishJob(top, { result: {} });
  const next = await claim(b.job.id);
  assert(next);
  await finishJob(next, { result: {} });
  const last = await claim(a.job.id);
  assert(last);
  await finishJob(last, { result: {} });
});
test("real PG: stopped delegated work can resume under a live parent without reviving the old lease", async () => {
  const { enqueue } = await import("../../src/lib/workspace/database");
  const { retryJob } = await import("../../src/lib/workspace/jobs");
  const a = await send("Prepare fictional document"),
    parent = await claim(a.job.id);
  assert(parent);
  const child = await enqueue(owner, "deliverable", randomUUID(), {
    conversation_id: a.conversation_id,
    parent_chat_job_id: parent.id,
  });
  const oldChild = await claimJob(["deliverable"], {
    id: child.id,
    userId: owner,
  });
  assert(oldChild);
  await controlConversation(owner, a.conversation_id, { action: "stop" });
  await controlConversation(owner, a.conversation_id, { action: "resume" });
  const resumedParent = await claim(parent.id);
  assert(resumedParent);
  await retryJob(owner, child.id, resumedParent);
  const resumedChild = await claimJob(["deliverable"], {
    id: child.id,
    userId: owner,
  });
  assert(resumedChild);
  await assert.rejects(() => finishJob(oldChild, { result: {} }), LostLease);
  await finishJob(resumedChild, { result: { saved: true } });
  await finishJob(resumedParent, { result: {} });
});
