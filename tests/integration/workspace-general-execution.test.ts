import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile as readEvidenceFile, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { getGlobalDispatcher } from "undici";
import { strToU8, zipSync } from "fflate";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { agentCreditContext, executionTrace } from "../../src/lib/agent-credit-context";
import { getDefaultLlmModel, isUsingOfficialDeepSeek } from "../../src/lib/llm-client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { conversationDetails, sendMessage, assistantReply } from "../../src/lib/workspace/conversations";
import { enqueue, rows } from "../../src/lib/workspace/database";
import { readArchiveEntry } from "../../src/lib/workspace/document-reader";
import { readFile, uploadConversationFile } from "../../src/lib/workspace/files";
import { claimJob, failJob, finishJob, withJobLease } from "../../src/lib/workspace/jobs";
import { personDetails } from "../../src/lib/workspace/people";
import { closeTurnChannel } from "../../src/lib/workspace/turn-channel";
import { workspaceHandlers } from "../../src/lib/workspace/worker";
import type { Job } from "../../src/lib/workspace/types";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname === "/hirelix_workspace_qa_coldstart_20261027", "This test uses only the isolated local QA database");
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
assert.ok(isUsingOfficialDeepSeek(), "This test must use the official DeepSeek provider");
initializeGlobalOutboundProxy();
const owner = process.env.WORKSPACE_QA_OWNER || randomUUID();
assert.match(owner, /^[0-9a-f-]{36}$/i);
const directory = `output/workspace-general-execution/${new Date().toISOString().replaceAll(":", "-")}-${owner.slice(0, 8)}`;
const originalFetch = globalThis.fetch;
type ToolMessage = {tool_call_id: string; content: unknown};
type RequestEvidence = {job_id?: string; status: number; model: string; request_contains: string[]; tool_messages: ToolMessage[]};
const transport: RequestEvidence[] = [];
const requestMarkers = new Map<string, string[]>();

// Observe the real provider request after SDK serialization. Never inspect or
// store headers, credentials, or response bodies; all test source text is synthetic.
globalThis.fetch = async (url, init) => {
  const target = new URL(typeof url === "string" || url instanceof URL ? url.toString() : url.url);
  const body = typeof init?.body === "string" && target.hostname === "api.deepseek.com" && target.pathname.endsWith("/chat/completions")
    ? JSON.parse(init.body) as {model: string; messages: Array<{role: string; content: unknown; tool_call_id?: string}>} : null;
  const job_id = agentCreditContext.getStore()?.id;
  const response = await originalFetch(url, init);
  if (body && Array.isArray(body.messages)) {
    const serialized = JSON.stringify(body.messages);
    const tool_messages = body.messages.filter(message => message.role === "tool" && typeof message.tool_call_id === "string").map(message => {
      let content = message.content;
      if (typeof content === "string") { try { content = JSON.parse(content); } catch { /* Preserve malformed payload as evidence. */ } }
      return {tool_call_id: message.tool_call_id!, content};
    });
    transport.push({job_id, status: response.status, model: body.model, request_contains: (requestMarkers.get(job_id || "") || []).filter(marker => serialized.includes(marker)), tool_messages});
  }
  return response;
};
after(async () => {
  globalThis.fetch = originalFetch;
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeTurnChannel();
  await closeDb();
  await getGlobalDispatcher().close();
});

