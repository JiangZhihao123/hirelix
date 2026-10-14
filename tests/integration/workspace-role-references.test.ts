import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, after } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { rows, json } from "../../src/lib/workspace/database";
import { sendMessage, conversationDetails } from "../../src/lib/workspace/conversations";
import { cancelJob } from "../../src/lib/workspace/jobs";
import { closeTurnChannel } from "../../src/lib/workspace/turn-channel";
import type { Role } from "../../src/lib/workspace/types";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/hirelix_workspace_qa_"));
const owner = randomUUID();
after(async () => {
  for (const table of ["hirelix_private_notifications", "hirelix_agent_messages", "hirelix_private_jobs", "hirelix_private_conversations", "hirelix_private_roles"]) {
    await db.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE user_id=${owner}::uuid`);
  }
  await closeTurnChannel();
  await closeDb();
});
test("real PG: roles follow each message, survive renames, and never inherit the conversation's role", async () => {
  const [a, b] = await rows<Role>(sql`INSERT INTO hirelix_private_roles(user_id,title,client_name,jd_text) VALUES(${owner}::uuid,'Engineer A','Client A','JD A'),(${owner}::uuid,'Engineer B','Client B','JD B') RETURNING *`);
  const first = await sendMessage(owner, { message: 'Review this role', role_id: a.id, request_key: randomUUID() });
  await cancelJob(owner, first.job.id);
  const second = await sendMessage(owner, { message: 'Now this role', conversation_id: first.conversation_id, role_id: b.id, request_key: randomUUID() });
  await cancelJob(owner, second.job.id);
  const third = await sendMessage(owner, { message: 'Thanks', conversation_id: first.conversation_id, request_key: randomUUID() });
  await cancelJob(owner, third.job.id);
  await db.execute(sql`UPDATE hirelix_private_roles SET title='Renamed' WHERE id=${a.id}::uuid`);
  let detail = await conversationDetails(owner, first.conversation_id);
  let messages = detail.messages.filter(message => message.role === 'user');
  assert.equal(detail.conversation.role_id, null);
  assert.deepEqual(messages[0].metadata.role_reference, { id: a.id, title: a.title, client_name: a.client_name });
  assert.deepEqual(messages[1].metadata.role_reference, { id: b.id, title: b.title, client_name: b.client_name });
  assert.equal(messages[2].metadata.role_reference, undefined);
  // Existing messages must use their own saved selection, with a viewed role taking precedence.
  await db.execute(sql`UPDATE hirelix_agent_messages SET metadata=${json({role_id: a.id, viewed_source: {kind:'role',id:b.id}})} WHERE id=${messages[0].id}::uuid`);
  await db.execute(sql`UPDATE hirelix_private_conversations SET role_id=${a.id}::uuid WHERE id=${first.conversation_id}::uuid`);
  detail = await conversationDetails(owner, first.conversation_id);
  messages = detail.messages.filter(message => message.role === 'user');
  assert.equal((messages[0].metadata.role_reference as {id:string}).id, b.id);
  assert.equal(messages[2].metadata.role_reference, undefined);
  await assert.rejects(() => sendMessage(randomUUID(), {message:'Foreign role',role_id:a.id,request_key:randomUUID()}), /not found/);
});
