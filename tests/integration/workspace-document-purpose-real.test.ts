import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile as readEvidenceFile, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { getGlobalDispatcher } from "undici";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { agentCreditContext, executionTrace } from "../../src/lib/agent-credit-context";
import { getDefaultLlmModel, isUsingOfficialDeepSeek } from "../../src/lib/llm-client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { conversationDetails, sendMessage, assistantReply } from "../../src/lib/workspace/conversations";
import { json, owned, rows, snapshot, uuidArray } from "../../src/lib/workspace/database";
import { readFile, saveFile } from "../../src/lib/workspace/files";
import { claimJob, failJob, finishJob, withJobLease } from "../../src/lib/workspace/jobs";
import { createPerson } from "../../src/lib/workspace/people";
import { addRecord } from "../../src/lib/workspace/records";
import { createRole, linkCandidates } from "../../src/lib/workspace/roles";
import { closeTurnChannel } from "../../src/lib/workspace/turn-channel";
import type { Deliverable, Job, SourceRecord } from "../../src/lib/workspace/types";

// Run explicitly with a local QA DATABASE_URL, WORKSPACE_REAL_AI_TEST=true,
// and node --env-file=.env --env-file=.env.local --import tsx --test.
// All examples and saved provider observations below contain synthetic data.
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname === "/hirelix_workspace_qa_coldstart_20261027");
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
assert.ok(isUsingOfficialDeepSeek(), "These scenarios require the real official DeepSeek provider");
initializeGlobalOutboundProxy();
const owners: string[] = [];
const directory = `output/workspace-document-purpose/${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0,8)}`;
const realFetch = globalThis.fetch;
type ToolMessage = {tool_call_id:string;content:unknown};
type ProviderRequest = {job_id?:string;status:number;model:string;markers:string[];tool_messages:ToolMessage[]};
const requests: ProviderRequest[] = [];
const markers = new Map<string,string[]>();
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
  const body = url.hostname === "api.deepseek.com" && url.pathname.endsWith("/chat/completions") && typeof init?.body === "string"
    ? JSON.parse(init.body) as {model:string;messages:Array<{role:string;content:unknown;tool_call_id?:string}>} : null;
  const jobId = agentCreditContext.getStore()?.id;
  const response = await realFetch(input,init);
  if (body && Array.isArray(body.messages)) {
    const serialized = JSON.stringify(body.messages);
    requests.push({job_id:jobId,status:response.status,model:body.model,markers:(markers.get(jobId || "") || []).filter(marker => serialized.includes(marker)),
      tool_messages:body.messages.filter(item => item.role === "tool" && typeof item.tool_call_id === "string").map(item => {
        let content = item.content;
        if (typeof content === "string") { try { content=JSON.parse(content); } catch { /* Keep the actual malformed value for diagnosis. */ } }
        return {tool_call_id:item.tool_call_id!,content};
      })});
  }
  return response;
};
after(async () => {
  globalThis.fetch = realFetch;
  for (const owner of owners) await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeTurnChannel(); await closeDb(); await getGlobalDispatcher().close();
});