async function ownedJob(id: string) {
  const [job] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND id=${id}::uuid`);
  return job;
}
async function runJob(job: Job, handler: NonNullable<typeof workspaceHandlers["chat"]>) {
  const claimed = await claimJob([job.kind], {id: job.id, userId: owner});
  assert.ok(claimed);
  try {
    await withJobLease(claimed, async (signal, progress) => {
      const result = await agentCreditContext.run({...claimed, trace: executionTrace(claimed), signal}, () => handler(claimed, progress));
      signal.throwIfAborted();
      await finishJob(claimed, result);
    });
  } catch (error) {
    await failJob(claimed, "Real-chain QA execution failed");
    throw error;
  }
  return ownedJob(job.id);
}

type Step = {tools: string[]; results: Array<{tool: string; tool_call_id?: string; ok?: boolean}>};
async function verifySourceObservations(steps: Step[], requests: RequestEvidence[]) {
  const observed = requests.filter(request => request.status >= 200 && request.status < 300).flatMap(request => request.tool_messages);
  const checks: Array<{tool_call_id:string;file_id:string;archive_path:string|null;matches:boolean}> = [];
  for (const result of steps.flatMap(step => step.results).filter(item => item.tool === "read_file" && item.ok === true && item.tool_call_id)) {
    const message = observed.find(item => item.tool_call_id === result.tool_call_id);
    const value = (message?.content as {result?:{file_id?:string|null;archive_path?:string|null;name?:string;text?:string;offset?:number}})?.result;
    if (!value?.file_id || typeof value.text !== "string") continue;
    const name = value.archive_path || value.name || "";
    if (!/\.(txt|csv|tsv|md|json|html|xml)$/i.test(name)) continue;
    const original = await readFile(owner,value.file_id);
    const bytes = value.archive_path ? readArchiveEntry(original,value.archive_path).bytes : original.bytes;
    const content = new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/^\uFEFF/, "").replaceAll("\u0000", "");
    const offset = value.offset || 0;
    checks.push({tool_call_id:result.tool_call_id!,file_id:value.file_id,archive_path:value.archive_path || null,matches:value.text === content.slice(offset,offset+100000)});
  }
  return checks;
}
async function observeTurn(label: string, message: string, fileIds: string[], conversationId?: string) {
  const sent = await sendMessage(owner, {message, conversation_id: conversationId, locale: "zh", timezone: "Asia/Shanghai", request_key: randomUUID(), file_ids: fileIds});
  requestMarkers.set(sent.job.id, [message, ...fileIds]);
  let failure: unknown;
  try { await runJob(sent.job, assistantReply); } catch (error) { failure = error; }
  const job = await ownedJob(sent.job.id), details = await conversationDetails(owner, sent.conversation_id);
  const requests = transport.filter(event => event.job_id === sent.job.id);
  const steps = (job.result?.agent_steps || []) as Step[];
  const actualResults = steps.flatMap(step => step.results).filter(item => item.tool_call_id);
  const observed = requests.filter(request => request.status >= 200 && request.status < 300).flatMap(request => request.tool_messages);
  const missing = actualResults.filter(result => !observed.some(message => message.tool_call_id === result.tool_call_id));
  const structurallyWrong = actualResults.filter(result => {
    const found = observed.find(message => message.tool_call_id === result.tool_call_id);
    if (!found || !found.content || typeof found.content !== "object") return !!found;
    const content = found.content as {ok?:unknown; result?:unknown; error?:unknown};
    return content.ok !== result.ok || (content.ok === true && !("result" in content)) || (content.ok === false && !("error" in content));
  });
  const receipts = Object.values((job.result?.tool_receipts || {}) as Record<string, {name:string;output:unknown}>);
  const receiptMismatches = receipts.filter(receipt => {
    const matchingCalls = actualResults.filter(result => result.tool === receipt.name && result.ok === true);
    if (!matchingCalls.length) return false; // An interrupted earlier attempt is not this model step.
    return !matchingCalls.some(call => observed.some(message => {
      const content = message.content as {ok?:boolean;result?:unknown};
      if (message.tool_call_id !== call.tool_call_id || content?.ok !== true) return false;
      if (receipt.name === "save_records_batch") {
        return (receipt.output as {job_id?:string})?.job_id === (content.result as {id?:string})?.id;
      }
      return isDeepStrictEqual(receipt.output, content.result);
    }));
  });
  const sourceChecks = await verifySourceObservations(steps,requests);
  const evidence = {label, model: getDefaultLlmModel(), owner, job_id: job.id, conversation_id: sent.conversation_id, job_status: job.status,
    error_type: failure instanceof Error ? failure.name : null, request: message, files: fileIds,
    reply: details.messages.filter(message => message.role === "assistant").at(-1)?.content ?? null,
    steps, receipts: job.result?.tool_receipts ?? {}, transport: requests, missing_tool_results: missing,
    malformed_tool_results: structurallyWrong, receipt_mismatches: receiptMismatches, source_checks:sourceChecks};
  await mkdir(directory, {recursive: true});
  await writeFile(`${directory}/${label}.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({label, job_id: job.id, status: job.status, model: evidence.model, steps: steps.map(step => step.tools),
    requests: requests.length, missing_tool_results: missing.length, malformed_tool_results: structurallyWrong.length,
    receipt_mismatches:receiptMismatches.length, reply: evidence.reply, evidence: `${directory}/${label}.json`}));
  if (failure) throw failure;
  assert.equal(job.status, "done");
  assert.ok(requests.some(request => request.status === 200 && request.request_contains.includes(message)), "Current user instruction reaches the real provider");
  for (const fileId of fileIds) assert.ok(requests.some(request => request.status === 200 && request.request_contains.includes(fileId)), "Selected file ID reaches the real provider");
  assert.deepEqual(missing, [], "Every completed tool observation must reach a subsequent model request");
  assert.deepEqual(structurallyWrong, [], "Model-visible tool results retain their success/error structure");
  assert.deepEqual(receiptMismatches, [], "Committed tool receipts must reach the provider unchanged");
  assert.ok(sourceChecks.every(check => check.matches), "The model received the same source text as the stored file bytes");
  return {job, details, evidence, conversationId: sent.conversation_id};
}

