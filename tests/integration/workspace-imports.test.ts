import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, test} from "node:test";
import {Document, Packer, Paragraph} from "docx";
import {PDFDocument, StandardFonts} from "pdf-lib";
import {unzipSync, strFromU8} from "fflate";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../../src/db/client";
import {readDocument} from "../../src/lib/workspace/document-reader";
import {createPerson, updatePerson} from "../../src/lib/workspace/people";
import {addRecord} from "../../src/lib/workspace/records";
import {exportPerson, readFile, saveFile} from "../../src/lib/workspace/files";
import {conversationDetails, sendMessage} from "../../src/lib/workspace/conversations";
import {rows} from "../../src/lib/workspace/database";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_"));
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});

test("actual DOCX and PDF text extraction retains the source, and an empty PDF fails honestly", async () => {
  const docx = await Packer.toBuffer(new Document({sections: [{children: [new Paragraph("Morgan Reed"), new Paragraph("Product director with experience building enterprise software.")]}]}));
  assert.match((await readDocument({name: "candidate.docx", bytes: docx})).text, /Morgan Reed/);
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Morgan Reed - enterprise product director with extensive software experience", {font, size: 12});
  assert.match((await readDocument({name: "candidate.pdf", bytes: await pdf.save()})).text, /Morgan Reed/);
  const empty = await PDFDocument.create(); empty.addPage();
  const bytes = await empty.save();
  await assert.rejects(() => readDocument({name: "empty.pdf", bytes}), /no readable text or visual content/);
});

test("original files, candidate versions and records survive an owned export", async () => {
  const original = Buffer.from("Name,Email,Notes\nMorgan Reed,morgan@example.test,Original recruiter history\n");
  const file = await saveFile(owner, {name: "candidate.csv", type: "text/csv", bytes: original});
  const person = await createPerson(owner, {name: "Morgan Reed", email: "morgan@example.test", headline: "Product Manager", note: "Original relationship note"});
  await addRecord(owner, {person_id: person.id, kind: "profile", title: "Source row", content: "Original recruiter history", file_id: file.id});
  const updated = await updatePerson(owner, person.id, {...person, headline: "Product Director"}, person.version);
  assert.equal(updated.version, person.version + 1);
  assert.deepEqual((await readFile(owner, file.id)).bytes, original);
  await assert.rejects(() => readFile(randomUUID(), file.id), /not found/);
  const response = await exportPerson(owner, person.id), archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const profile = JSON.parse(strFromU8(archive["profile.json"]));
  assert.equal(profile.person.headline, "Product Director");
  assert.equal(profile.person.note, "Original relationship note");
  assert.ok(profile.records.some((record: {content: string}) => record.content.includes("Original recruiter history")));
  assert.ok(Object.keys(archive).some(name => name.endsWith("/candidate.csv")));
  const history = JSON.parse(strFromU8(archive["history.json"]));
  assert.ok(history.some((entry: {snapshot: {headline?: string}}) => entry.snapshot.headline === "Product Manager"));
});

test("conversation uploads are atomic, owned and idempotent without a legacy import job", async () => {
  const request = {message: "Please add this candidate to my pool.", request_key: randomUUID()};
  const file = {name: "candidates.csv", type: "text/csv", bytes: Buffer.from("Name,Email\nJordan Quinn,jordan@example.test\n")};
  const [first, again] = await Promise.all([sendMessage(owner, request, file), sendMessage(owner, request, file)]);
  assert.equal(first.job.id, again.job.id);
  assert.equal(first.conversation_id, again.conversation_id);
  const detail = await conversationDetails(owner, first.conversation_id);
  assert.equal(detail.messages.length, 1);
  const attachments = detail.messages[0].metadata.attachments as Array<{file_id: string; name: string}>;
  assert.equal(attachments[0].name, file.name);
  assert.deepEqual((await readFile(owner, attachments[0].file_id)).bytes, file.bytes);
  await assert.rejects(() => readFile(randomUUID(), attachments[0].file_id), /not found/);
  await assert.rejects(() => sendMessage(owner, {...request, message: "Different instruction"}, file), /request key/i);
  await assert.rejects(() => sendMessage(owner, request, {...file, bytes: Buffer.from("different")}), /request key/i);
  const second = await sendMessage(owner, {message: "Another file", conversation_id: first.conversation_id, request_key: randomUUID()}, {...file, name: "second.csv"});
  assert.equal(second.conversation_id, first.conversation_id);
  const [messages] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_agent_messages WHERE user_id=${owner}::uuid AND conversation_id=${first.conversation_id}::uuid AND role='user'`);
  const [imports] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='import'`);
  assert.equal(messages.count, 2); assert.equal(imports.count, 0);
  await assert.rejects(() => conversationDetails(randomUUID(), first.conversation_id), /not found/);
});
