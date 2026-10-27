import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { json, rows } from "../../src/lib/workspace/database";
import { prepareDocumentWrite } from "../../src/lib/workspace/document-writes";
import { commitAgentTool } from "../../src/lib/workspace/agent-execution";
import { publishDocument } from "../../src/lib/workspace/document-sharing";
import { saveRecommendationFeedback } from "../../src/lib/workspace/recommendation-feedback";
import type { Job } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/hirelix_workspace_qa_"))
  throw new Error("Use an isolated local QA database");
process.env.BETTER_AUTH_SECRET = "local-isolated-feedback-origin-test-secret";
after(closeDb);

const owner = randomUUID(), other = randomUUID(), role = randomUUID(), person = randomUUID();
const origin = randomUUID(), editConversation = randomUUID(), legacyConversation = randomUUID(), foreignConversation = randomUUID();

async function chatJob(user: string, conversation: string, result: unknown = {}, createdAt = "2026-10-20T00:00:00Z") {
  const [job] = await rows<Job>(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,result,status,lease_token,lease_until,created_at)
    VALUES(${user}::uuid,'chat',${randomUUID()},${json({conversation_id:conversation})},${json(result)},'running',${randomUUID()}::uuid,now()+interval '1 hour',${createdAt}::timestamptz) RETURNING *`);
  return job;
}
const createInput = {
  operation:"create", kind:"submission", role_id:role, person_ids:[person], title:"QA recommendation",
  audience:"client", language:"en", format:"recommendation", period_start:null,period_end:null,
  period_local_start:null,period_local_end:null,report_timezone:null,
  sources:{role_version:1,records:[],file_ids:[]}, content:"## QA person\n\nRelevant evidence.",
};

async function deliverFeedback(documentId: string, version: number) {
  const share = await publishDocument(owner,documentId,version);
  return saveRecommendationFeedback(share.path.split("/").at(-1)!,{
    request_key:randomUUID(),person_id:person,response:"comment",name:"QA reviewer",comment:"Please clarify the scope.",
  });
}

async function feedbackDestination(recordId: string) {
  const [message] = await rows<{conversation_id:string}>(sql`SELECT conversation_id FROM hirelix_agent_messages WHERE user_id=${owner}::uuid AND metadata->>'feedback_record_id'=${recordId}`);
  const [notification] = await rows<{href:string}>(sql`SELECT href FROM hirelix_private_notifications WHERE user_id=${owner}::uuid AND kind='recommendation_feedback' AND href IN (
    ${`/app?conversation=${origin}`},${`/app?conversation=${editConversation}`},${`/app?conversation=${legacyConversation}`},${`/app/roles/${role}?tab=activity&record=${recordId}`}
  ) ORDER BY created_at DESC,id DESC LIMIT 1`);
  return {conversation:message?.conversation_id ?? null, href:notification?.href};
}

test("real PG: creation receipt selects the original owned conversation and keeps legacy work", async () => {
  const [count] = await rows<{n:number}>(sql`SELECT (SELECT count(*) FROM hirelix_private_roles WHERE user_id IN (${owner}::uuid,${other}::uuid))::int AS n`);
  assert.equal(count.n,0);
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text) VALUES(${role}::uuid,${owner}::uuid,'QA role','QA client','QA brief')`);
      await tx.execute(sql`INSERT INTO hirelix_agent_people(id,user_id,name,headline,location) VALUES(${person}::uuid,${owner}::uuid,'QA person','','')`);
      await tx.execute(sql`INSERT INTO hirelix_private_conversations(id,user_id,title) VALUES
        (${origin}::uuid,${owner}::uuid,'Origin'),(${editConversation}::uuid,${owner}::uuid,'Edit'),
        (${legacyConversation}::uuid,${owner}::uuid,'Legacy'),(${foreignConversation}::uuid,${other}::uuid,'Foreign')`);
    });
    const createJob = await chatJob(owner,origin);
    const applyCreate = await prepareDocumentWrite(owner,createInput);
    const created = await commitAgentTool(createJob,"save_document",createInput,async tx => ({output:await applyCreate(tx)})) as Awaited<ReturnType<Awaited<ReturnType<typeof prepareDocumentWrite>>>>;
    assert.equal(created.operation,"create");

    const editJob = await chatJob(owner,editConversation,{},"2026-10-21T00:00:00Z");
    const patchInput = {operation:"patch",document_id:created.document.id,expected_version:1,edits:[{old_text:"Relevant evidence.",new_text:"Updated evidence."}],sources:null};
    const applyPatch = await prepareDocumentWrite(owner,patchInput);
    const edited = await commitAgentTool(editJob,"save_document",patchInput,async tx => ({output:await applyPatch(tx)})) as Awaited<ReturnType<Awaited<ReturnType<typeof prepareDocumentWrite>>>>;
    assert.equal(edited.operation,"patch");
    await chatJob(owner,editConversation,{tool_receipts:null},"2026-10-22T00:00:00Z");
    await chatJob(other,foreignConversation,{tool_receipts:{forged:{name:"save_document",output:{operation:"create",document:{id:created.document.id}}}}},"2026-10-23T00:00:00Z");
    await chatJob(owner,foreignConversation,{tool_receipts:{wrongOwner:{name:"save_document",output:{operation:"create",document:{id:created.document.id}}}}},"2026-10-24T00:00:00Z");
    const directFeedback = await deliverFeedback(created.document.id,2);
    assert.deepEqual(await feedbackDestination(directFeedback.id),{conversation:origin,href:`/app?conversation=${origin}`},"later edits and foreign jobs must not take ownership of the conversation");

    const applyLegacy = await prepareDocumentWrite(owner,{...createInput,title:"Legacy recommendation"});
    const legacy = await db.transaction(applyLegacy);
    await rows<Job>(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,result,status,created_at)
      VALUES(${owner}::uuid,'deliverable',${randomUUID()},${json({conversation_id:legacyConversation})},${json({deliverable_id:legacy.document.id})},'done','2026-10-20T00:00:00Z') RETURNING *`);
    await chatJob(owner,editConversation,{tool_receipts:{edit:{name:"save_document",output:{operation:"replace",document:{id:legacy.document.id}}}}},"2026-10-25T00:00:00Z");
    const legacyFeedback = await deliverFeedback(legacy.document.id,1);
    assert.deepEqual(await feedbackDestination(legacyFeedback.id),{conversation:legacyConversation,href:`/app?conversation=${legacyConversation}`});

    const applyUnlinked = await prepareDocumentWrite(owner,{...createInput,title:"No creating conversation"});
    const unlinked = await db.transaction(applyUnlinked);
    await chatJob(owner,editConversation,{tool_receipts:{notCreate:{name:"save_document",output:{operation:"patch",document:{id:unlinked.document.id}}},wrongTool:{name:"read_document",output:{operation:"create",document:{id:unlinked.document.id}}}}},"2026-10-26T00:00:00Z");
    await chatJob(other,foreignConversation,{tool_receipts:{foreign:{name:"save_document",output:{operation:"create",document:{id:unlinked.document.id}}}}},"2026-10-27T00:00:00Z");
    const unlinkedFeedback = await deliverFeedback(unlinked.document.id,1);
    assert.deepEqual(await feedbackDestination(unlinkedFeedback.id),{conversation:null,href:`/app/roles/${role}?tab=activity&record=${unlinkedFeedback.id}`});
  } finally {
    await db.transaction(async tx => {
      for (const user of [owner,other]) {
        await tx.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_notifications WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_document_shares WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_role_candidates WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_records WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_versions WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_deliverables WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_private_roles WHERE user_id=${user}::uuid`);
        await tx.execute(sql`DELETE FROM hirelix_agent_people WHERE user_id=${user}::uuid`);
      }
    });
  }
});