const fixture = {
  csv: "ref,name,email,employer,position\nQA71,Marina Vale,marina.vale@qa.invalid,Juniper Bridge,Platform Lead\nQA72,Jonas Moss,jonas.moss@qa.invalid,Blue Orchard,Data Engineer\n",
  notes: "QA71 | 2024-04-10 | Marina Vale: interested in hands-on team leadership; prefers remote work.\nQA72 | 2024-05-08 | Jonas Moss: works on Python data pipelines; prefers London.\n",
  resume: "Candidate reference QA71: Marina Vale\nPlatform Lead at Juniper Bridge. Led a team of four engineers on PostgreSQL infrastructure during 2021–2024.\n",
};

test("small natural mixed-source delegation: actual model, Postgres and isolated file tools", {timeout: 900000}, async () => {
  const documents = await Promise.all([
    uploadConversationFile(owner, {name:"people-export.csv",type:"text/csv",bytes:Buffer.from(fixture.csv)}),
    uploadConversationFile(owner, {name:"old-conversations.txt",type:"text/plain",bytes:Buffer.from(fixture.notes)}),
    uploadConversationFile(owner, {name:"profile-QA71.txt",type:"text/plain",bytes:Buffer.from(fixture.resume)}),
  ]);
  const originalHashes = documents.map(file => file.sha256);
  const request = "请把这些历史候选人资料整理并保存到我的候选人库，按照资料里的编号关联对应的沟通记录和简历，保留原始资料来源。没有依据的内容不要猜，完成后说明实际处理情况。";
  const turn = await observeTurn("small-import", request, documents.map(file => file.id));
  const people = await rows<{id:string;name:string;email:string}>(sql`SELECT id,name,email FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY name`);
  const records = await rows<{id:string;person_id:string;kind:string;content:string;file_id:string|null;details:Record<string,unknown>}>(sql`SELECT id,person_id,kind,content,file_id,details FROM hirelix_private_records WHERE user_id=${owner}::uuid ORDER BY created_at`);
  const imports = await rows<{id:string;status:string;result:unknown}>(sql`SELECT id,status,result FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import'`);
  for (let index = 0; index < documents.length; index++) {
    const file = await readFile(owner, documents[index].id);
    assert.equal(createHash("sha256").update(file.bytes).digest("hex"), originalHashes[index]);
  }
  for (const record of records) assert.ok(people.some(person => person.id === record.person_id), "No imported record is attached outside the user's candidates");
  const coverage = {people, records, imports, original_ids: documents.map(file => file.id),
    candidate_count: people.length, sourced_record_count: records.filter(record => !!record.file_id).length,
    note_count: records.filter(record => record.kind === "note" || record.kind === "call").length,
    workspace_tools_used: turn.evidence.steps.flatMap(step => step.tools).filter(name => ["bash", "write_file"].includes(name))};
  await writeFile(`${directory}/small-import-persistence.json`, JSON.stringify(coverage, null, 2));
  console.log(JSON.stringify({label:"small-import-observation", candidate_count:coverage.candidate_count, sourced_record_count:coverage.sourced_record_count,
    note_count:coverage.note_count, workspace_tools_used:coverage.workspace_tools_used, imports:imports.length}));
});

