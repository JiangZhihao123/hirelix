import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  reviewQueueCsvPath: string;
  outMdPath: string;
  includePriority: Set<string>;
};

type ReviewRow = Record<string, string>;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    reviewQueueCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    outMdPath: "docs/architecture/jd-sourcing-human-review-pack.md",
    includePriority: new Set(["P0", "P1"]),
  };

  for (const arg of argv) {
    if (arg.startsWith("--review-queue-csv=")) {
      options.reviewQueueCsvPath = arg.slice("--review-queue-csv=".length);
      continue;
    }
    if (arg.startsWith("--out-md=")) {
      options.outMdPath = arg.slice("--out-md=".length);
      continue;
    }
    if (arg.startsWith("--priorities=")) {
      options.includePriority = new Set(
        arg.slice("--priorities=".length)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = parseCsv(fs.readFileSync(path.resolve(options.reviewQueueCsvPath), "utf8"))
    .filter((row) => options.includePriority.has(row.priority || ""));
  const outPath = path.resolve(options.outMdPath);
  writeText(outPath, renderMarkdown(rows, options));
  console.log(`Human review pack written: ${outPath}`);
  console.log(`Rows: ${rows.length}`);
}

function renderMarkdown(rows: ReviewRow[], options: CliOptions) {
  const bucketCounts = countBy(rows, (row) => row.bucket || "unknown");
  const p0Rows = rows.filter((row) => row.priority === "P0");
  const lines = [
    "# JD Sourcing Human Review Pack",
    "",
    "本复核包用于按猎头视角判断候选人是否值得联系，或是否值得消耗 Bright 做 profile completion。它只来自本地 review queue，不调用外部 provider。",
    "",
    "## Review Standard",
    "",
    "- `contact_worthy`：已有证据足够，真实猎头会放进 outreach 或 shortlist。",
    "- `research_more`：方向可能对，但需要补 LinkedIn/Profile/履历证据后才能判断。",
    "- `reject`：不适合该 JD，或者只是关键词、title、项目名重合。",
    "- `uncertain`：当前证据无法判断，且不能合理归入前三类。",
    "- `reviewer_type` 必须写清楚，例如 `human_headhunter`、`human_recruiter`、`codex_headhunter`。",
    "",
    "## Scope",
    "",
    `- Review queue：\`${path.resolve(options.reviewQueueCsvPath)}\``,
    `- Included priorities：${Array.from(options.includePriority).join(", ")}`,
    `- Rows：${rows.length}`,
    `- P0 rows：${p0Rows.length}`,
    `- Buckets：${Object.entries(bucketCounts).map(([bucket, count]) => `${bucket}=${count}`).join(", ")}`,
    "",
    "## P0 Checklist",
    "",
    "| Review ID | Bucket | JD | Candidate | Current assistant decision | Needed answer |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of p0Rows) {
    lines.push(
      `| ${row.review_id} | ${row.bucket} | ${row.jd_id} ${escapeCell(row.jd_title)} | ${escapeCell(row.name || row.candidate_id)} | ${row.assistant_decision || "N/A"} | ${escapeCell(row.review_question)} |`,
    );
  }

  for (const [jdKey, jdRows] of groupBy(rows, (row) => `${row.jd_id} ${row.jd_title}`)) {
    lines.push("", `## ${jdKey}`, "");
    for (const row of jdRows) {
      lines.push(
        `### ${row.review_id} ${row.priority} ${row.bucket}`,
        "",
        `- Candidate：${row.name || row.candidate_id}`,
        `- Headline：${row.headline || "N/A"}`,
        `- URL：${row.profile_urls || "N/A"}`,
        `- LLM decision：${row.llm_decision || "N/A"}`,
        `- Assistant strict decision：${row.assistant_decision || "N/A"}`,
        `- Provider mix：${row.provider_mix || "N/A"}`,
        `- Source types：${row.source_types || "N/A"}`,
        `- Snippet-only risk：${row.snippet_only_risk || "N/A"}`,
        `- Profile completeness：${row.profile_completeness || "N/A"}`,
        `- Source confidence：${row.source_confidence || "N/A"}`,
        `- Missing evidence：${row.missing_evidence || "None"}`,
        `- Evidence summary：${row.evidence_summary || "N/A"}`,
        `- Review question：${row.review_question || "N/A"}`,
        `- Standard：${row.recommended_human_standard || "N/A"}`,
        `- Expected action：${row.expected_action_after_review || "N/A"}`,
        `- Bright probe candidate：${row.bright_probe_candidate || "N/A"}`,
        "",
        "Decision fields to fill:",
        "",
        "- `human_decision`: ",
        "- `reviewer_type`: ",
        "- `human_reason`: ",
        "- `human_notes`: ",
        "",
      );
    }
  }

  lines.push(
    "## Validation",
    "",
    "填完 CSV 后运行：",
    "",
    "```bash",
    "npm run sourcing:validate-human-review",
    "```",
    "",
    "如果要强制要求 P0 全部完成，运行：",
    "",
    "```bash",
    "npm run sourcing:validate-human-review -- --require-p0-complete",
    "```",
    "",
  );

  return `${lines.join("\n")}\n`;
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

function groupBy<T>(values: T[], keyFn: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFn(value);
    groups.set(key, [...(groups.get(key) || []), value]);
  }
  return groups;
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

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

main();
