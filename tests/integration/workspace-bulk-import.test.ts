import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, test} from "node:test";
import ExcelJS from "exceljs";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../../src/db/client";
import {sendMessage, conversationDetails} from "../../src/lib/workspace/conversations";
import {saveFile, readFile} from "../../src/lib/workspace/files";
import {claimJob, finishJob} from "../../src/lib/workspace/jobs";
import {createAgentTools} from "../../src/lib/workspace/agent-tools";
import {cleanupFileWorkspace} from "../../src/lib/workspace/file-execution";
import {rows} from "../../src/lib/workspace/database";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("real Docker + PG: a script reads two workbook sheets and applies normalized rows with provenance", {timeout: 120000}, async () => {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet("Group A"), second = workbook.addWorksheet("Group B");
  first.addRows([["Name", "Email"], ["Ada Example", "ada@example.test"], ["Bea Example", "bea@example.test"]]);
  second.addRows([["Name", "Email"], ["Cora Example", "cora@example.test"], ["Ada Example", "ada@example.test"]]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const source = await saveFile(owner, {name: "candidates.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes});
  const instruction = "Save the candidates from this workbook to my library, keeping the original source.";
  const sent = await sendMessage(owner, {message: instruction, file_ids: [source.id], request_key: randomUUID()});
  const job = await claimJob(["chat"], {id: sent.job.id, userId: owner}); assert(job);
  const conversation = await conversationDetails(owner, sent.conversation_id);
  const question = conversation.messages.find(message => message.id === job.payload.message_id)!;
  const tools = createAgentTools({job, conversation: conversation.conversation, question, messages: [], document: null, attachments: [], locale: "en", timezone: "UTC", signal: new AbortController().signal, progress: async () => {}, sources: new Map(), clarification: null});
  const bash = tools.bash as unknown as {execute: (input: unknown, options: {toolCallId:string}) => Promise<{ok:boolean;result?:{outputs:Array<{file_id:string;sha256:string}>}} >};
  const batch = tools.save_records_batch as unknown as {execute: (input: unknown, options: {toolCallId:string}) => Promise<{ok:boolean;result?:{status:string;result:{counts:Record<string,number>;result_file_id:string}}}>};
  const read = tools.read_file as unknown as {execute: (input: unknown, options: {toolCallId:string}) => Promise<{ok:boolean;result?:{text:string}}>};
  const script = `const ExcelJS = require('exceljs');\nconst fs = require('fs');\n(async () => {\n const book = new ExcelJS.Workbook();\n await book.xlsx.readFile('/inputs/${source.id}.xlsx');\n const out = [];\n for (const sheet of book.worksheets) sheet.eachRow((row, number) => {\n  if (number === 1) return;\n  out.push(JSON.stringify({input:{person_id:null,expected_version:null,changes:{name:row.getCell(1).text,email:row.getCell(2).text},source_file_id:'${source.id}',separate_candidate_quote:null},source:{file_id:'${source.id}',archive_path:null,page:null,row:number,sheet:sheet.name}}));\n });\n fs.writeFileSync('/work/normalized.jsonl',out.join('\\n')+'\\n');\n})().catch(error => {console.error(error); process.exitCode=1;});`;
  try {
    const transformed = await bash.execute({command: `node - <<'NODE'\n${script}\nNODE`, input_file_ids: [source.id], output_paths: ["/work/normalized.jsonl"]}, {toolCallId: randomUUID()});
    assert.equal(transformed.ok, true);
    const output = transformed.result!.outputs[0];
    const result = await batch.execute({write_operation: "save_candidate", input_file: {file_id: output.file_id, sha256: output.sha256}, authorization_quote: instruction}, {toolCallId: randomUUID()});
    assert.equal(result.ok, true); assert.equal(result.result?.status, "done");
    assert.deepEqual(result.result?.result.counts, {applied: 3, unchanged: 0, conflict: 1, failed: 0, unprocessed: 0});
    const report = await read.execute({file_id: result.result!.result.result_file_id, offset: 0}, {toolCallId: randomUUID()});
    assert.equal(report.ok, true); assert.match(report.result!.text, /"conflict"/);
    const people = await rows<{id:string;name:string}>(sql`SELECT id,name FROM hirelix_agent_people WHERE user_id=${owner}::uuid ORDER BY name`);
    assert.deepEqual(people.map(person => person.name), ["Ada Example", "Bea Example", "Cora Example"]);
    const records = await rows<{person_id:string;file_id:string;details:{declared_source:{sheet:string;row:number}}}>(sql`SELECT person_id,file_id,details FROM hirelix_private_records WHERE user_id=${owner}::uuid AND kind='profile' ORDER BY person_id`);
    assert.equal(records.length, 3);
    assert.ok(records.every(record => record.file_id === source.id));
    assert.deepEqual(new Set(records.map(record => record.details.declared_source.sheet)), new Set(["Group A", "Group B"]));
    assert.ok(records.every(record => record.details.declared_source.row >= 2));
    assert.deepEqual((await readFile(owner, source.id)).bytes, bytes);
    await assert.rejects(() => readFile(randomUUID(), source.id), /not found/);
    await finishJob(job, {result: {tested: true}});
  } finally { await cleanupFileWorkspace({userId: owner, conversationId: sent.conversation_id, jobId: job.id, leaseKey: job.lease_token!}); }
});
