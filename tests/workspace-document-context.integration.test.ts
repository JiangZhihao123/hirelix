import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { sendMessage } from "../src/lib/workspace/conversations";
import { json, rows } from "../src/lib/workspace/database";
import { latestDocumentWork } from "../src/lib/workspace/revisions";

test("document requests reject stale or foreign context before creating work", {skip:process.env.WORKSPACE_DOCUMENT_CONTEXT_INTEGRATION !== "true"}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const owner = randomUUID(), document = randomUUID(), role = randomUUID();
  try {
    // Fixed DB fixtures do not enqueue indexing or invoke a model.
    await db.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES(${role}::uuid,${owner}::uuid,'Document context QA','Fictional QA','QA only')`);
    await db.execute(sql`INSERT INTO hirelix_private_deliverables(id,user_id,role_id,kind,title,content,version) VALUES(${document}::uuid,${owner}::uuid,${role}::uuid,'submission','Internal QA draft','Saved text',2)`);
    const input = {message:"Revise this saved draft", document_id:document, document_version:1, request_key:randomUUID()};
    await assert.rejects(() => sendMessage(owner,input), /changed in another window/);
    await assert.rejects(() => sendMessage(randomUUID(),{...input,document_version:2}), /not found/);
    await assert.rejects(() => sendMessage(owner,{...input,document_id:null}), /Choose the saved document/);
    const [counts] = await rows<{jobs:number; conversations:number; messages:number}>(sql`SELECT (SELECT count(*)::int FROM hirelix_private_jobs WHERE user_id=${owner}::uuid) AS jobs,(SELECT count(*)::int FROM hirelix_private_conversations WHERE user_id=${owner}::uuid) AS conversations,(SELECT count(*)::int FROM hirelix_agent_messages WHERE user_id=${owner}::uuid) AS messages`);
    assert.deepEqual(counts,{jobs:0,conversations:0,messages:0});
    const parent = randomUUID();
    await db.execute(sql`INSERT INTO hirelix_private_jobs(id,user_id,kind,request_key,payload,status,created_at) VALUES(${parent}::uuid,${owner}::uuid,'chat',${randomUUID()},${json({request:{document_id:document}})},'done',now()-interval '1 minute')`);
    await db.execute(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,status) VALUES(${owner}::uuid,'revision',${randomUUID()},${json({deliverable_id:document,parent_chat_job_id:parent})},'done')`);
    assert.equal((await latestDocumentWork(owner,document))?.id,parent,"A newer child must not hide the root execution, stop control or conversation link");
    await assert.rejects(() => latestDocumentWork(randomUUID(),document),/not found/);
  } finally {
    // Only fixtures belonging to this test's fresh random owner are removed.
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${owner}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_versions WHERE user_id=${owner}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_roles WHERE user_id=${owner}::uuid`);
      });
    } finally { await closeDb(); }
  }
});
