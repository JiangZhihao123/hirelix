import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { rows, json } from "../../src/lib/workspace/database";
import { listConversations } from "../../src/lib/workspace/conversations";

const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
const owner = randomUUID();
const other = randomUUID();
after(async () => {
  await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id IN (${owner}::uuid,${other}::uuid)`);
  await db.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id IN (${owner}::uuid,${other}::uuid)`);
  await closeDb();
});

test("real PG: sidebar activity follows owned chat and deliverable jobs, including terminal states", async () => {
  const [conversation] = await rows<{ id: string }>(sql`INSERT INTO hirelix_private_conversations(user_id,title) VALUES(${owner}::uuid,'Sidebar activity QA') RETURNING id`);
  const active = async () => (await listConversations(owner)).find(item => item.id === conversation.id)?.running;
  assert.equal(await active(), false);
  // A different user's job must never affect this conversation, even with a matching payload.
  await db.execute(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,status,lease_until) VALUES(${other}::uuid,'chat',${randomUUID()},${json({ conversation_id: conversation.id })},'running',now()+interval '10 minutes')`);
  assert.equal(await active(), false);
  assert.equal((await listConversations(other)).length, 0);
  const [job] = await rows<{ id: string }>(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,status,lease_until) VALUES(${owner}::uuid,'chat',${randomUUID()},${json({ conversation_id: conversation.id })},'running',now()+interval '10 minutes') RETURNING id`);
  assert.equal(await active(), true);
  for (const status of ['done', 'error', 'cancelled']) {
    await db.execute(sql`UPDATE hirelix_private_jobs SET status=${status} WHERE id=${job.id}::uuid`);
    assert.equal(await active(), false, status);
  }
  await db.execute(sql`UPDATE hirelix_private_jobs SET kind='deliverable',status='running' WHERE id=${job.id}::uuid`);
  assert.equal(await active(), true, 'delegated work remains visible');
  await db.execute(sql`UPDATE hirelix_private_jobs SET kind='index' WHERE id=${job.id}::uuid`);
  assert.equal(await active(), false, 'background indexing is not a conversation turn');
});
