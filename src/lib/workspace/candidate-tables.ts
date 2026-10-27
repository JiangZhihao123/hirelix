import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { boundedArchive } from "./document-reader";
import { WorkspaceError } from "./database";

export type CandidateTable = {
  name: string;
  headers: string[];
  columns: Array<{ key: string; original_header: string; position: number }>;
  rows: Array<{ line: number; fields: Record<string, string> }>;
};

// Parse every row before mapping. Only headers and a small sample go to the
// model; a spreadsheet is never reduced to one model-sized document excerpt.
export async function readCandidateTables(file: { name: string; bytes: Uint8Array }): Promise<CandidateTable[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const tables: CandidateTable[] = [];
  let count = 0;
  function table(name: string, lines: Array<{ line: number; cells: string[] }>) {
    if (!lines.length) return;
    const originalHeaders = lines[0].cells;
    const labels = originalHeaders.map(value => value.trim());
    if (!labels.length || labels.some(value => !value || value.includes("\u0000")))
      throw new WorkspaceError(`${name}: each column needs a non-empty header without NUL characters.`);
    if (labels.length > 100) throw new WorkspaceError(`${name}: import up to 100 columns per table.`);
    const counts = new Map<string, number>();
    for (const header of labels) counts.set(header, (counts.get(header) || 0) + 1);
    const used = new Set<string>();
    const columns = labels.map((header, index) => {
      // Real exports can contain duplicate labels, including after translation.
      // Keep both values and their exact source position instead of overwriting
      // a column or refusing the entire file.
      let key = counts.get(header)! > 1 ? `${header} [column ${index + 1}]` : header;
      while (used.has(key)) key += ` [column ${index + 1}]`;
      used.add(key);
      return { key, original_header: originalHeaders[index], position: index + 1 };
    });
    const headers = columns.map(column => column.key);
    const data = lines.slice(1);
    count += data.length;
    if (count > 10000) throw new WorkspaceError("Import up to 10,000 candidate rows per file across all worksheets.");
    for (const row of data) {
      if (row.cells.length > headers.length || row.cells.some(value => value.includes("\u0000")))
        throw new WorkspaceError(`${name}, row ${row.line}: values must fit the header columns and must not contain NUL characters.`);
    }
    if (data.length) tables.push({ name, headers, columns, rows: data.map(row => ({ line: row.line,
      fields: Object.fromEntries(headers.map((header, index) => [header, row.cells[index] || ""])) })) });
  }
  if (extension === "csv" || extension === "tsv") {
    let lines: string[][];
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
      lines = parse(text, { bom: true, delimiter: extension === "tsv" ? "\t" : ",", skip_empty_lines: true,
        max_record_size: 500000, relax_column_count: false });
    } catch {
      throw new WorkspaceError("The table could not be read. Use UTF-8 text, consistent columns and closed quoted fields.");
    }
    table(file.name, lines.map((cells, index) => ({ line: index + 1, cells })));
  } else if (extension === "xlsx") {
    boundedArchive(file.bytes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(file.bytes) as unknown as ExcelJS.Buffer);
    for (const sheet of workbook.worksheets) {
      const lines: Array<{ line: number; cells: string[] }> = [];
      sheet.eachRow(row => {
        if (row.cellCount > 100) throw new WorkspaceError(`${sheet.name}: import up to 100 columns per table.`);
        const cells = Array.from({ length: row.cellCount }, (_, index) => {
          const cell = row.getCell(index + 1);
          // Formula results are data; formulas are never executed. Missing
          // cached results are rejected instead of silently losing a value.
          if (cell.type === ExcelJS.ValueType.Formula && cell.result === undefined)
            throw new WorkspaceError(`${sheet.name}, ${cell.address}: recalculate and save this formula in your spreadsheet application before importing.`);
          return cell.value instanceof Date ? cell.value.toISOString() : cell.text;
        });
        if (cells.some(value => value.trim())) lines.push({ line: row.number, cells });
        if (lines.length > 10001) throw new WorkspaceError("Import up to 10,000 candidate rows per file across all worksheets.");
      });
      table(sheet.name, lines);
    }
  } else throw new WorkspaceError("Use CSV, TSV or XLSX for a candidate table.");
  if (!tables.length) throw new WorkspaceError("Add a header row and at least one candidate to this file.");
  return tables;
}
