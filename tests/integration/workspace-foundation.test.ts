import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import {
  createPerson,
  updatePerson,
  personDetails,
  mergePeople,
  deletePerson,
  listPeople,
} from "../../src/lib/workspace/people";
import {
  createRole,
  updateRole,
  linkPerson,
  updateRelationship,
} from "../../src/lib/workspace/roles";
import { addRecord, updateRecord } from "../../src/lib/workspace/records";
import {
  enqueue,
  listVersions,
  owned,
  rows,
  WorkspaceError,
} from "../../src/lib/workspace/database";

// These tests deliberately use a real disposable PostgreSQL database, never .env.local.
const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_")
)
  throw new Error(
    "Set DATABASE_URL to an isolated local hirelix_workspace_qa_* database",
  );
const owner = randomUUID(),
  other = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id IN (${owner}::uuid,${other}::uuid) AND status IN ('queued','running')`);
  await closeDb();
});
const failure = (status: number) => (error: unknown) =>
  error instanceof WorkspaceError && error.status === status;

test("real database: ownership, independent roles, source dates and optimistic versions", async () => {
  const person = await createPerson(owner, {
    name: "QA Evelyn Hart",
    note: "Private relationship note",
  });
  const foreign = await createPerson(other, {
    name: "Other private candidate",
  });
  const roleA = await createRole(owner, {
    title: "VP Engineering",
    client_name: "QA Acme",
    jd_text: "Lead engineering managers.",
  });
  const roleB = await createRole(owner, {
    title: "Principal Engineer",
    client_name: "QA Beta",
    jd_text: "Hands-on distributed systems.",
  });
  assert.equal(roleA.source_search_id, null);
  await assert.rejects(() => owned(other, "person", person.id), failure(404));
  await assert.rejects(
    () => updatePerson(other, person.id, { name: "Stolen" }, 1),
    failure(404),
  );
  await assert.rejects(
    () => linkPerson(owner, roleA.id, foreign.id),
    failure(404),
  );
  const linkA = await linkPerson(owner, roleA.id, person.id),
    linkB = await linkPerson(owner, roleB.id, person.id);
  const call = await addRecord(owner, {
    person_id: person.id,
    role_id: roleA.id,
    kind: "call",
    title: "Sharing permission",
    content: "Agreed to share with Acme only",
    occurred_at: "2025-01-10T10:00:00Z",
  });
  assert.equal(new Date(call.occurred_at!).getUTCFullYear(), 2025);
  assert.notEqual(new Date(call.created_at).getUTCFullYear(), 2025);
  await updateRelationship(owner, roleA.id, person.id, {
    permission: "confirmed",
    permission_record_id: call.id,
    interest: "Interested in leadership",
    notes: "",
    expected_version: linkA.version,
  });
  await assert.rejects(
    () =>
      updateRelationship(owner, roleB.id, person.id, {
        permission: "confirmed",
        permission_record_id: call.id,
        interest: "",
        notes: "",
        expected_version: linkB.version,
      }),
    failure(400),
  );
  const [untouched] = await rows<{ permission: string }>(
    sql`SELECT permission FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${roleB.id}::uuid AND person_id=${person.id}::uuid`,
  );
  assert.equal(untouched.permission, "unknown");
  const updated = await updatePerson(
    owner,
    person.id,
    { ...person, headline: "Engineering leader" },
    person.version,
  );
  await assert.rejects(
    () =>
      updatePerson(
        owner,
        person.id,
        { ...person, name: "Lost update" },
        person.version,
      ),
    failure(409),
  );
  const history = await listVersions(owner, "person", person.id);
  assert.equal(history.length, 2);
  assert.equal(history[1].snapshot.headline, "");
  const sourceVersions = await listVersions(owner, "record", call.id);
  assert.equal(sourceVersions.length, 1);
  await updateRecord(
    owner,
    call.id,
    {
      ...call,
      occurred_at: new Date(call.occurred_at!).toISOString(),
      content: "Clarified: Acme leadership role only",
    },
    call.version,
  );
  assert.equal((await listVersions(owner, "record", call.id)).length, 2);
  const nextRole = await updateRole(
    owner,
    roleA.id,
    { ...roleA, jd_text: "Lead managers with M&A experience." },
    roleA.version,
  );
  assert.equal(nextRole.version, 2);
  assert.equal((await listVersions(owner, "role", roleA.id)).length, 2);
  const details = await personDetails(owner, updated.id);
  assert.equal(details.roles.length, 2);
  assert.equal((await listPeople(other, "QA Evelyn")).total, 0);
});

test("real database: durable request idempotency and conflict", async () => {
  const key = randomUUID();
  const first = await enqueue(owner, "chat", key, { text: "hello" });
  const again = await enqueue(owner, "chat", key, { text: "hello" });
  assert.equal(first.id, again.id);
  await assert.rejects(
    () => enqueue(owner, "chat", key, { text: "different" }),
    failure(409),
  );
  assert.notEqual(
    (await enqueue(other, "chat", key, { text: "hello" })).id,
    first.id,
  );
});

test("real database: explicit merge preserves conflicting data and deletion removes current records", async () => {
  const target = await createPerson(owner, {
    name: "QA Merge",
    email: "old@example.test",
    note: "Original target note",
  });
  const source = await createPerson(owner, {
    name: "QA Merge Duplicate",
    email: "new@example.test",
    note: "Do not lose this relationship history",
  });
  const role = await createRole(owner, {
    title: "QA role",
    client_name: "QA client",
    jd_text: "Leadership",
  });
  await linkPerson(owner, role.id, source.id);
  const merged = await mergePeople(
    owner,
    target.id,
    source.id,
    { ...target, email: source.email },
    target.version,
    source.version,
  );
  assert.equal(merged.email, source.email);
  await assert.rejects(() => owned(owner, "person", source.id), failure(404));
  const details = await personDetails(owner, target.id);
  assert(
    details.records.some((record) =>
      record.content.includes("Do not lose this relationship history"),
    ),
  );
  assert(
    details.records.some((record) => record.title === "Merged profile history"),
  );
  assert.equal(details.roles.length, 1);
  await deletePerson(owner, target.id, merged.version);
  await assert.rejects(() => owned(owner, "person", target.id), failure(404));
  const [count] = await rows<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${target.id}::uuid`,
  );
  assert.equal(count.count, 0);
});

