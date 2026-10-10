import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { sendMessage, assistantReply, conversationDetails, type AssistantMeta } from "../../src/lib/workspace/conversations";
import { claimJob, finishJob, heartbeat, cancelJob, LostLease } from "../../src/lib/workspace/jobs";
import { createRole, updateRole } from "../../src/lib/workspace/roles";
import { indexRole, retrieveRoles } from "../../src/lib/workspace/role-retrieval";
import { generateRevision, requestRevision } from "../../src/lib/workspace/revisions";
import { enqueue, owned, rows, json } from "../../src/lib/workspace/database";
import type { Deliverable, Role } from "../../src/lib/workspace/types";
const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => { await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`); await closeDb(); });
async function reply(message: string, conversationId?: string) {
  const sent = await sendMessage(owner, {message, conversation_id: conversationId, locale: "en", request_key: randomUUID()});
  const job = await claimJob(["chat"]); assert.equal(job?.id,sent.job.id);
  const timer = setInterval(() => void heartbeat(job!),20000);
  try { await finishJob(job!, await assistantReply(job!, () => heartbeat(job!))); } finally {clearInterval(timer);}
  const detail = await conversationDetails(owner,sent.conversation_id);
  return {...detail, meta: detail.messages.at(-1)!.metadata as AssistantMeta};
}
test("real model: explicitly delegated JD saves directly; analysis does not write", {timeout:240000}, async () => {
  const saved = await reply("Save a new role for fictional QA V3 Cedar: Head of Product. Original JD: Lead six product managers on enterprise onboarding and permissions. London office Monday and Thursday. Base GBP 150,000–170,000. Save it directly, preserve this original JD, and do not send anything or create a schedule.");
  const action = saved.meta.actions?.find(action => action.kind === "create_role");
  assert.equal(action?.status,"saved", JSON.stringify(saved.meta));
  const role = await owned<Role>(owner,"role",action!.role_id!);
  assert.match(role.jd_text,/six|6/);
  const analysis = await reply("Only explain the risks if this role were fully remote. Do not change or save anything.",saved.conversation.id);
  assert.equal(analysis.meta.actions?.length,0);
  assert.equal((await owned<Role>(owner,"role",role.id)).version,role.version);
});
test("real embeddings: JD retrieval is isolated and invalidates changed source", {timeout:180000}, async () => {
  const role = await createRole(owner,{title:"QA V3 Infrastructure",client_name:"QA Lake",jd_text:"Build fault tolerant distributed storage systems in Rust with consensus protocols."});
  async function index() { const job = await enqueue(owner,"index",randomUUID(),{role_id:role.id}); const prepared=await indexRole(job,async()=>{}); await db.transaction(async tx=>{await prepared.apply?.(tx);}); }
  await index();
  const first=await retrieveRoles(owner,"Rust distributed storage consensus engineering");
  assert(first.roles.some(item=>item.id===role.id));
  assert.equal((await retrieveRoles(randomUUID(),"Rust storage")).roles.length,0);
  await updateRole(owner,role.id,{...role,jd_text:"Build compilers and static analysis tools in Rust."},role.version);
  await assert.rejects(()=>retrieveRoles(owner,"Rust storage"),/indexed/);
  await index();
  const result=await retrieveRoles(owner,"Rust compiler static analysis");
  assert(result.roles.some(item=>item.id===role.id && item.version===2));
});
test("real model: requested revision saves once; explicit preview stays unchanged", {timeout:180000}, async () => {
  const role=await createRole(owner,{title:"QA V3 Product",client_name:"QA Cedar",jd_text:"Lead six PMs."});
  const [document]=await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','QA Internal note','Mira led six PMs. Office attendance is unconfirmed.',${json({audience:"internal",language:"en",people:[]})}) RETURNING *`);
  const requested=await requestRevision(owner,document.id,{instructions:"Keep this internal. Make the text concise; preserve six PMs and unconfirmed attendance.",expected_version:1,request_key:randomUUID()});
  const job=await claimJob(["revision"]);assert.equal(job?.id,requested.id);
  const prepared=await generateRevision(job!,async()=>{});await finishJob(job!,prepared);
  const updated=await owned<Deliverable>(owner,"deliverable",document.id);assert.equal(updated.version,2);assert.match(updated.content,/six|6/i);assert.doesNotMatch(updated.content,/whether.{0,45}(?:led|managed).{0,25}unconfirmed/i);assert.match(updated.content,/unconfirmed/i);
  await assert.rejects(()=>finishJob(job!,prepared),LostLease);
  const preview=await requestRevision(owner,document.id,{preview_only:true,instructions:"Use one sentence. Keep uncertainty.",expected_version:2,request_key:randomUUID()});
  const previewJob=await claimJob(["revision"]);assert.equal(previewJob?.id,preview.id);await finishJob(previewJob!,await generateRevision(previewJob!,async()=>{}));
  assert.equal((await owned<Deliverable>(owner,"deliverable",document.id)).version,2);
});
test("real database: stopping an execution fences its late writes",async()=>{
  const queued=await enqueue(owner,"assessment",randomUUID(),{});const job=await claimJob(["assessment"]);assert.equal(job?.id,queued.id);
  await assert.rejects(()=>cancelJob(randomUUID(),job!.id),/not found/);
  await cancelJob(owner,job!.id);let applied=false;
  await assert.rejects(()=>finishJob(job!,{result:{},apply:async()=>{applied=true;}}),LostLease);
  assert.equal(applied,false);
});
