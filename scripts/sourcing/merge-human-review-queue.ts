import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  calibrationCsvPath: string;
  reviewQueueCsvPath: string;
  outPath: string;
  includeUnreviewedAssistantStrict: boolean;
};

type CsvRow = Record<string, string>;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    calibrationCsvPath: "docs/architecture/jd-sourcing-calibration-samples.csv",
    reviewQueueCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    outPath: "docs/architecture/jd-sourcing-calibration-human-reviewed.csv",
    includeUnreviewedAssistantStrict: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--calibration-csv=")) {
      options.calibrationCsvPath = arg.slice("--calibration-csv=".length);
      continue;
    }
    if (arg.startsWith("--review-queue-csv=")) {
      options.reviewQueueCsvPath = arg.slice("--review-queue-csv=".length);
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--include-unreviewed-assistant-strict") {
      options.includeUnreviewedAssistantStrict = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const calibration = parseCsvWithHeaders(fs.readFileSync(path.resolve(options.calibrationCsvPath), "utf8"));
  const reviewQueue = parseCsvWithHeaders(fs.readFileSync(path.resolve(options.reviewQueueCsvPath), "utf8"));
  const merged = mergeRows(calibration.rows, reviewQueue.rows, options);
  writeText(path.resolve(options.outPath), buildCsv(calibration.headers, merged.rows));
  console.log(`Human-reviewed calibration written: ${path.resolve(options.outPath)}`);
  console.log(`Rows: ${merged.rows.length}`);
  console.log(`Human reviewed rows: ${merged.humanReviewedRows}`);
  console.log(`Unreviewed rows: ${merged.unreviewedRows}`);
}

function mergeRows(calibrationRows: CsvRow[], reviewRows: CsvRow[], options: CliOptions) {
  const reviewByCandidate = new Map<string, CsvRow>();
  for (const review of reviewRows) {
    const decision = normalizeDecision(review.human_decision);
    if (!decision) continue;
    reviewByCandidate.set(keyOf(review), {
      ...review,
      human_decision: decision,
    });
  }

  let humanReviewedRows = 0;
  let unreviewedRows = 0;
  const rows = calibrationRows.map((row) => {
    const review = reviewByCandidate.get(keyOf(row));
    if (review) {
      humanReviewedRows += 1;
      return {
        ...row,
        reviewer_decision: review.human_decision,
        reviewer_reason: review.human_reason || review.review_question || "",
        reviewer_notes: [
          `human_review_queue:${review.review_id || "unknown"}`,
          review.bucket ? `bucket=${review.bucket}` : "",
          review.priority ? `priority=${review.priority}` : "",
          review.human_notes ? `notes=${review.human_notes}` : "",
        ].filter(Boolean).join("; "),
      };
    }
    unreviewedRows += 1;
    if (options.includeUnreviewedAssistantStrict) return row;
    return {
      ...row,
      reviewer_decision: "",
      reviewer_reason: "",
      reviewer_notes: "",
    };
  });

  return {
    rows,
    humanReviewedRows,
    unreviewedRows,
  };
}

function parseCsvWithHeaders(value: string) {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      if (row.some((item) => item.length > 0)) matrix.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.length > 0)) matrix.push(row);

  const [headers, ...items] = matrix;
  if (!headers) return { headers: [] as string[], rows: [] as CsvRow[] };
  return {
    headers,
    rows: items.map((values) => {
      const record: CsvRow = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || "";
      });
      return record;
    }),
  };
}

function buildCsv(headers: string[], rows: CsvRow[]) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] || "")).join(",")),
  ].join("\n") + "\n";
}

function keyOf(row: CsvRow) {
  return `${row.jd_id || ""}:${row.candidate_id || ""}`;
}

function normalizeDecision(value: string | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (["contact_worthy", "contact-worthy", "contact", "yes"].includes(normalized)) return "contact_worthy";
  if (["research_more", "research-more", "reviewable", "maybe"].includes(normalized)) return "research_more";
  if (["reject", "no"].includes(normalized)) return "reject";
  if (["uncertain", "unknown"].includes(normalized)) return "uncertain";
  return null;
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

main();