async function businessSnapshot() {
  return {
    people: await rows(sql`SELECT id,version,updated_at FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY id`),
    records: await rows(sql`SELECT id,version,updated_at FROM hirelix_private_records WHERE user_id=${owner}::uuid ORDER BY id`),
    roles: await rows(sql`SELECT id,version,updated_at FROM hirelix_private_roles WHERE user_id=${owner}::uuid ORDER BY id`),
    links: await rows(sql`SELECT id,version,updated_at FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid ORDER BY id`),
    documents: await rows(sql`SELECT id,version,updated_at FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid ORDER BY id`),
    schedules: await rows(sql`SELECT id,version,updated_at FROM hirelix_private_schedules WHERE user_id=${owner}::uuid ORDER BY id`),
  };
}

test("analysis-only request does not write recruiting data", {timeout: 600000}, async () => {
  const source = await uploadConversationFile(owner, {name:"analysis-only.csv",type:"text/csv",bytes:Buffer.from(
    "Directory ID,Full name,Current role,Context\nR-802,Asha Lake,Security engineer,Works on identity security.\nR-803,Theo West,Data engineer,Maintains Python ETL jobs.\n",
  )});
  const before = await businessSnapshot();
  const turn = await observeTurn("analysis-only", "请只分析附件中两位候选人的经验并概括各自的特点；不要保存、导入、创建或修改任何候选人、记录或其他资料。", [source.id]);
  const afterState = await businessSnapshot();
  await writeFile(`${directory}/analysis-only-persistence.json`, JSON.stringify({before, after:afterState, steps:turn.evidence.steps}, null, 2));
  assert.deepEqual(afterState, before, "Analysis cannot create, change or remove business records");
});

test("saved candidate and source can be read after owner-scoped indexing and in a later conversation", {timeout: 900000}, async (t) => {
  const [person] = await rows<{id:string;name:string}>(sql`SELECT id,name FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND email='marina.vale@qa.invalid'`);
  if (!person) { t.skip("The small model scenario did not save this candidate; no later read was tested."); return; }
  const detail = await personDetails(owner, person.id);
  const sourceDetails = [];
  for (const record of detail.records) {
    if (!record.file_id) continue;
    const file = await readFile(owner, record.file_id);
    sourceDetails.push({record_id:record.id, file_id:file.id, sha256:file.sha256, name:file.name});
  }
  // Queue and claim only this synthetic owner's candidate. Never start a global worker.
  const requestedIndex = await db.transaction(tx => enqueue(owner, "index", `qa-explicit-index:${randomUUID()}`, {person_id:person.id}, tx));
  const indexing = [requestedIndex];
  const indexResults = [];
  for (const job of indexing) {
    try { const result = await runJob(job, workspaceHandlers.index!); indexResults.push({id:job.id,status:result.status}); }
    catch (error) { indexResults.push({id:job.id,status:"error",error_type:error instanceof Error ? error.name : "Unknown"}); }
  }
  const before = await businessSnapshot();
  const turn = await observeTurn("later-read", "请查阅我已保存的 Marina Vale：她的经历和我们之前的沟通记录是什么？仅查阅，不修改资料。", []);
  const afterState = await businessSnapshot();
  const observed = {person:detail.person, records:detail.records, sources:sourceDetails, index_jobs:indexResults,
    reply:turn.evidence.reply, tools:turn.evidence.steps.flatMap(step => step.tools)};
  await writeFile(`${directory}/later-read-persistence.json`, JSON.stringify(observed, null, 2));
  assert.deepEqual(afterState, before, "The later reading request must not mutate the recruiting library");
  assert.ok(sourceDetails.length, "The already persisted source remains retrievable");
  assert.ok(indexResults.every(result => result.status === "done"), "The isolated owner's actual indexing jobs must complete");
  console.log(JSON.stringify({label:"later-read-observation", source_records:sourceDetails.length, index_jobs:indexResults,
    tools:observed.tools}));
});