type Fixture = Awaited<ReturnType<typeof makeFixture>>;
async function makeFixture() {
  const owner = randomUUID(), other = randomUUID();
  owners.push(owner,other);
  const role = await createRole(owner,{title:"平台工程负责人",client_name:"虚构青杉科技",jd_text:"需要有平台架构和带领工程师团队经验的负责人。"});
  const first = await createPerson(owner,{name:"虚构林澄",headline:"平台工程师",email:"lin.cheng@qa.invalid"});
  const second = await createPerson(owner,{name:"虚构周宁",headline:"数据平台负责人",email:"zhou.ning@qa.invalid"});
  await linkCandidates(owner,role.id,[first.id,second.id]);
  const originalBytes = Buffer.from("候选人虚构林澄提到愿意每周两天到办公室，曾带领四人团队。该原始备注没有记录沟通时间。\n");
  const original = await saveFile(owner,{name:"undated-conversation.txt",type:"text/plain",bytes:originalBytes});
  const undated = await addRecord(owner,{person_id:first.id,role_id:role.id,file_id:original.id,kind:"note",title:"林澄原始沟通备注（无日期）",content:originalBytes.toString(),occurred_at:null,details:{occurred_on:null}});
  const old = await addRecord(owner,{person_id:second.id,role_id:role.id,kind:"call",title:"九月历史沟通",content:"虚构周宁在九月介绍过数据平台项目。",occurred_at:"2026-09-10T02:00:00.000Z"});
  const active = await addRecord(owner,{person_id:first.id,role_id:role.id,kind:"call",title:"十月二十一日沟通",content:"2026年10月21日与虚构林澄确认了平台技术交流。",occurred_at:"2026-10-21T02:00:00.000Z"});
  return {owner,other,role,first,second,original,originalBytes,undated,old,active};
}
async function makeMisclassifiedDocument(f: Fixture) {
  const oldContent = "# 内部候选人比较\n\n旧稿仅供内部讨论，未完整引用候选人的无日期备注。";
  const source = {audience:"internal",language:"zh",format:"recommendation",report_timezone:"Asia/Shanghai",period_local_start:"2026-10-19",period_local_end:"2026-10-25",
    role:{id:f.role.id,version:f.role.version,title:f.role.title,client_name:f.role.client_name,jd_text:f.role.jd_text,brief:f.role.brief},
    people:[{id:f.first.id,version:f.first.version,name:f.first.name},{id:f.second.id,version:f.second.version,name:f.second.name}],records:[],files:[]};
  const [doc] = await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,person_ids,record_ids,file_ids,period_start,period_end,source_snapshot)
    VALUES(${f.owner}::uuid,${f.role.id}::uuid,'search_update','内部候选人比较旧稿',${oldContent},${uuidArray([f.first.id,f.second.id])},${uuidArray([])},${uuidArray([])},'2026-10-18T16:00:00Z'::timestamptz,'2026-10-25T15:59:59.999Z'::timestamptz,${json(source)}) RETURNING *`);
  await snapshot(f.owner,"deliverable",doc);
  return doc;
}

async function runOwnerJob(owner: string, job: Job) {
  const active = await claimJob(["chat"],{id:job.id,userId:owner}); assert.ok(active);
  try {
    await withJobLease(active,async (signal,progress) => {
      const prepared = await agentCreditContext.run({...active,signal,trace:executionTrace(active)},()=>assistantReply(active,progress));
      signal.throwIfAborted();
      await finishJob(active,prepared);
    });
  } catch (error) {
    await failJob(active,"Document-purpose QA failed");
    throw error;
  }
}
type Step = {tools:string[];results:Array<{tool:string;tool_call_id?:string;ok?:boolean;error?:unknown}>};
function checkToolObservations(steps: Step[], providerRequests: ProviderRequest[]) {
  const observations = providerRequests.filter(item=>item.status>=200 && item.status<300).flatMap(item=>item.tool_messages);
  const completed = steps.flatMap(step=>step.results).filter(result=>result.tool_call_id);
  const missing = completed.filter(result=>!observations.some(item=>item.tool_call_id===result.tool_call_id));
  const malformed = completed.filter(result=>{
    const found=observations.find(item=>item.tool_call_id===result.tool_call_id);
    if (!found) return false;
    // SDK validation failures are tool-error events sent as text, not wrapped
    // application tool results. Both must be visible to the next model call.
    if (result.error) return typeof found.content !== "string" || !found.content.trim();
    if (!found.content || typeof found.content !== "object") return true;
    const value=found.content as {ok?:unknown;result?:unknown;error?:unknown};
    return value.ok!==result.ok || (value.ok===true && !("result" in value)) || (value.ok===false && !("error" in value));
  });
  return {observations,completed,missing,malformed};
}
async function runTurn(f: Fixture, label: string, message: string, document?: Deliverable) {
  const input = {message,role_id:f.role.id,candidate_ids:[f.first.id,f.second.id],...(document ? {document_id:document.id} : {}),request_key:randomUUID(),locale:"zh",timezone:"Asia/Shanghai"};
  const sent = await sendMessage(f.owner,input);
  markers.set(sent.job.id,[message,f.role.id,f.first.id,f.second.id,...(document ? [document.id] : [])]);
  let failure: unknown;
  try { await runOwnerJob(f.owner,sent.job); } catch (error) { failure=error; }
  const job = await owned<Job>(f.owner,"job",sent.job.id), conversation = await conversationDetails(f.owner,sent.conversation_id);
  const actualRequests = requests.filter(item => item.job_id === sent.job.id);
  const steps = (job.result?.agent_steps || []) as Step[];
  const {observations,completed,missing,malformed} = checkToolObservations(steps,actualRequests);
  const receipts = Object.values((job.result?.tool_receipts || {}) as Record<string,{name:string;output:unknown}>);
  const mismatches = receipts.filter(receipt=>{
    const calls=completed.filter(item=>item.tool===receipt.name && item.ok===true);
    return calls.length>0 && !calls.some(call=>observations.some(item=>{
      const data=item.content as {ok?:boolean;result?:unknown};
      return item.tool_call_id===call.tool_call_id && data?.ok===true && isDeepStrictEqual(data.result,receipt.output);
    }));
  });
  const documents = await rows<Deliverable>(sql`SELECT * FROM hirelix_private_deliverables WHERE user_id=${f.owner}::uuid ORDER BY created_at,id`);
  const versions = await rows<{entity_id:string;version:number;snapshot:Deliverable}>(sql`SELECT entity_id,version,snapshot FROM hirelix_private_versions WHERE user_id=${f.owner}::uuid AND entity_type='deliverable' ORDER BY entity_id,version`);
  const notifications = await rows<{request_key:string;href:string;kind:string}>(sql`SELECT request_key,href,kind FROM hirelix_private_notifications WHERE user_id=${f.owner}::uuid ORDER BY created_at`);
  const shares = await rows(sql`SELECT id FROM hirelix_private_document_shares WHERE user_id=${f.owner}::uuid`);
  const emails = await rows(sql`SELECT id FROM hirelix_private_email_deliveries WHERE user_id=${f.owner}::uuid`);
  const originals = await Promise.all([f.undated,f.old,f.active].map(record=>owned<SourceRecord>(f.owner,"record",record.id)));
  const file = await readFile(f.owner,f.original.id);
  const evidence = {label,owner:f.owner,job_id:job.id,conversation_id:sent.conversation_id,status:job.status,model:getDefaultLlmModel(),
    error_type:failure instanceof Error ? failure.name : null,message,fixture:{role_id:f.role.id,people:[f.first.id,f.second.id],undated_id:f.undated.id,old_id:f.old.id,active_id:f.active.id,original_file_id:f.original.id,selected_document_id:document?.id ?? null},
    reply:conversation.messages.filter(item=>item.role==="assistant").at(-1)?.content ?? null,steps,receipts,provider_requests:actualRequests,documents,versions,notifications,shares,emails,original_records:originals,file_sha256:file.sha256,
    missing_tool_observations:missing,malformed_tool_observations:malformed,receipt_mismatches:mismatches};
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/${label}.json`,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({label,job_id:job.id,status:job.status,model:evidence.model,steps:steps.map(step=>step.tools),documents:documents.map(item=>({id:item.id,kind:item.kind,version:item.version,record_ids:item.record_ids,period_start:item.period_start,period_end:item.period_end})),
    reply:evidence.reply,evidence:`${directory}/${label}.json`}));
  if (failure) throw failure;
  assert.equal(job.status,"done");
  assert.ok(actualRequests.some(item=>item.status===200 && item.markers.includes(message)),"The actual user instruction reached the model");
  for (const id of [f.role.id,f.first.id,f.second.id,...(document?[document.id]:[])])
    assert.ok(actualRequests.some(item=>item.status===200 && item.markers.includes(id)),"Selected object reference reaches the provider");
  assert.deepEqual(missing,[],"Completed tool results reach the next model call");
  assert.deepEqual(malformed,[],"The provider observes actual tool success and error structures");
  assert.deepEqual(mismatches,[],"Committed receipts are delivered unchanged");
  assert.equal(notifications.filter(item=>item.request_key===`job-ready:${job.id}` && item.href===`/app?conversation=${sent.conversation_id}`).length,1);
  assert.equal(shares.length,0,"Internal work must not publish a document");
  assert.equal(emails.length,0,"Internal work must not send mail");
  for (const saved of documents) assert.equal(saved.status,"draft");
  for (let index=0;index<originals.length;index++) {
    const original=[f.undated,f.old,f.active][index], current=originals[index];
    assert.equal(current.version,original.version);
    assert.equal(current.person_id,original.person_id);
    assert.equal(current.role_id,original.role_id);
    assert.equal(current.file_id,original.file_id);
    assert.equal(current.occurred_at,original.occurred_at);
    assert.deepEqual(current.details,original.details);
    assert.equal(current.content,original.content);
  }
  assert.equal(createHash("sha256").update(file.bytes).digest("hex"),f.original.sha256);
  assert.deepEqual(file.bytes,f.originalBytes);
  await assert.rejects(()=>readFile(f.other,f.original.id),/not found/);
  await assert.rejects(()=>owned(f.other,"record",f.undated.id),/not found/);
  for (const saved of documents) await assert.rejects(()=>owned(f.other,"deliverable",saved.id),/not found/);
  for (const receipt of receipts.filter(item=>item.name==="save_document")) {
    const result=receipt.output as {document?:{id:string;version:number;record_ids:string[]};sources?:{records?:Array<Record<string,unknown>>}};
    if (!result.document) continue;
    const revision=versions.find(item=>item.entity_id===result.document!.id && item.version===result.document!.version);
    assert.ok(revision,"Saved document receipt matches a durable version");
    assert.deepEqual(revision.snapshot.record_ids,result.document.record_ids);
    const snapshotRecords = Array.isArray(revision.snapshot.source_snapshot.records) ? revision.snapshot.source_snapshot.records as Array<Record<string,unknown>> : [];
    for (const reference of result.sources?.records || []) {
      const source = snapshotRecords.find(item=>item.id===reference.id);
      assert.ok(source,"Each receipt source exists in the saved document version");
      for (const key of ["id","version","occurred_at","occurred_on","occurred_local_date","date_precision","period_relation"])
        assert.deepEqual(reference[key],source[key],`Receipt and saved source agree on ${key}`);
    }
  }
  return {job,conversation,documents,versions,evidence};
}

