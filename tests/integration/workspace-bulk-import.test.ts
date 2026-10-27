import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile as readBytes } from "node:fs/promises";
import { after, test } from "node:test";
import ExcelJS from "exceljs";
import { zipSync, strToU8 } from "fflate";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { startImport, prepareImport, importDetails, confirmMapping, saveRequestedCandidateDrafts } from "../../src/lib/workspace/imports";
import { claimJob, finishJob, withJobLease } from "../../src/lib/workspace/jobs";
import { readFile } from "../../src/lib/workspace/files";
import { createPerson } from "../../src/lib/workspace/people";
import { rows } from "../../src/lib/workspace/database";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
assert.equal(process.env.WORKSPACE_REAL_AI_TEST, "true");
initializeGlobalOutboundProxy();
const owners: string[] = [];
after(async () => {
  for (const owner of owners) await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});
async function run(name: string, bytes: Uint8Array, save = true) {
  const owner = randomUUID(); owners.push(owner);
  const job = await startImport(owner, { name, type: "application/octet-stream", bytes }, randomUUID());
  if (save) await db.execute(sql`UPDATE hirelix_private_jobs SET payload=payload||'{"save_new_candidates":true}'::jsonb WHERE id=${job.id}::uuid`);
  const claimed = await claimJob(["import"], { id: job.id, userId: owner });
  assert.ok(claimed);
  await withJobLease(claimed, async (_, progress) => { await finishJob(claimed, await prepareImport(claimed, progress)); });
  return { owner, job, detail: await importDetails(owner, job.id) };
}
test("real model + Postgres imports every row of a 1,000-person multi-sheet XLSX, preserving sources and index work", { timeout: 180000 }, async () => {
  const book = new ExcelJS.Workbook();
  for (let sheet = 0; sheet < 2; sheet++) {
    const tab = book.addWorksheet(`Candidates ${sheet}`);
    tab.addRow(["First Name", "Last Name", "Email", "Current Title", "External ID", "History"]);
    for (let i = 0; i < 500; i++) tab.addRow([`Person${sheet}_${i}`, "QA", `p${sheet}_${i}@example.test`, "Engineer", `00-${sheet}-${i}`, "Spoke in 2020; availability now unknown"]);
  }
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());
  const { owner, job, detail } = await run("recruiter-export.xlsx", bytes);
  assert.equal(detail.job.result?.total, 1000);
  assert.deepEqual(Array.from(detail.counts), [{ status: "saved", count: 1000 }]);
  const [counts] = await rows<{people: number; records: number; indexes: number}>(sql`SELECT
    (SELECT count(*)::int FROM hirelix_agent_people WHERE user_id=${owner}::uuid) people,
    (SELECT count(*)::int FROM hirelix_private_records WHERE user_id=${owner}::uuid AND kind='profile') records,
    (SELECT count(DISTINCT payload->>'person_id')::int FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND kind='index') indexes`);
  assert.deepEqual(counts, { people: 1000, records: 1000, indexes: 1000 });
  const [last] = await rows<{raw_text: string}>(sql`SELECT raw_text FROM hirelix_private_import_rows WHERE job_id=${job.id}::uuid ORDER BY row_number DESC LIMIT 1`);
  assert.equal(JSON.parse(last.raw_text)["External ID"], "00-1-499");
  assert.match(last.raw_text, /2020/);
  assert.deepEqual((await readFile(owner, String(job.payload.file_id))).bytes, Buffer.from(bytes));
  await assert.rejects(() => importDetails(randomUUID(), job.id));
  console.log(JSON.stringify({ format: "xlsx", total: 1000, ...counts, preserved_original: true }));
});
test("real model + Postgres ZIP retains enclosed originals, handles duplicate identity, later authorization and transaction rollback", { timeout: 180000 }, async () => {
  const a = strToU8("Name,Email,Private history\nAvery Quinn,avery@example.test,Talked in 2019\n");
  const b = strToU8("Name\tEmail\nCasey Rowan\tcasey@example.test\n");
  const cv = strToU8("Candidate: Morgan Blake\nEmail: morgan@example.test\nBackend engineer in Toronto. Employment: Example Test Ltd, 2018–2022.\n");
  const bytes = zipSync({ "exports/people.csv": a, "other/people.tsv": b, "resumes/morgan.txt": cv });
  const { owner, job, detail } = await run("historical-candidates.zip", bytes, false);
  assert.equal(detail.job.result?.total, 3);
  assert.deepEqual(Array.from(detail.counts), [{ status: "review", count: 3 }]);
  const existing = await createPerson(owner, { name: "Avery Quinn", email: "avery@example.test" });
  await assert.rejects(() => db.transaction(async tx => { await saveRequestedCandidateDrafts(owner, job.id, tx); throw Error("simulate commit failure"); }), /simulate commit failure/);
  const [before] = await rows<{n:number}>(sql`SELECT count(*)::int n FROM hirelix_agent_people WHERE user_id=${owner}::uuid`);
  assert.equal(before.n, 1);
  await db.transaction(tx => saveRequestedCandidateDrafts(owner, job.id, tx));
  await db.transaction(tx => saveRequestedCandidateDrafts(owner, job.id, tx));
  const saved = await importDetails(owner, job.id);
  assert.equal(saved.counts.find(row => row.status === "saved")?.count, 2);
  assert.equal(saved.counts.find(row => row.status === "review")?.count, 1);
  assert.ok(saved.items.find(row => row.matches.some(match => match.id === existing.id)));
  for (const row of saved.items) {
    const source = await readFile(owner, row.file_id!);
    assert.notEqual(source.id, String(job.payload.file_id));
    assert.deepEqual(source.bytes, Buffer.from(source.name.endsWith("csv") ? a : source.name.endsWith("tsv") ? b : cv));
  }
  const records = await rows<{kind:string; content:string}>(sql`SELECT kind,content FROM hirelix_private_records WHERE user_id=${owner}::uuid`);
  assert.ok(records.some(record => record.kind === "profile" && record.content.includes("Casey Rowan")));
  assert.ok(records.some(record => record.kind === "cv" && record.content.includes("2018–2022")));
  console.log(JSON.stringify({ format: "zip", total: 3, saved: 2, identity_conflict: 1, original_sources: true, rollback: true, idempotent: true }));
});

