import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  reviewQueueCsvPath: string;
  brightPlanJsonPath: string | null;
  outMdPath: string | null;
  outJsonPath: string | null;
  requireAllP0: boolean;
};

type ReviewRow = Record<string, string>;

type BrightProbePlan = {
  totals?: {
    estimated_total_cost_usd?: number;
  };
  jd_plans?: Array<{
    jd_id: string;
    selected_candidates?: Array<{
      candidate_id: string;
      linkedin_urls?: string[];
    }>;
  }>;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    reviewQueueCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    brightPlanJsonPath: "docs/architecture/jd-sourcing-bright-probe-plan.json",
    outMdPath: null,
    outJsonPath: null,
    requireAllP0: true,
  };

  for (const arg of argv) {
    if (arg.startsWith("--review-queue-csv=")) {
      options.reviewQueueCsvPath = arg.slice("--review-queue-csv=".length);
      continue;
    }
    if (arg.startsWith("--bright-plan-json=")) {
      options.brightPlanJsonPath = arg.slice("--bright-plan-json=".length);
      continue;
    }
    if (arg === "--no-bright-plan") {
      options.brightPlanJsonPath = null;
      continue;
    }
    if (arg.startsWith("--out-md=")) {
      options.outMdPath = arg.slice("--out-md=".length);
      continue;
    }
    if (arg.startsWith("--out-json=")) {
      options.outJsonPath = arg.slice("--out-json=".length);
      continue;
    }
    if (arg === "--allow-partial-p0") {
      options.requireAllP0 = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = parseCsv(fs.readFileSync(path.resolve(options.reviewQueueCsvPath), "utf8"));
  const brightPlan = options.brightPlanJsonPath && fs.existsSync(path.resolve(options.brightPlanJsonPath))
    ? readJson<BrightProbePlan>(path.resolve(options.brightPlanJsonPath))
    : null;
  const report = buildReport(rows, brightPlan, options);

  if (options.outJsonPath) writeText(path.resolve(options.outJsonPath), `${JSON.stringify(report, null, 2)}\n`);
  if (options.outMdPath) writeText(path.resolve(options.outMdPath), renderMarkdown(report, options));

  console.log(`Human review rows: ${report.totals.reviewed_rows}/${report.totals.total_rows}`);
  console.log(`P0 complete: ${report.gates.p0_complete ? "yes" : "no"}`);
  console.log(`Bright probe allowed: ${report.gates.bright_probe_allowed ? "yes" : "no"}`);
  console.log(`Approved Bright candidates: ${report.bright_gate.approved_candidates.length}`);
  if (!report.gates.bright_probe_allowed) {
    console.log(`Block reason: ${report.gates.block_reasons.join("; ")}`);
  }
}

function buildReport(rows: ReviewRow[], brightPlan: BrightProbePlan | null, options: CliOptions) {
  const bucketCounts = countBy(rows, (row) => row.bucket || "unknown");
  const reviewedRows = rows.filter((row) => normalizeDecision(row.human_decision));
  const p0Rows = rows.filter((row) => row.priority === "P0");
  const p0ReviewedRows = p0Rows.filter((row) => normalizeDecision(row.human_decision));
  const brightGateRows = rows.filter((row) => row.bucket === "bright_probe_gate");
  const reviewedBrightGateRows = brightGateRows.filter((row) => normalizeDecision(row.human_decision));
  const approvedBrightRows = brightGateRows.filter(isBrightApproved);
  const rejectedBrightRows = brightGateRows.filter((row) => {
    const decision = normalizeDecision(row.human_decision);
    return decision === "reject" || decision === "uncertain";
  });
  const brightPlanCandidates = buildBrightPlanCandidateMap(brightPlan);
  const approvedCandidates = approvedBrightRows.map((row) => ({
    review_id: row.review_id,
    jd_id: row.jd_id,
    candidate_id: row.candidate_id,
    name: row.name,
    profile_urls: row.profile_urls,
    decision: normalizeDecision(row.human_decision),
    reason: row.human_reason,
    in_bright_plan: brightPlanCandidates.has(keyOf(row)),
    linkedin_urls: brightPlanCandidates.get(keyOf(row))?.linkedin_urls || splitUrls(row.profile_urls),
  }));
  const p0Complete = p0Rows.length > 0 && p0Rows.length === p0ReviewedRows.length;
  const brightGateComplete = brightGateRows.length > 0 && brightGateRows.length === reviewedBrightGateRows.length;
  const blockReasons: string[] = [];
  if (options.requireAllP0 && !p0Complete) {
    blockReasons.push(`P0 review incomplete: ${p0ReviewedRows.length}/${p0Rows.length}`);
  }
  if (!brightGateComplete) {
    blockReasons.push(`Bright gate review incomplete: ${reviewedBrightGateRows.length}/${brightGateRows.length}`);
  }
  if (approvedCandidates.length === 0) {
    blockReasons.push("No Bright gate candidates approved by human review");
  }
  if (!brightPlan) {
    blockReasons.push("Bright dry probe plan is missing");
  }

  return {
    generated_at: new Date().toISOString(),
    source: {
      review_queue_csv: path.resolve(options.reviewQueueCsvPath),
      bright_plan_json: options.brightPlanJsonPath ? path.resolve(options.brightPlanJsonPath) : null,
    },
    totals: {
      total_rows: rows.length,
      reviewed_rows: reviewedRows.length,
      p0_rows: p0Rows.length,
      p0_reviewed_rows: p0ReviewedRows.length,
      bucket_counts: bucketCounts,
    },
    gates: {
      require_all_p0: options.requireAllP0,
      p0_complete: p0Complete,
      bright_gate_complete: brightGateComplete,
      bright_probe_allowed: blockReasons.length === 0,
      block_reasons: blockReasons,
    },
    bright_gate: {
      total_rows: brightGateRows.length,
      reviewed_rows: reviewedBrightGateRows.length,
      approved_rows: approvedBrightRows.length,
      rejected_or_uncertain_rows: rejectedBrightRows.length,
      approved_candidates: approvedCandidates,
      dry_plan_estimated_total_cost_usd: roundMoney(brightPlan?.totals?.estimated_total_cost_usd),
      approved_profile_completion_estimated_cost_usd: roundMoney(approvedCandidates.length * 0.0025),
    },
    missing_p0: p0Rows
      .filter((row) => !normalizeDecision(row.human_decision))
      .map((row) => pickReviewSummary(row)),
    missing_bright_gate: brightGateRows
      .filter((row) => !normalizeDecision(row.human_decision))
      .map((row) => pickReviewSummary(row)),
  };
}

function renderMarkdown(report: ReturnType<typeof buildReport>, options: CliOptions) {
  const lines = [
    "# JD Sourcing Human Review Readiness",
    "",
    "本报告只检查人审队列完成度和 Bright 付费 probe 开闸条件，不调用任何外部 provider。",
    "",
    "## Summary",
    "",
    `- Review queue：\`${report.source.review_queue_csv}\``,
    `- Bright plan：\`${report.source.bright_plan_json || "disabled"}\``,
    `- Reviewed rows：${report.totals.reviewed_rows}/${report.totals.total_rows}`,
    `- P0 reviewed：${report.totals.p0_reviewed_rows}/${report.totals.p0_rows}`,
    `- P0 complete：${report.gates.p0_complete ? "yes" : "no"}`,
    `- Bright gate complete：${report.gates.bright_gate_complete ? "yes" : "no"}`,
    `- Bright probe allowed：${report.gates.bright_probe_allowed ? "yes" : "no"}`,
    "",
    "## Bright Gate",
    "",
    `- Gate rows：${report.bright_gate.reviewed_rows}/${report.bright_gate.total_rows} reviewed`,
    `- Approved rows：${report.bright_gate.approved_rows}`,
    `- Rejected/uncertain rows：${report.bright_gate.rejected_or_uncertain_rows}`,
    `- Dry plan estimated total cost：$${report.bright_gate.dry_plan_estimated_total_cost_usd.toFixed(4)}`,
    `- Approved profile completion estimated cost：$${report.bright_gate.approved_profile_completion_estimated_cost_usd.toFixed(4)}`,
    "",
  ];

  if (report.gates.block_reasons.length > 0) {
    lines.push(
      "## Blockers",
      "",
      ...report.gates.block_reasons.map((reason) => `- ${reason}`),
      "",
    );
  }

  lines.push(
    "## Approved Bright Candidates",
    "",
    "| Review ID | JD | Candidate | Decision | In dry plan | URL |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const candidate of report.bright_gate.approved_candidates) {
    lines.push(
      `| ${candidate.review_id} | ${candidate.jd_id} | ${escapePipe(candidate.name || candidate.candidate_id)} | ${candidate.decision} | ${candidate.in_bright_plan ? "yes" : "no"} | ${escapePipe(candidate.linkedin_urls[0] || candidate.profile_urls || "")} |`,
    );
  }

  lines.push(
    "",
    "## Missing P0 Rows",
    "",
    "| Review ID | Bucket | JD | Candidate |",
    "| --- | --- | --- | --- |",
  );
  for (const row of report.missing_p0) {
    lines.push(`| ${row.review_id} | ${row.bucket} | ${row.jd_id} | ${escapePipe(row.name || row.candidate_id)} |`);
  }

  lines.push(
    "",
    "## Usage",
    "",
    "- 只有 `Bright probe allowed: yes` 时，才允许执行真实 Bright probe。",
    "- 默认要求全部 P0 行完成；如只想检查 Bright gate，可用 `--allow-partial-p0`，但不能作为完整人工校准。",
    `- 生成本报告：\`npm run sourcing:human-review-readiness -- --out-md=${options.outMdPath || "docs/architecture/jd-sourcing-human-review-readiness.md"} --out-json=${options.outJsonPath || "docs/architecture/jd-sourcing-human-review-readiness.json"}\``,
    "",
  );

  return `${lines.join("\n")}\n`;
}

function isBrightApproved(row: ReviewRow) {
  const decision = normalizeDecision(row.human_decision);
  return row.bucket === "bright_probe_gate" && (
    decision === "contact_worthy" ||
    decision === "research_more"
  );
}

function pickReviewSummary(row: ReviewRow) {
  return {
    review_id: row.review_id,
    priority: row.priority,
    bucket: row.bucket,
    jd_id: row.jd_id,
    candidate_id: row.candidate_id,
    name: row.name,
  };
}

function buildBrightPlanCandidateMap(plan: BrightProbePlan | null) {
  const map = new Map<string, { linkedin_urls: string[] }>();
  for (const jdPlan of plan?.jd_plans || []) {
    for (const candidate of jdPlan.selected_candidates || []) {
      map.set(`${jdPlan.jd_id}:${candidate.candidate_id}`, {
        linkedin_urls: candidate.linkedin_urls || [],
      });
    }
  }
  return map;
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

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function countBy<T>(values: T[], keyFn: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function keyOf(row: ReviewRow) {
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

function splitUrls(value: string | undefined) {
  return (value || "").split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function roundMoney(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(parsed * 10000) / 10000;
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

main();