function sourcedRecord(document: Deliverable, record: SourceRecord) {
  const entries = Array.isArray(document.source_snapshot.records) ? document.source_snapshot.records as Array<Record<string,unknown>> : [];
  const found = entries.find(entry=>entry.id===record.id);
  return {found, referenced:document.record_ids.includes(record.id)};
}
async function writeOutcome(label: string, value: Record<string,unknown>) {
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/${label}-outcome.json`,JSON.stringify(value,null,2));
  console.log(JSON.stringify({label,...value}));
}

test("natural internal comparison retains the undated source without inventing a reporting period", {timeout: 900000}, async () => {
  const f = await makeFixture();
  const message = "请为这个职位的两位候选人写一份内部比较并保存，引用资料库里《林澄原始沟通备注（无日期）》作为原始依据。这是内部候选人比较，不是按周或按某个周期的进展报告，也不用发送给任何人。";
  const result = await runTurn(f,"internal-comparison",message);
  const candidates = result.documents.filter(document=>document.role_id===f.role.id);
  const matched = candidates.find(document=>document.record_ids.includes(f.undated.id));
  const source = matched ? sourcedRecord(matched,f.undated) : {found:undefined,referenced:false};
  const outcome = {document_count:candidates.length,document_id:matched?.id ?? null,period_start:matched?.period_start ?? null,period_end:matched?.period_end ?? null,
    source_id:f.undated.id,source_referenced:source.referenced,source_version:source.found?.version ?? null,source_date_precision:source.found?.date_precision ?? null,
    content_mentions_both:!!matched && matched.content.includes(f.first.name) && matched.content.includes(f.second.name)};
  await writeOutcome("internal-comparison",outcome);
  assert.ok(matched,"The delegated comparison must be saved with the identified original note");
  assert.equal(matched.period_start,null,"No reporting period was requested");
  assert.equal(matched.period_end,null,"No reporting period was requested");
  assert.equal(source.found?.version,f.undated.version,"The selected note's actual version is preserved");
  assert.equal(source.found?.occurred_at,null,"An unknown source date must not become a timestamp");
});

test("natural correction revises the misclassified document in place and attaches the undated source", {timeout: 900000}, async () => {
  const f = await makeFixture(), initial = await makeMisclassifiedDocument(f);
  const message = "这份旧稿实际是内部候选人比较，不是周期进展报告。请直接在当前文档里修正这个用途并更新内容，引用资料库中《林澄原始沟通备注（无日期）》作为原始依据；保留历史版本，不要另建文档，也不要发送。";
  const result = await runTurn(f,"correct-purpose",message,initial);
  const current = result.documents.find(document=>document.id===initial.id);
  const source = current ? sourcedRecord(current,f.undated) : {found:undefined,referenced:false};
  const outcome = {original_document_id:initial.id,observed_document_ids:result.documents.map(document=>document.id),
    initial_version:initial.version,current_version:current?.version ?? null,initial_kind:initial.kind,current_kind:current?.kind ?? null,
    period_start:current?.period_start ?? null,period_end:current?.period_end ?? null,source_referenced:source.referenced,source_version:source.found?.version ?? null};
  await writeOutcome("correct-purpose",outcome);
  assert.ok(current,"The selected document remains accessible");
  assert.equal(result.documents.length,1,"A correction must not duplicate the user's document");
  assert.ok(current.version>initial.version,"The original document is revised in place");
  assert.notEqual(current.kind,initial.kind,"The incorrect reporting classification is corrected");
  assert.equal(current.period_start,null,"The corrected internal comparison has no invented period");
  assert.equal(current.period_end,null,"The corrected internal comparison has no invented period");
  assert.ok(source.referenced && source.found,"The existing undated note is cited");
  assert.equal(source.found.version,f.undated.version);
  assert.ok(result.versions.some(version=>version.entity_id===initial.id && version.version===initial.version),"The pre-correction version remains saved");
});

test("natural periodic report preserves requested period and separates dated activity from undated and older background", {timeout: 900000}, async () => {
  const f = await makeFixture();
  const message = "请保存这个职位 2026 年 10 月 19 日至 25 日的内部进展报告。引用林澄 10 月 21 日的沟通，以及已有的《林澄原始沟通备注（无日期）》和《九月历史沟通》作为背景；请分清本周实际活动与没有日期或更早的背景，不能把背景说成这周发生，也不要发送。";
  const result = await runTurn(f,"periodic-report",message);
  const doc = result.documents.find(document=>document.role_id===f.role.id && document.record_ids.includes(f.active.id));
  const activity = doc ? sourcedRecord(doc,f.active) : {found:undefined,referenced:false};
  const unknown = doc ? sourcedRecord(doc,f.undated) : {found:undefined,referenced:false};
  const historical = doc ? sourcedRecord(doc,f.old) : {found:undefined,referenced:false};
  const outcome = {document_id:doc?.id ?? null,period_start:doc?.period_start ?? null,period_end:doc?.period_end ?? null,
    period_local_start:doc?.source_snapshot.period_local_start ?? null,period_local_end:doc?.source_snapshot.period_local_end ?? null,
    source_refs:{activity:activity.referenced,undated:unknown.referenced,historical:historical.referenced},
    source_relations:{activity:activity.found?.period_relation ?? null,undated:unknown.found?.period_relation ?? null,historical:historical.found?.period_relation ?? null},
    source_versions:{activity:activity.found?.version ?? null,undated:unknown.found?.version ?? null,historical:historical.found?.version ?? null}};
  await writeOutcome("periodic-report",outcome);
  assert.ok(doc,"The requested progress report must be saved with the dated activity");
  assert.equal(doc.source_snapshot.period_local_start,"2026-10-19");
  assert.equal(doc.source_snapshot.period_local_end,"2026-10-25");
  assert.ok(activity.found && unknown.found && historical.found,"Explicitly selected current and background sources remain traceable");
  for (const [actual,record] of [[activity.found,f.active],[unknown.found,f.undated],[historical.found,f.old]] as const) assert.equal(actual.version,record.version);
  assert.ok(activity.found.period_relation && unknown.found.period_relation && historical.found.period_relation,"The saved source snapshot states the relationship to the reporting period");
  assert.equal(activity.found.period_relation,"in_period");
  assert.equal(unknown.found.period_relation,"undated");
  assert.equal(historical.found.period_relation,"outside_period");
  assert.equal(unknown.found.occurred_at,null);
});

test("audit an already-observed periodic report without another model call", {skip:!process.env.WORKSPACE_DOC_QA_EVIDENCE}, async () => {
  const evidencePath = process.env.WORKSPACE_DOC_QA_EVIDENCE!;
  assert.ok(evidencePath.startsWith("output/workspace-document-purpose/") && !evidencePath.includes(".."));
  const prior = JSON.parse(await readEvidenceFile(evidencePath,"utf8")) as {
    owner:string;job_id:string;conversation_id:string;status:string;file_sha256:string;
    fixture:{undated_id:string;old_id:string;active_id:string;original_file_id:string};
    documents:Deliverable[];original_records:SourceRecord[];steps:Step[];provider_requests:ProviderRequest[];
    receipts:Array<{name:string;output:unknown}>;
  };
  assert.equal(prior.status,"done");
  const {observations,completed,missing,malformed} = checkToolObservations(prior.steps,prior.provider_requests);
  assert.deepEqual(missing,[]); assert.deepEqual(malformed,[]);
  const job = await owned<Job>(prior.owner,"job",prior.job_id);
  assert.equal(job.status,"done");
  assert.equal(prior.documents.length,1);
  const document = await owned<Deliverable>(prior.owner,"deliverable",prior.documents[0].id);
  assert.equal(document.version,prior.documents[0].version);
  assert.equal(document.status,"draft");
  assert.equal(document.source_snapshot.period_local_start,"2026-10-19");
  assert.equal(document.source_snapshot.period_local_end,"2026-10-25");
  const source = Array.isArray(document.source_snapshot.records) ? document.source_snapshot.records as Array<Record<string,unknown>> : [];
  const expected = [
    {id:prior.fixture.active_id,relation:"in_period"},
    {id:prior.fixture.old_id,relation:"outside_period"},
    {id:prior.fixture.undated_id,relation:"undated"},
  ];
  for (const item of expected) {
    assert.ok(document.record_ids.includes(item.id));
    const entry=source.find(record=>record.id===item.id), saved=prior.original_records.find(record=>record.id===item.id);
    assert.ok(entry && saved);
    assert.equal(entry.version,saved.version); assert.equal(entry.period_relation,item.relation);
    const actual=await owned<SourceRecord>(prior.owner,"record",item.id);
    assert.equal(actual.version,saved.version); assert.equal(actual.occurred_at,saved.occurred_at);
    assert.equal(actual.file_id,saved.file_id); assert.equal(actual.content,saved.content); assert.deepEqual(actual.details,saved.details);
  }
  const undated=source.find(record=>record.id===prior.fixture.undated_id)!;
  assert.equal(undated.occurred_at,null); assert.equal(undated.occurred_on,null); assert.equal(undated.date_precision,"unknown");
  const file=await readFile(prior.owner,prior.fixture.original_file_id);
  assert.equal(createHash("sha256").update(file.bytes).digest("hex"),prior.file_sha256);
  await assert.rejects(()=>readFile(randomUUID(),file.id),/not found/);
  await assert.rejects(()=>owned(randomUUID(),"deliverable",document.id),/not found/);
  const versions=await rows<{version:number;snapshot:Deliverable}>(sql`SELECT version,snapshot FROM hirelix_private_versions WHERE user_id=${prior.owner}::uuid AND entity_type='deliverable' AND entity_id=${document.id}::uuid ORDER BY version`);
  for (const receipt of prior.receipts.filter(item=>item.name==="save_document")) {
    const output=receipt.output as {document:{id:string;version:number;record_ids:string[]};sources:{records:Array<Record<string,unknown>>}};
    const revision=versions.find(item=>item.version===output.document.version);
    assert.ok(revision); assert.equal(output.document.id,document.id);
    assert.deepEqual(revision.snapshot.record_ids,output.document.record_ids);
    const records=revision.snapshot.source_snapshot.records as Array<Record<string,unknown>>;
    for (const reference of output.sources.records) {
      const item=records.find(record=>record.id===reference.id); assert.ok(item);
      for (const key of ["id","version","occurred_at","occurred_on","occurred_local_date","date_precision","period_relation"]) assert.deepEqual(reference[key],item[key]);
    }
    const calls=completed.filter(item=>item.tool===receipt.name && item.ok===true);
    assert.ok(calls.some(call=>observations.some(item=>item.tool_call_id===call.tool_call_id && (item.content as {ok?:boolean})?.ok===true && isDeepStrictEqual((item.content as {result?:unknown}).result,receipt.output))),"Actual receipt reached the model unchanged");
  }
  const notifications=await rows(sql`SELECT id FROM hirelix_private_notifications WHERE user_id=${prior.owner}::uuid AND request_key=${`job-ready:${job.id}`} AND href=${`/app?conversation=${prior.conversation_id}`}`);
  assert.equal(notifications.length,1);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_document_shares WHERE user_id=${prior.owner}::uuid`)).length,0);
  assert.equal((await rows(sql`SELECT id FROM hirelix_private_email_deliveries WHERE user_id=${prior.owner}::uuid`)).length,0);
  const result={source_evidence:evidencePath,job_id:job.id,document_id:document.id,version:document.version,period:[document.source_snapshot.period_local_start,document.source_snapshot.period_local_end],
    source_relations:expected,received_tool_results:completed.length,validation_error_texts:completed.filter(item=>!!item.error).length};
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/periodic-report-audit.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,evidence:`${directory}/periodic-report-audit.json`}));
});
