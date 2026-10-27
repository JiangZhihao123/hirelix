import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { boundedArchive, readDocument } from "../src/lib/workspace/document-reader";
import { readCandidateTables } from "../src/lib/workspace/candidate-tables";

test("candidate CSV/TSV preserve every column, quoted newlines, UTF-8 and all rows", async () => {
  const csv = Buffer.from('\ufeffName,Notes,External ID\n"张,宁","2020 call\nDo not share",001\n');
  const [table] = await readCandidateTables({ name: "candidates.csv", bytes: csv });
  assert.deepEqual(table.rows[0].fields, { Name: "张,宁", Notes: "2020 call\nDo not share", "External ID": "001" });
  const tsv = Buffer.from(`Name\tEmail\n${Array.from({length: 1000}, (_, i) => `Person ${i}\t${i}@example.test`).join("\n")}`);
  assert.equal((await readCandidateTables({ name: "people.tsv", bytes: tsv }))[0].rows.length, 1000);
  await assert.rejects(() => readCandidateTables({ name: "bad.csv", bytes: Buffer.from([0xff]) }), /UTF-8/);
  await assert.rejects(() => readCandidateTables({ name: "bad.csv", bytes: Buffer.from("Name,\nA,B") }), /non-empty/);
  await assert.rejects(() => readCandidateTables({ name: "bad.csv", bytes: Buffer.from("Name,Email\nA,B,C") }), /consistent/);
  await assert.rejects(() => readCandidateTables({ name: "bad.csv", bytes: Buffer.from("Name\nA\x00B") }), /NUL/);
});

test("duplicate labels retain both values and original column positions", async () => {
  const [table] = await readCandidateTables({name: "export.csv", bytes: Buffer.from(' Name ,Name,Name [column 1],Email\n"Jamie Example",Jamie,third,jamie@example.test\n')});
  assert.deepEqual(table.columns.map(column => column.original_header), [" Name ", "Name", "Name [column 1]", "Email"]);
  assert.deepEqual(table.columns.map(column => column.position), [1, 2, 3, 4]);
  assert.equal(new Set(table.headers).size, 4);
  assert.deepEqual(Object.values(table.rows[0].fields), ["Jamie Example", "Jamie", "third", "jamie@example.test"]);
});

test("Recruit CRM export with translated duplicate labels keeps every source field", async () => {
  // Header layout came from a real Recruit CRM trial export; contact details,
  // owner and platform identifiers are sanitized in this committed fixture.
  const bytes = await readFile("tests/fixtures/platform-exports/recruit-crm-candidates-zh.csv");
  const [table] = await readCandidateTables({name: "recruit-crm.csv", bytes});
  assert.equal(table.columns.length, 51);
  assert.equal(table.rows.length, 1);
  assert.equal(Object.keys(table.rows[0].fields).length, 51);
  const nameColumns = table.columns.filter(column => column.original_header === "候选人姓名");
  assert.deepEqual(nameColumns.map(column => column.position), [2, 3]);
  assert.deepEqual(nameColumns.map(column => table.rows[0].fields[column.key]), ["William Sample", "William"]);
});

test("XLSX keeps multiple independent sheets, complete rows and original row numbers", async () => {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet("Past contacts");
  first.addRow(["Name", "Email", "Original note"]);
  for (let i = 0; i < 250; i++) first.addRow([`Person ${i}`, `${i}@example.test`, "Contacted in 2021"]);
  const second = workbook.addWorksheet("Other team");
  second.getRow(3).values = ["First name", "Surname", "External ID"];
  second.getRow(6).values = ["Avery", "Quinn", "00002"];
  workbook.addWorksheet("Empty");
  const tables = await readCandidateTables({ name: "crm.xlsx", bytes: new Uint8Array(await workbook.xlsx.writeBuffer()) });
  assert.equal(tables.length, 2);
  assert.equal(tables[0].rows.length, 250);
  assert.equal(tables[1].rows[0].line, 6);
  assert.equal(tables[1].rows[0].fields["External ID"], "00002");
  assert.deepEqual(tables[1].headers, ["First name", "Surname", "External ID"]);
});

test("table limits and unresolved formula values fail before partial extraction", async () => {
  await assert.rejects(() => readCandidateTables({ name: "large.csv", bytes: Buffer.from(`Name\n${"Candidate\n".repeat(10001)}`) }), /10,000/);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Candidates");
  sheet.addRow(["Name", "Total"]);
  sheet.addRow(["Avery Quinn", { formula: "1+1" }]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  await assert.rejects(() => readCandidateTables({ name: "formula.xlsx", bytes }), /recalculate/);
});

test("candidate archives expose inventory without treating it as source text and reject duplicate paths", async () => {
  const bytes = zipSync({ "a.txt": strToU8("first"), "b.txt": strToU8("second") });
  const inventory = await readDocument({ name: "candidates.zip", bytes });
  assert.match(inventory.text, /Enclosed file contents have not been read/);
  assert.match(inventory.text, /a.txt/);
  assert.doesNotMatch(inventory.text, /first/);
  const duplicate = Buffer.from(bytes);
  let index = duplicate.indexOf("b.txt");
  while (index >= 0) { duplicate.write("a.txt", index); index = duplicate.indexOf("b.txt", index + 5); }
  assert.throws(() => boundedArchive(duplicate), /duplicate file paths/);
});