test("reviewed client feedback updates only its role, preserves JD and rejects stale proposals", async () => {
  const { acceptAction, sendMessage } =
    await import("../../src/lib/workspace/conversations");
  const { json } = await import("../../src/lib/workspace/database");
  const role = await createRole(owner, {
    title: "VP Product",
    client_name: "QA Feedback",
    jd_text: "Original client JD: domain expertise.",
    brief: {
      priorities: ["Domain expertise"],
      flexible: [],
      unknowns: ["Compensation"],
    },
  });
  const conversation = await sendMessage(owner, {
    message: "Client says team leadership matters more than domain expertise.",
    request_key: randomUUID(),
    role_id: role.id,
  });
  const conversationId = conversation.conversation_id as string;
  async function proposal() {
    const actionId = randomUUID(),
      messageId = randomUUID();
    const action = {
      id: actionId,
      kind: "update_role_brief",
      status: "pending",
      role_id: role.id,
      person_id: null,
      fields: {
        expected_version: role.version,
        feedback: "Original client feedback",
        source_message_id: null,
      },
    };
    await rows(
      sql`INSERT INTO hirelix_agent_messages(id,user_id,role,content,conversation_id,metadata) VALUES(${messageId}::uuid,${owner}::uuid,'assistant','Please review',${conversationId}::uuid,${json({ actions: [action] })})`,
    );
    return { actionId, messageId };
  }
  const first = await proposal(),
    stale = await proposal();
  const revised = {
    brief: {
      priorities: ["Team leadership"],
      flexible: ["Domain expertise"],
      unknowns: ["Compensation"],
    },
    expected_version: 999,
    feedback: "Tampered feedback",
    jd_text: "Tampered JD",
  };
  await assert.rejects(
    () =>
      acceptAction(
        other,
        conversationId,
        first.messageId,
        first.actionId,
        revised,
      ),
    failure(404),
  );
  await acceptAction(
    owner,
    conversationId,
    first.messageId,
    first.actionId,
    revised,
  );
  await acceptAction(
    owner,
    conversationId,
    first.messageId,
    first.actionId,
    revised,
  );
  const updated = await owned<typeof role>(owner, "role", role.id);
  assert.equal(updated.version, 2);
  assert.equal(updated.jd_text, role.jd_text);
  assert.deepEqual(updated.brief, revised.brief);
  const feedback = await rows<{ content: string; occurred_at: string | null }>(
    sql`SELECT content,occurred_at FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND kind='feedback'`,
  );
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].content, "Original client feedback");
  assert.equal(feedback[0].occurred_at, null);
  await assert.rejects(
    () =>
      acceptAction(
        owner,
        conversationId,
        stale.messageId,
        stale.actionId,
        revised,
      ),
    failure(409),
  );
  assert.equal((await listVersions(owner, "role", role.id)).length, 2);
});