async function auditArchive(jobId: string) {
  const chat = await ownedJob(jobId);
  assert.ok(chat && chat.status === "done");
  const request = chat.payload.request as {file_ids:string[]};
  const sourceId = request.file_ids[0];
  const original = await readFile(owner, sourceId);
  const people = await rows<{id:string;name:string;email:string}>(sql`SELECT id,name,email FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY name`);
  const records = await rows<{id:string;person_id:string|null;kind:string;content:string;file_id:string|null;details:Record<string,unknown>}>(sql`SELECT id,person_id,kind,content,file_id,details FROM hirelix_private_records WHERE user_id=${owner}::uuid ORDER BY created_at`);
  const children = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import' AND payload->>'parent_chat_job_id'=${chat.id}`);
  const batches = [];
  for (const child of children) {
    if (child.payload.operation !== "record_batch" || child.status !== "done") continue;
    const input = child.payload.input_file as {file_id:string;sha256:string};
    const normalized = await readFile(owner,input.file_id);
    assert.equal(createHash("sha256").update(normalized.bytes).digest("hex"),input.sha256);
    const normalizedLines = normalized.bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line) as {input:{changes?:{name?:string;email?:string}};source:Record<string,unknown>});
    const state = child.result?.record_batch as {total:number;counts:Record<string,number>;result_file_id:string;result_file_sha256:string};
    const reportFile = await readFile(owner,state.result_file_id);
    assert.equal(createHash("sha256").update(reportFile.bytes).digest("hex"),state.result_file_sha256);
    const receipts = await rows<{row_number:number;batch_receipt:{status:string;result?:{person_id?:string}}}>(sql`SELECT row_number,batch_receipt FROM hirelix_private_import_rows WHERE user_id=${owner}::uuid AND job_id=${child.id}::uuid ORDER BY row_number`);
    assert.equal(receipts.length,state.total); assert.equal(normalizedLines.length,state.total);
    for (const receipt of receipts) {
      if (receipt.batch_receipt.status !== "applied" || !receipt.batch_receipt.result?.person_id) continue;
      const person = people.find(item => item.id === receipt.batch_receipt.result!.person_id);
      assert.ok(person, "A successful receipt identifies an owned stored candidate");
      const line = normalizedLines[receipt.row_number-1];
      if (line.input.changes?.name) assert.equal(person.name,line.input.changes.name);
      if (line.input.changes?.email) assert.equal(person.email,line.input.changes.email);
      const provenance = records.find(record => record.person_id === person.id &&
        (record.details.declared_source as {normalized_file_id?:string;normalized_line?:number} | undefined)?.normalized_file_id === input.file_id &&
        (record.details.declared_source as {normalized_line?:number}).normalized_line === receipt.row_number)?.details.declared_source as Record<string,unknown> | undefined;
      if (provenance) for (const key of ["file_id","archive_path","page","row","sheet"]) assert.deepEqual(provenance[key],line.source[key]);
    }
    const statusCounts = {applied:0,unchanged:0,conflict:0,failed:0,unprocessed:0};
    for (const receipt of receipts) if (receipt.batch_receipt.status in statusCounts) statusCounts[receipt.batch_receipt.status as keyof typeof statusCounts]++;
    assert.deepEqual(statusCounts,state.counts);
    batches.push({job_id:child.id,status:child.status,total:state.total,counts:state.counts,input_file:input,result_file_id:state.result_file_id});
  }
  let preservedEntries = 0;
  for (const record of records) {
    if (record.details.source_archive_file_id !== sourceId || typeof record.details.source_archive_path !== "string" || !record.file_id) continue;
    const entry = readArchiveEntry(original,record.details.source_archive_path);
    assert.deepEqual((await readFile(owner,record.file_id)).bytes,Buffer.from(entry.bytes));
    preservedEntries++;
  }
  return {source_file_id:sourceId,source_sha256:original.sha256,people,records,batches,preserved_archive_entries:preservedEntries};
}

