import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  reviewQueueCsvPath: string;
  outJsonPath: string | null;
  outMdPath: string | null;
  requireP0Complete: boolean;
  requireBrightGateComplete: boolean;
};

type ReviewRow = Record<string, string>;

type ValidationIssue = {
  severity: "error" | "warning";
  review_id: string;
  field: string;
  message: string;
};

const decisionValues = new Set(["contact_worthy", "research_more", "reject", "uncertain"]);
const reviewerTypes = new Set([
  "human_headhunter",
  "human_recruiter",
  "human_hiring_manager",
  "codex_headhunter",
  "codex_recruiter",
]);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    reviewQueueCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    outJsonPath: null,
    outMdPath: null,
    requireP0Complete: false,
    requireBrightGateComplete: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--review-queue-csv=")) {
      options.reviewQueueCsvPath = arg.slice("--review-queue-csv=".length);
      continue;
    }
    if (arg.startsWith("--out-json=")) {
      options.outJsonPath = arg.slice("--out-json=".length);
      continue;
    }
    if (arg.startsWith("--out-md=")) {
      options.outMdPath = arg.slice("--out-md=".length);
      continue;
    }
    if (arg === "--require-p0-complete") {
      options.requireP0Complete = true;
      continue;
    }
    if (arg === "--require-bright-gate-complete") {
      options.requireBrightGateComplete = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = parseCsv(fs.readFileSync(path.resolve(options.reviewQueueCsvPath), "utf8"));
  const report = buildReport(rows, options);

  if (options.outJsonPath) writeText(path.resolve(options.outJsonPath), `${JSON.stringify(report, null, 2)}\n`);
  if (options.outMdPath) writeText(path.resolve(options.outMdPath), renderMarkdown(report));

  console.log(`Human review validation: ${report.status}`);
  console.log(`Rows reviewed: ${report.summary.reviewed_rows}/${report.summary.total_rows}`);
  console.log(`P0 reviewed: ${report.summary.p0_reviewed_rows}/${report.summary.p0_rows}`);
  console.log(`Errors: ${report.summary.errors}; warnings: ${report.summary.warnings}`);

  if (report.summary.errors > 0) {
    process.exitCode = 1;
  }
}

