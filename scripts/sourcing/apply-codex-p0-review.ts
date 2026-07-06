import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  reviewQueueCsvPath: string;
  outCsvPath: string;
  outJsonPath: string;
  outMdPath: string;
  dryRun: boolean;
};

type ReviewRow = Record<string, string>;

type P0Decision = {
  review_id: string;
  human_decision: "contact_worthy" | "research_more" | "reject" | "uncertain";
  human_reason: string;
  human_notes: string;
};

const reviewerType = "codex_headhunter";

const decisions: P0Decision[] = [
  {
    review_id: "HR-001",
    human_decision: "contact_worthy",
    human_reason: "Data Engineer profile directly shows 4+ years plus Python, SQL, Snowflake, dbt, and Airflow, matching the JD core requirements.",
    human_notes: "Snippet-only evidence, but the stack and seniority evidence are specific enough for outreach calibration.",
  },
  {
    review_id: "HR-002",
    human_decision: "contact_worthy",
    human_reason: "Data Engineer profile shows 4+ years plus ETL/ELT, Python, SQL, PySpark, Airflow, Databricks, dbt, and AWS.",
    human_notes: "Snippet-only evidence, but it directly covers the JD's data engineering stack.",
  },
  {
    review_id: "HR-003",
    human_decision: "contact_worthy",
    human_reason: "Engineering Manager, Backend at Fubo leading seven backend engineers directly matches the JD's backend management scope.",
    human_notes: "Architecture depth still needs confirmation, but this is outreach-worthy for a platform EM search.",
  },
  {
    review_id: "HR-004",
    human_decision: "contact_worthy",
    human_reason: "Engineering Manager, Platform focused on shared services and APIs aligns with a platform team manager role.",
    human_notes: "Exact team size is missing, but the platform/API management signal is strong enough for outreach.",
  },
  {
    review_id: "HR-005",
    human_decision: "contact_worthy",
    human_reason: "AI/ML Infrastructure Engineer with Google/DeepMind, Twitter, and Berkeley EECS PhD signals direct fit for ML infrastructure outreach.",
    human_notes: "Specific framework and serving evidence should be checked later, but the role/title and background clear the outreach bar.",
  },
  {
    review_id: "HR-006",
    human_decision: "research_more",
    human_reason: "Strong Product Engineer coding stack, but current evidence does not show customer-facing workflow or customer integration ownership.",
    human_notes: "Do not count as contact-worthy yet for the Technical Solutions to Product Engineer JD.",
  },
  {
    review_id: "HR-007",
    human_decision: "contact_worthy",
    human_reason: "AI Product Engineer with React, NestJS, Python, TypeScript, SaaS product building, and 4 years of software experience fits the product engineer target.",
    human_notes: "Customer-facing workflow evidence is still thin, but product engineering and AI/SaaS signals are enough for initial outreach.",
  },
  {
    review_id: "HR-008",
    human_decision: "research_more",
    human_reason: "Backend/platform profile has TypeScript, Prisma, PostgreSQL, distributed systems, and AI data platform signals, but cloud and queue evidence is missing.",
    human_notes: "Approve Bright completion because added profile detail can decide contact versus reject.",
  },
  {
    review_id: "HR-009",
    human_decision: "contact_worthy",
    human_reason: "6+ years backend/platform experience with Node.js, Kafka, PostgreSQL, MongoDB, AWS, and event-driven systems directly matches the backend platform JD.",
    human_notes: "Approve Bright completion mainly to confirm profile freshness and fill structured fields.",
  },
  {
    review_id: "HR-010",
    human_decision: "research_more",
    human_reason: "Backend/platform evidence includes TypeScript, gRPC, AWS/Azure, Terraform, and distributed multi-tenant systems, but database and queue evidence is incomplete.",
    human_notes: "Approve Bright completion because the missing details are exactly what profile completion may resolve.",
  },
  {
    review_id: "HR-011",
    human_decision: "research_more",
    human_reason: "Senior backend ex-Block profile has strong fintech-adjacent platform signal, but NYC location, Python/Go, and PostgreSQL evidence are missing.",
    human_notes: "Approve Bright completion to verify location and stack before treating as contact-worthy.",
  },
  {
    review_id: "HR-012",
    human_decision: "research_more",
    human_reason: "Senior backend fintech/payments profile has strong domain and seniority signal, but NYC location and Python/Go/PostgreSQL evidence are missing.",
    human_notes: "Approve Bright completion because the profile could become contact-worthy if location and stack check out.",
  },
  {
    review_id: "HR-013",
    human_decision: "research_more",
    human_reason: "Senior backend fintech/compliance profile is in the NYC metro area, but stack and distributed systems evidence are incomplete.",
    human_notes: "Approve Bright completion because location and domain are strong enough to justify one profile lookup.",
  },
  {
    review_id: "HR-014",
    human_decision: "research_more",
    human_reason: "Backend/data-intensive systems evidence is directionally relevant, but stack, location, and financial infrastructure evidence are still too thin.",
    human_notes: "Approve Bright completion as a lower-confidence probe sample; do not count as contact-worthy before completion.",
  },
  {
    review_id: "HR-015",
    human_decision: "reject",
    human_reason: "Current evidence points to Java/AWS/Kubernetes backend work and misses the JD's TypeScript/Node.js, PostgreSQL/MySQL, and queue requirements.",
    human_notes: "Do not spend Bright on this row in the first probe; the core stack mismatch is too large.",
  },
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    reviewQueueCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    outCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    outJsonPath: "docs/architecture/jd-sourcing-codex-p0-review.json",
    outMdPath: "docs/architecture/jd-sourcing-codex-p0-review.md",
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--review-queue-csv=")) {
      options.reviewQueueCsvPath = arg.slice("--review-queue-csv=".length);
      continue;
    }
    if (arg.startsWith("--out-csv=")) {
      options.outCsvPath = arg.slice("--out-csv=".length);
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
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const parsed = parseCsvWithHeaders(fs.readFileSync(path.resolve(options.reviewQueueCsvPath), "utf8"));
  const result = applyDecisions(parsed.rows);
  const report = buildReport(result.rows, result.applied, result.skipped, options);

  if (!options.dryRun) {
    writeText(path.resolve(options.outCsvPath), buildCsv(parsed.headers, result.rows));
    writeText(path.resolve(options.outJsonPath), `${JSON.stringify(report, null, 2)}\n`);
    writeText(path.resolve(options.outMdPath), renderMarkdown(report));
  }

  console.log(`Codex P0 review applied: ${result.applied.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
  console.log(`P0 reviewed: ${report.summary.p0_reviewed_rows}/${report.summary.p0_rows}`);
  if (result.skipped.length > 0) {
    process.exitCode = 1;
  }
}

function applyDecisions(rows: ReviewRow[]) {
  const decisionById = new Map(decisions.map((decision) => [decision.review_id, decision]));
  const applied: P0Decision[] = [];
  const skipped: Array<{ review_id: string; reason: string }> = [];
  const updated = rows.map((row) => {
    const decision = decisionById.get(row.review_id);
    if (!decision) return row;
    if (row.priority !== "P0") {
      skipped.push({ review_id: row.review_id, reason: `Expected P0 row, got ${row.priority}` });
      return row;
    }
    applied.push(decision);
    return {
      ...row,
      human_decision: decision.human_decision,
      reviewer_type: reviewerType,
      human_reason: decision.human_reason,
      human_notes: decision.human_notes,
    };
  });

  for (const decision of decisions) {
    if (!rows.some((row) => row.review_id === decision.review_id)) {
      skipped.push({ review_id: decision.review_id, reason: "Review row not found" });
    }
  }

  return { rows: updated, applied, skipped };
}

function buildReport(
  rows: ReviewRow[],
  applied: P0Decision[],
  skipped: Array<{ review_id: string; reason: string }>,
  options: CliOptions,
) {
  const p0Rows = rows.filter((row) => row.priority === "P0");
  const brightGateRows = p0Rows.filter((row) => row.bucket === "bright_probe_gate");
  const reviewedP0Rows = p0Rows.filter((row) => row.reviewer_type === reviewerType && row.human_decision);
  const approvedBrightRows = brightGateRows.filter((row) =>
    row.human_decision === "contact_worthy" || row.human_decision === "research_more",
  );
  return {
    generated_at: new Date().toISOString(),
    reviewer_type: reviewerType,
    source: {
      review_queue_csv: path.resolve(options.reviewQueueCsvPath),
      out_csv: path.resolve(options.outCsvPath),
    },
    summary: {
      applied_rows: applied.length,
      skipped_rows: skipped.length,
      p0_rows: p0Rows.length,
      p0_reviewed_rows: reviewedP0Rows.length,
      bright_gate_rows: brightGateRows.length,
      bright_gate_approved_rows: approvedBrightRows.length,
      decision_counts: countBy(reviewedP0Rows, (row) => row.human_decision || "blank"),
    },
    skipped,
    reviewed_rows: reviewedP0Rows.map((row) => ({
      review_id: row.review_id,
      bucket: row.bucket,
      jd_id: row.jd_id,
      candidate_id: row.candidate_id,
      name: row.name,
      decision: row.human_decision,
      reason: row.human_reason,
      notes: row.human_notes,
    })),
  };
}

function renderMarkdown(report: ReturnType<typeof buildReport>) {
  const lines = [
    "# JD Sourcing Codex P0 Review",
    "",
    "本报告是 Codex 按猎头视角对 P0 复核队列做的第一轮标注，不代表真人猎头或真实招聘方反馈。",
    "",
    "## Summary",
    "",
    `- Reviewer type：${report.reviewer_type}`,
    `- Applied rows：${report.summary.applied_rows}`,
    `- P0 reviewed：${report.summary.p0_reviewed_rows}/${report.summary.p0_rows}`,
    `- Bright gate approved：${report.summary.bright_gate_approved_rows}/${report.summary.bright_gate_rows}`,
    `- Decision counts：${Object.entries(report.summary.decision_counts).map(([key, value]) => `${key}=${value}`).join(", ")}`,
    "",
    "## Reviewed Rows",
    "",
    "| Review ID | Bucket | JD | Candidate | Decision | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of report.reviewed_rows) {
    lines.push(
      `| ${row.review_id} | ${row.bucket} | ${row.jd_id} | ${escapeCell(row.name || row.candidate_id)} | ${row.decision} | ${escapeCell(row.reason)} |`,
    );
  }
  if (report.skipped.length > 0) {
    lines.push(
      "",
      "## Skipped",
      "",
      ...report.skipped.map((item) => `- ${item.review_id}: ${item.reason}`),
    );
  }
  return `${lines.join("\n")}\n`;
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
  if (!headers) return { headers: [] as string[], rows: [] as ReviewRow[] };
  return {
    headers,
    rows: items.map((values) => {
      const record: ReviewRow = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || "";
      });
      return record;
    }),
  };
}

function buildCsv(headers: string[], rows: ReviewRow[]) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] || "")).join(",")),
  ].join("\n") + "\n";
}

function countBy<T>(values: T[], keyFn: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

main();