test("natural archive delegation with an independently arranged candidate table and event files", {timeout: 1200000}, async () => {
  const candidates = Array.from({length: 26}, (_, index) => {
    const n = index + 1;
    return {key:`EX-${400+n}`, name:`QA Person ${String(n).padStart(2,"0")}`, email:`qa-person-${n}@example.test`, role: n % 2 ? "Software Engineer" : "Data Analyst"};
  });
  const table = `Reference,Person,Email address,Position\n${candidates.map(item => `${item.key},${item.name},${item.email},${item.role}`).join("\n")}\n`;
  const activity = "Person Ref,Date,Communication\nEX-401,2023-02-10,Discussed platform team leadership.\nEX-402,2023-03-12,Prefers analytics roles in London.\n";
  const bio = "Candidate reference EX-401\nQA Person 01 was a software engineer at Cedar Gate from 2020 to 2023, focusing on distributed data systems.\n";
  const bytes = Buffer.from(zipSync({
    "exports/contacts-v3.csv":strToU8(table),
    "activity/chronology.csv":strToU8(activity),
    "documents/by-ref/EX-401.txt":strToU8(bio),
  }));
  const source = await uploadConversationFile(owner, {name:"historical-material.zip",type:"application/zip",bytes});
  const before = await rows<{id:string}>(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);
  const turn = await observeTurn("archive-import", "请把这个压缩包里的历史候选人整理并保存到我的候选人库，按资料中的编号关联沟通记录和档案，保留原始来源。不要猜测缺失信息；完成后如实说明已处理和未处理的部分。", [source.id]);
  const beforeIds = new Set(before.map(item => item.id));
  const people = (await rows<{id:string;name:string;email:string}>(sql`SELECT id,name,email FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY name`)).filter(item => !beforeIds.has(item.id));
  const peopleIds = new Set(people.map(person => person.id));
  const records = (await rows<{id:string;person_id:string|null;kind:string;content:string;file_id:string|null;details:Record<string,unknown>}>(sql`SELECT id,person_id,kind,content,file_id,details FROM hirelix_private_records WHERE user_id=${owner}::uuid ORDER BY created_at`)).filter(record => !!record.person_id && peopleIds.has(record.person_id));
  const childJobs = await rows<{id:string;status:string;payload:Record<string,unknown>;result:Record<string,unknown>}>(sql`SELECT id,status,payload,result FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import' AND payload->>'parent_chat_job_id'=${turn.job.id}`);
  assert.deepEqual((await readFile(owner, source.id)).bytes, bytes, "The original ZIP remains unchanged");
  for (const record of records) if (record.file_id) await readFile(owner, record.file_id);
  const expectedEmails = new Set(candidates.map(candidate => candidate.email));
  const relatedRecords = records.filter(record => /EX-401|EX-402/.test(record.content));
  const report = {expected_count:candidates.length, observed_people:people, records, child_jobs:childJobs,
    matching_emails:people.filter(person => expectedEmails.has(person.email)).length,
    related_records:relatedRecords.length, source_file_id:source.id,
    workspace_tools_used:turn.evidence.steps.flatMap(step => step.tools).filter(name => ["bash","write_file"].includes(name)),
    audit:await auditArchive(turn.job.id)};
  await writeFile(`${directory}/archive-import-persistence.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({label:"archive-import-observation", expected_count:report.expected_count, observed_people:people.length,
    matching_emails:report.matching_emails, related_records:report.related_records, child_jobs:childJobs.length, workspace_tools_used:report.workspace_tools_used}));
});

test("audit a completed isolated archive attempt without another model call", {skip: !process.env.WORKSPACE_QA_AUDIT_JOB}, async () => {
  const id = process.env.WORKSPACE_QA_AUDIT_JOB!;
  assert.match(id,/^[0-9a-f-]{36}$/i);
  const report = await auditArchive(id);
  const evidenceFile = process.env.WORKSPACE_QA_TRANSPORT;
  const sourceChecks = evidenceFile ? await (async () => {
    assert.ok(evidenceFile.startsWith("output/workspace-general-execution/") && !evidenceFile.includes(".."));
    const evidence = JSON.parse(await readEvidenceFile(evidenceFile,"utf8")) as {job_id:string;steps:Step[];transport:RequestEvidence[]};
    assert.equal(evidence.job_id,id);
    const checks = await verifySourceObservations(evidence.steps,evidence.transport);
    assert.ok(checks.length > 0 && checks.every(check => check.matches));
    return checks;
  })() : [];
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/archive-persistence-audit.json`,JSON.stringify({...report,source_checks:sourceChecks},null,2));
  console.log(JSON.stringify({label:"archive-persistence-audit",people:report.people.length,records:report.records.length,
    batches:report.batches,preserved_archive_entries:report.preserved_archive_entries,source_checks:sourceChecks.length,evidence:`${directory}/archive-persistence-audit.json`}));
});