function buildReport(rows: ReviewRow[], options: CliOptions) {
  const issues: ValidationIssue[] = [];
  const p0Rows = rows.filter((row) => row.priority === "P0");
  const brightGateRows = rows.filter((row) => row.bucket === "bright_probe_gate");
  const reviewedRows = rows.filter(isReviewed);
  const p0ReviewedRows = p0Rows.filter(isReviewed);
  const brightGateReviewedRows = brightGateRows.filter(isReviewed);

  for (const row of rows) {
    validateRow(row, issues);
  }

  if (options.requireP0Complete && p0ReviewedRows.length !== p0Rows.length) {
    issues.push({
      severity: "error",
      review_id: "P0",
      field: "human_decision",
      message: `P0 review incomplete: ${p0ReviewedRows.length}/${p0Rows.length}`,
    });
  }

  if (options.requireBrightGateComplete && brightGateReviewedRows.length !== brightGateRows.length) {
    issues.push({
      severity: "error",
      review_id: "bright_probe_gate",
      field: "human_decision",
      message: `Bright gate review incomplete: ${brightGateReviewedRows.length}/${brightGateRows.length}`,
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const missingRequiredHeaders = requiredHeaders().filter((header) => rows.length > 0 && !(header in rows[0]));

  for (const header of missingRequiredHeaders) {
    errors.push({
      severity: "error",
      review_id: "header",
      field: header,
      message: `Missing required CSV header: ${header}`,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    source: {
      review_queue_csv: path.resolve(options.reviewQueueCsvPath),
    },
    status: errors.length > 0 ? "invalid" : "valid",
    summary: {
      total_rows: rows.length,
      reviewed_rows: reviewedRows.length,
      p0_rows: p0Rows.length,
      p0_reviewed_rows: p0ReviewedRows.length,
      bright_gate_rows: brightGateRows.length,
      bright_gate_reviewed_rows: brightGateReviewedRows.length,
      errors: errors.length,
      warnings: warnings.length,
      require_p0_complete: options.requireP0Complete,
      require_bright_gate_complete: options.requireBrightGateComplete,
    },
    allowed_values: {
      human_decision: Array.from(decisionValues),
      reviewer_type: Array.from(reviewerTypes),
    },
    issues: [...errors, ...warnings],
    missing_p0: p0Rows
      .filter((row) => !isReviewed(row))
      .map(pickRowSummary),
    missing_bright_gate: brightGateRows
      .filter((row) => !isReviewed(row))
      .map(pickRowSummary),
  };
}

function validateRow(row: ReviewRow, issues: ValidationIssue[]) {
  const decision = normalize(row.human_decision);
  const reason = normalize(row.human_reason);
  const reviewerType = normalize(row.reviewer_type);
  const hasAnyReviewField = Boolean(decision || reason || reviewerType || normalize(row.human_notes));

  if (!hasAnyReviewField) return;

  if (!decision) {
    issues.push({
      severity: "error",
      review_id: row.review_id || "unknown",
      field: "human_decision",
      message: "Review fields are partially filled but human_decision is missing",
    });
  } else if (!decisionValues.has(decision)) {
    issues.push({
      severity: "error",
      review_id: row.review_id || "unknown",
      field: "human_decision",
      message: `Invalid human_decision: ${row.human_decision}`,
    });
  }

  if (!reviewerType) {
    issues.push({
      severity: "error",
      review_id: row.review_id || "unknown",
      field: "reviewer_type",
      message: "reviewer_type is required when human_decision is filled",
    });
  } else if (!reviewerTypes.has(reviewerType)) {
    issues.push({
      severity: "error",
      review_id: row.review_id || "unknown",
      field: "reviewer_type",
      message: `Invalid reviewer_type: ${row.reviewer_type}`,
    });
  }

  if (!reason) {
    issues.push({
      severity: "error",
      review_id: row.review_id || "unknown",
      field: "human_reason",
      message: "human_reason is required when human_decision is filled",
    });
  }

  if (decision === "contact_worthy" && normalize(row.snippet_only_risk) === "yes") {
    issues.push({
      severity: "warning",
      review_id: row.review_id || "unknown",
      field: "human_decision",
      message: "contact_worthy on snippet-only evidence needs especially strong human_reason",
    });
  }
}

function renderMarkdown(report: ReturnType<typeof buildReport>) {
  const lines = [
    "# JD Sourcing Human Review Validation",
    "",
    "本报告只校验本地 review queue 的复核字段，不调用外部 provider。",
    "",
    "## Summary",
    "",
    `- Status：${report.status}`,
    `- Review queue：\`${report.source.review_queue_csv}\``,
    `- Reviewed rows：${report.summary.reviewed_rows}/${report.summary.total_rows}`,
    `- P0 reviewed：${report.summary.p0_reviewed_rows}/${report.summary.p0_rows}`,
    `- Bright gate reviewed：${report.summary.bright_gate_reviewed_rows}/${report.summary.bright_gate_rows}`,
    `- Errors：${report.summary.errors}`,
    `- Warnings：${report.summary.warnings}`,
    "",
    "## Allowed Values",
    "",
    `- human_decision：${report.allowed_values.human_decision.map((value) => `\`${value}\``).join(", ")}`,
    `- reviewer_type：${report.allowed_values.reviewer_type.map((value) => `\`${value}\``).join(", ")}`,
    "",
  ];

  if (report.issues.length > 0) {
    lines.push(
      "## Issues",
      "",
      "| Severity | Review ID | Field | Message |",
      "| --- | --- | --- | --- |",
    );
    for (const issue of report.issues) {
      lines.push(`| ${issue.severity} | ${issue.review_id} | ${issue.field} | ${escapeCell(issue.message)} |`);
    }
    lines.push("");
  }

  lines.push(
    "## Missing P0 Rows",
    "",
    "| Review ID | Bucket | JD | Candidate |",
    "| --- | --- | --- | --- |",
  );
  for (const row of report.missing_p0) {
    lines.push(`| ${row.review_id} | ${row.bucket} | ${row.jd_id} | ${escapeCell(row.name || row.candidate_id)} |`);
  }

  lines.push(
    "",
    "## Missing Bright Gate Rows",
    "",
    "| Review ID | JD | Candidate |",
    "| --- | --- | --- |",
  );
  for (const row of report.missing_bright_gate) {
    lines.push(`| ${row.review_id} | ${row.jd_id} | ${escapeCell(row.name || row.candidate_id)} |`);
  }

  return `${lines.join("\n")}\n`;
}

function isReviewed(row: ReviewRow) {
  return decisionValues.has(normalize(row.human_decision));
}

function pickRowSummary(row: ReviewRow) {
  return {
    review_id: row.review_id,
    priority: row.priority,
    bucket: row.bucket,
    jd_id: row.jd_id,
    candidate_id: row.candidate_id,
    name: row.name,
  };
}

function requiredHeaders() {
  return [
    "review_id",
    "priority",
    "bucket",
    "jd_id",
    "candidate_id",
    "human_decision",
    "reviewer_type",
    "human_reason",
    "human_notes",
  ];
}

function parseCsv(value: string) {
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

  const [headers, ...rows] = matrix;
  if (!headers) return [];
  return rows.map((items) => {
    const record: ReviewRow = {};
    headers.forEach((header, index) => {
      record[header] = items[index] || "";
    });
    return record;
  });
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function normalize(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

main();