test("Recruit CRM export preserves duplicate headers, candidate identity and raw source with the real model and PostgreSQL", { timeout: 180000 }, async () => {
  const bytes = await readBytes("tests/fixtures/platform-exports/recruit-crm-candidates-zh.csv");
  const { owner, job, detail } = await run("recruit-crm.csv", bytes);
  assert.equal(detail.job.result?.total, 1);
  assert.equal(detail.counts.find(row => row.status === "saved")?.count, 1);
  const item = detail.items[0];
  const raw = JSON.parse(item.raw_text) as Record<string, string>;
  assert.equal(Object.keys(raw).length, 51);
  assert.equal(raw["候选人姓名 [column 2]"], "William Sample");
  assert.equal(raw["候选人姓名 [column 3]"], "William");
  const [person] = await rows<{name:string; email:string}>(sql`SELECT name,email FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND id=${item.result_person_id}::uuid`);
  assert.equal(person.name, "William Sample");
  assert.equal(person.email, "candidate@example.test");
  const worksheets = detail.job.result?.worksheets as Array<{source_columns:Array<{original_header:string;position:number}>}>;
  assert.deepEqual(worksheets[0].source_columns.filter(column => column.original_header === "候选人姓名").map(column => column.position), [2,3]);
  assert.deepEqual((await readFile(owner, String(job.payload.file_id))).bytes, bytes);
});

test("mapped skill columns stay separate and singular contact fields reject multiple sources", { timeout: 180000 }, async () => {
  const bytes = Buffer.from("Name,Email,Skills,Languages\nJamie Example,jamie@example.test,\"Python,SQL\",\"English,French\"\n");
  const { owner, job, detail } = await run("skills.csv", bytes, false);
  const mapping = detail.job.result?.mapping as Record<string,string[]>;
  await assert.rejects(() => confirmMapping(owner, job.id, { ...mapping, email: ["Email", "Name"] }));
  await assert.rejects(() => confirmMapping(owner, job.id, { ...mapping, profile_url: ["Email", "Name"] }));
  await confirmMapping(owner, job.id, { ...mapping, name: ["Name"], email: ["Email"], skills: ["Skills", "Languages"] });
  const updated = await importDetails(owner, job.id);
  assert.deepEqual(updated.items[0].extracted.skills, ["Python", "SQL", "English", "French"]);
  await db.transaction(tx => saveRequestedCandidateDrafts(owner, job.id, tx));
  const [person] = await rows<{skills:string[]}>(sql`SELECT skills FROM hirelix_agent_people WHERE user_id=${owner}::uuid AND email='jamie@example.test'`);
  assert.deepEqual(person.skills, ["Python", "SQL", "English", "French"]);
});