test("index only the completed archive owner's candidates with real index jobs", {skip: process.env.WORKSPACE_QA_ARCHIVE_INDEX !== "true",timeout: 900000}, async () => {
  const people = await rows<{id:string;name:string}>(sql`SELECT id,name FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND email LIKE 'qa-person-%@example.test' ORDER BY name`);
  assert.ok(people.length, "The selected QA owner has archive candidates to index");
  const indexJobs: Job[] = [];
  for (const person of people) indexJobs.push(await db.transaction(tx => enqueue(owner,"index",`qa-archive-index:${randomUUID()}`,{person_id:person.id},tx)));
  let next = 0;
  const indexResults: Array<{id:string;person_id:string;status:string;error_type?:string}> = [];
  async function worker() {
    while (next < indexJobs.length) {
      const job = indexJobs[next++];
      try {
        const result = await runJob(job,workspaceHandlers.index!);
        indexResults.push({id:job.id,person_id:String(job.payload.person_id),status:result.status});
      } catch (error) {
        indexResults.push({id:job.id,person_id:String(job.payload.person_id),status:"error",error_type:error instanceof Error ? error.name : "Unknown"});
      }
    }
  }
  await Promise.all([worker(),worker()]);
  const indexed = await rows<{person_id:string}>(sql`SELECT DISTINCT person_id FROM hirelix_private_embeddings WHERE user_id=${owner}::uuid`);
  const indexedIds = new Set(indexed.map(row => row.person_id));
  const missing = people.filter(person => !indexedIds.has(person.id));
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/archive-index.json`,JSON.stringify({people,indexResults,missing},null,2));
  console.log(JSON.stringify({label:"archive-index",requested:people.length,done:indexResults.filter(item => item.status === "done").length,
    errors:indexResults.filter(item => item.status !== "done"),missing:missing.length,evidence:`${directory}/archive-index.json`}));
  assert.ok(indexResults.every(item => item.status === "done"));
  assert.equal(missing.length,0,"Each indexed candidate has real saved embeddings");
});
