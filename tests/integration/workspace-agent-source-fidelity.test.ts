// Real PDF/image decoding, agent tools and PG; visual transcription is controlled.
// Run with node --experimental-test-module-mocks --import tsx --test.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, mock, test} from "node:test";
import {PDFDocument, StandardFonts} from "pdf-lib";
import sharp from "sharp";
import {strToU8, zipSync} from "fflate";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const owner = randomUUID();
let visualCalls = 0;
const ready = (async () => {
  const vision = await import("../../src/lib/workspace/vision");
  mock.module("../../src/lib/workspace/vision.ts", {namedExports: {...vision, transcribeImages: async () => {visualCalls++; return "Controlled model transcription";}}});
  const ai = await import("../../src/lib/workspace/ai");
  mock.module("../../src/lib/workspace/ai.ts", {namedExports: {...ai, structured: async () => {throw new Error("Unexpected second source transcription");}}});
  const conversations = await import("../../src/lib/workspace/conversations");
  const jobs = await import("../../src/lib/workspace/jobs");
  const databaseModule = await import("../../src/lib/workspace/database");
  const connection = await import("../../src/db/client");
  const files = await import("../../src/lib/workspace/files");
  const tools = await import("../../src/lib/workspace/agent-tools");
  const drizzle = await import("drizzle-orm");
  return {...conversations, ...jobs, ...databaseModule, ...connection, ...files, ...tools, sql: drizzle.sql};
})();
after(async () => {
  const s = await ready;
  await s.db.execute(s.sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await s.closeDb(); mock.restoreAll();
});

test("native PDF text survives read and role save; model transcriptions are clearly labeled", {timeout: 30000}, async () => {
  const s = await ready;
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const exact = "Original requirements: build a platform, manage five engineers, and preserve all supplied conditions.";
  pdf.addPage().drawText(exact, {font, size: 10});
  const originalPdf = await s.saveFile(owner, {name: "source.pdf", type: "application/pdf", bytes: await pdf.save()});
  const instruction = "Save this role and preserve the original requirements.";
  const sent = await s.sendMessage(owner, {message: instruction, file_ids: [originalPdf.id], request_key: randomUUID()});
  const job = await s.claimJob(["chat"], {id: sent.job.id, userId: owner}); assert(job);
  const details = await s.conversationDetails(owner, sent.conversation_id), question = details.messages.find(message => message.id === job.payload.message_id)!;
  const tools = s.createAgentTools({job, conversation: details.conversation, question, messages: [], document: null, attachments: [], locale: "en", timezone: "UTC", signal: new AbortController().signal, progress: async () => {}, sources: new Map(), clarification: null});
  const read = tools.read_file as unknown as {execute: (input: unknown, options: {toolCallId:string}) => Promise<{ok:boolean;result?:{text:string;truncated:boolean}}>};
  const save = tools.save_role as unknown as {execute: (input: unknown, options: {toolCallId:string}) => Promise<{ok:boolean;result?:{role:{id:string;jd_text:string}}}>};
  const extracted = await read.execute({file_id: originalPdf.id, offset: 0}, {toolCallId: randomUUID()});
  assert.equal(extracted.ok, true); assert.equal(extracted.result?.truncated, false);
  assert.match(extracted.result!.text, /Original requirements: build a platform/);
  assert.match(extracted.result!.text, /manage five engineers/);
  assert.equal(visualCalls, 0, "a text PDF does not need visual transcription");
  const result = await save.execute({operation: "create", authorization_quote: instruction, role: {title: `Source QA ${owner}`, client_name: "Source QA", jd_text: "placeholder", brief: {priorities: [], flexible: [], unknowns: []}}, source_file_id: originalPdf.id, notes: [], create_anyway: false}, {toolCallId: randomUUID()});
  assert.equal(result.ok, true);
  assert.equal(result.result!.role.jd_text, extracted.result!.text, "the saved JD must use native extracted text, not a second model rewrite");
  const [saved] = await s.rows<{content:string;file_id:string}>(s.sql`SELECT content,file_id FROM hirelix_private_records WHERE user_id=${owner}::uuid AND role_id=${result.result!.role.id}::uuid AND kind='jd'`);
  assert.equal(saved.content, extracted.result!.text); assert.equal(saved.file_id, originalPdf.id);
  const image = await sharp({create: {width: 16, height: 16, channels: 3, background: "white"}}).png().toBuffer();
  const imageFile = await s.saveFile(owner, {name: "scan.png", type: "image/png", bytes: image});
  const imageRead = await read.execute({file_id: imageFile.id, offset: 0}, {toolCallId: randomUUID()});
  assert.equal(imageRead.ok, true); assert.match(imageRead.result!.text, /^Model visual transcription of original image/);
  assert.match(imageRead.result!.text, /Controlled model transcription/);
  const scanned = await PDFDocument.create(), page = scanned.addPage(), embedded = await scanned.embedPng(image);
  page.drawImage(embedded, {x: 10, y: 10, width: 100, height: 100});
  const scanFile = await s.saveFile(owner, {name: "scan.pdf", type: "application/pdf", bytes: await scanned.save()});
  const scanRead = await read.execute({file_id: scanFile.id, offset: 0}, {toolCallId: randomUUID()});
  assert.equal(scanRead.ok, true); assert.match(scanRead.result!.text, /Model visual transcription of scanned pages/);
  const archive = await s.saveFile(owner, {name: "source.zip", type: "application/zip", bytes: zipSync({"source.txt": strToU8("original")})});
  const inventory = await read.execute({file_id: archive.id, offset: 0}, {toolCallId: randomUUID()});
  assert.equal(inventory.ok, true); assert.match(inventory.result!.text, /Archive inventory only/); assert.doesNotMatch(inventory.result!.text, /import_candidates/);
  const jsonl = await s.saveFile(owner, {name: "rows.jsonl", type: "application/x-ndjson", bytes: Buffer.from('{"a":1}\n')});
  const jsonlRead = await read.execute({file_id: jsonl.id, offset: 0}, {toolCallId: randomUUID()});
  assert.equal(jsonlRead.ok, true); assert.equal(jsonlRead.result!.text, '{"a":1}\n');
  await s.finishJob(job, {result: {tested: true}});
});
