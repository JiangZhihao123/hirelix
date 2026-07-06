import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  calibrationCsvPath: string;
  brightPlanJsonPath: string | null;
  outCsvPath: string;
  outMdPath: string;
  maxRows: number;
  perBucketLimit: number;
};

type CalibrationRow = Record<string, string>;

type BrightProbePlan = {
  jd_plans?: Array<{
    jd_id: string;
    selected_candidates?: Array<{
      candidate_id: string;
      priority_score?: number;
      priority_reasons?: string[];
    }>;
  }>;
};

type ReviewRow = {
  review_id: string;
  priority: "P0" | "P1" | "P2";
  bucket:
    | "confirm_assistant_contact_worthy"
    | "bright_probe_gate"
    | "serper_snippet_risk"
    | "github_profile_needed"
    | "negative_control";
  jd_id: string;
  jd_title: string;
  candidate_id: string;
  name: string;
  headline: string;
  profile_urls: string;
  llm_decision: string;
  assistant_decision: string;
  provider_mix: string;
  source_types: string;
  snippet_only_risk: string;
  profile_completeness: string;
  source_confidence: string;
  missing_evidence: string;
  evidence_summary: string;
  review_question: string;
  recommended_human_standard: string;
  expected_action_after_review: string;
  bright_probe_candidate: string;
  priority_score: number;
  human_decision: string;
  reviewer_type: string;
  human_reason: string;
  human_notes: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    calibrationCsvPath: "docs/architecture/jd-sourcing-calibration-assistant-strict.csv",
    brightPlanJsonPath: "docs/architecture/jd-sourcing-bright-probe-plan.json",
    outCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    outMdPath: "docs/architecture/jd-sourcing-human-review-queue.md",
    maxRows: 24,
    perBucketLimit: 8,
  };

  for (const arg of argv) {
    if (arg.startsWith("--calibration-csv=")) {
      options.calibrationCsvPath = arg.slice("--calibration-csv=".length);
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
    if (arg.startsWith("--out-csv=")) {
      options.outCsvPath = arg.slice("--out-csv=".length);
      continue;
    }
    if (arg.startsWith("--out-md=")) {
      options.outMdPath = arg.slice("--out-md=".length);
      continue;
    }
    if (arg.startsWith("--max-rows=")) {
      options.maxRows = positiveInt(arg.split("=")[1], options.maxRows);
      continue;
    }
    if (arg.startsWith("--per-bucket-limit=")) {
      options.perBucketLimit = positiveInt(arg.split("=")[1], options.perBucketLimit);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const calibrationRows = parseCsv(fs.readFileSync(path.resolve(options.calibrationCsvPath), "utf8"));
  const brightPlan = options.brightPlanJsonPath && fs.existsSync(path.resolve(options.brightPlanJsonPath))
    ? readJson<BrightProbePlan>(path.resolve(options.brightPlanJsonPath))
    : null;
  const queue = buildReviewQueue(calibrationRows, brightPlan, options);
  writeText(path.resolve(options.outCsvPath), buildCsv(queue));
  writeText(path.resolve(options.outMdPath), renderMarkdown(queue, options));
  console.log(`Human review queue written: ${path.resolve(options.outMdPath)}`);
  console.log(`CSV written: ${path.resolve(options.outCsvPath)}`);
  console.log(`Rows: ${queue.length}`);
}

function buildReviewQueue(rows: CalibrationRow[], brightPlan: BrightProbePlan | null, options: CliOptions) {
  const brightCandidates = buildBrightCandidateMap(brightPlan);
  const buckets: Array<ReviewRow[]> = [
    selectBucket(rows, {
      bucket: "confirm_assistant_contact_worthy",
      priority: "P0",
      limit: options.perBucketLimit,
      include: (row) => normalizeDecision(row.reviewer_decision) === "contact_worthy",
      score: (row) => baseScore(row) + 80,
      question: "严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？",
      standard: "必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。",
      action: "确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。",
      brightCandidates,
    }),
    selectBucket(rows, {
      bucket: "bright_probe_gate",
      priority: "P0",
      limit: options.perBucketLimit,
      include: (row) => brightCandidates.has(keyOf(row)),
      score: (row) => (brightCandidates.get(keyOf(row))?.priority_score || 0) + baseScore(row) + 60,
      question: "这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？",
      standard: "只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。",
      action: "通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。",
      brightCandidates,
    }),
    selectBucket(rows, {
      bucket: "serper_snippet_risk",
      priority: "P1",
      limit: options.perBucketLimit,
      include: (row) =>
        normalizeDecision(row.reviewer_decision) === "research_more" &&
        row.llm_decision === "yes" &&
        splitPipe(row.provider_mix).includes("serper") &&
        normalize(row.snippet_only_risk) === "yes",
      score: (row) => baseScore(row) + 40,
      question: "这是 Serper/Google 摘要误判，还是值得补证据的候选？",
      standard: "如果摘要已经显示核心匹配但缺履历细节，填 research_more；如果只是关键词堆叠，填 reject。",
      action: "用于收紧 LLM yes 门槛和决定是否继续依赖 Serper/X-ray。",
      brightCandidates,
    }),
    selectBucket(rows, {
      bucket: "github_profile_needed",
      priority: "P1",
      limit: Math.max(2, Math.floor(options.perBucketLimit / 2)),
      include: (row) =>
        normalizeDecision(row.reviewer_decision) === "research_more" &&
        splitPipe(row.source_types).includes("github"),
      score: (row) => baseScore(row) + 25,
      question: "GitHub 项目证据是否足以继续找 profile，还是和职业候选人不相关？",
      standard: "只看项目不能确认职业经历；除非项目强相关且有明确身份线索，否则不进入外部付费补全。",
      action: "决定 GitHub 是否只保留为 evidence enrichment，而不是候选召回入口。",
      brightCandidates,
    }),
    selectBucket(rows, {
      bucket: "negative_control",
      priority: "P2",
      limit: Math.max(3, Math.floor(options.perBucketLimit / 2)),
      include: (row) => normalizeDecision(row.reviewer_decision) === "reject",
      score: (row) => baseScore(row),
      question: "这个 reject 是否确实不应联系？",
      standard: "用于校准拒绝边界；如果发现误拒，说明 assistant_strict 太保守。",
      action: "保持少量负例对照，避免只看 yes/research_more 导致评审偏差。",
      brightCandidates,
    }),
  ];

  const seen = new Set<string>();
  const merged: ReviewRow[] = [];
  for (const bucket of buckets) {
    for (const row of bucket) {
      const key = `${row.jd_id}:${row.candidate_id}:${row.bucket}`;
      const candidateKey = `${row.jd_id}:${row.candidate_id}`;
      if (seen.has(candidateKey) && row.bucket !== "bright_probe_gate") continue;
      seen.add(candidateKey);
      seen.add(key);
      merged.push(row);
      if (merged.length >= options.maxRows) return assignReviewIds(merged);
    }
  }
  return assignReviewIds(merged);
}

function selectBucket(rows: CalibrationRow[], params: {
  bucket: ReviewRow["bucket"];
  priority: ReviewRow["priority"];
  limit: number;
  include: (row: CalibrationRow) => boolean;
  score: (row: CalibrationRow) => number;
  question: string;
  standard: string;
  action: string;
  brightCandidates: Map<string, { priority_score: number; priority_reasons: string[] }>;
}) {
  return rows
    .filter(params.include)
    .map((row) => buildReviewRow(row, {
      bucket: params.bucket,
      priority: params.priority,
      priorityScore: params.score(row),
      question: params.question,
      standard: params.standard,
      action: params.action,
      brightCandidate: params.brightCandidates.get(keyOf(row)) || null,
    }))
    .sort((a, b) => {
      const scoreDiff = b.priority_score - a.priority_score;
      if (scoreDiff !== 0) return scoreDiff;
      return a.jd_id.localeCompare(b.jd_id) || a.candidate_id.localeCompare(b.candidate_id);
    })
    .slice(0, params.limit);
}

function buildReviewRow(row: CalibrationRow, params: {
  bucket: ReviewRow["bucket"];
  priority: ReviewRow["priority"];
  priorityScore: number;
  question: string;
  standard: string;
  action: string;
  brightCandidate: { priority_score: number; priority_reasons: string[] } | null;
}): ReviewRow {
  return {
    review_id: "",
    priority: params.priority,
    bucket: params.bucket,
    jd_id: row.jd_id || "",
    jd_title: row.jd_title || "",
    candidate_id: row.candidate_id || "",
    name: row.name || "",
    headline: row.headline || "",
    profile_urls: row.profile_urls || "",
    llm_decision: row.llm_decision || "",
    assistant_decision: row.reviewer_decision || "",
    provider_mix: row.provider_mix || "",
    source_types: row.source_types || "",
    snippet_only_risk: row.snippet_only_risk || "",
    profile_completeness: row.profile_completeness || "",
    source_confidence: row.source_confidence || "",
    missing_evidence: row.missing_evidence || "",
    evidence_summary: row.evidence_summary || "",
    review_question: params.question,
    recommended_human_standard: params.standard,
    expected_action_after_review: params.action,
    bright_probe_candidate: params.brightCandidate
      ? `yes: ${params.brightCandidate.priority_reasons.join("; ")}`
      : "no",
    priority_score: params.priorityScore,
    human_decision: "",
    reviewer_type: "",
    human_reason: "",
    human_notes: "",
  };
}

function assignReviewIds(rows: ReviewRow[]) {
  return rows.map((row, index) => ({
    ...row,
    review_id: `HR-${String(index + 1).padStart(3, "0")}`,
  }));
}

function renderMarkdown(rows: ReviewRow[], options: CliOptions) {
  const bucketCounts = countBy(rows, (row) => row.bucket);
  const lines = [
    "# JD Sourcing Human Review Queue",
    "",
    "本队列用于把 assistant_strict 校准结果转成人工/猎头视角的最小复核任务。它不是新的模型判断，也不调用任何外部 provider。",
    "",
    "## Review Rules",
    "",
    "- `contact_worthy`：证据已经足够，真实猎头会放进 outreach 或 shortlist。",
    "- `research_more`：方向可能对，但缺 Profile/履历/技能证据，需要补全后再判断。",
    "- `reject`：不适合该 JD，或者只是关键词、title、项目名重合。",
    "- 不要为了让指标好看把 snippet-only 候选填成 `contact_worthy`。",
    "",
    "## Scope",
    "",
    `- 输入校准表：\`${path.resolve(options.calibrationCsvPath)}\``,
    `- Bright plan：\`${options.brightPlanJsonPath ? path.resolve(options.brightPlanJsonPath) : "disabled"}\``,
    `- 队列行数：${rows.length}`,
    `- Buckets：${Object.entries(bucketCounts).map(([bucket, count]) => `${bucket}=${count}`).join(", ")}`,
    "",
    "## Queue",
    "",
    "| ID | Priority | Bucket | JD | Candidate | LLM | Assistant | URL | Review question |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.review_id} | ${row.priority} | ${row.bucket} | ${row.jd_id} ${escapePipe(row.jd_title)} | ${escapePipe(row.name || row.candidate_id)} | ${row.llm_decision} | ${row.assistant_decision} | ${escapePipe(firstUrl(row.profile_urls))} | ${escapePipe(row.review_question)} |`,
    );
  }

  lines.push(
    "",
    "## Bucket Intent",
    "",
    "- `confirm_assistant_contact_worthy`：先确认 assistant_strict 认为可联系的正例，决定 benchmark 是否有真实 PMF 信号。",
    "- `bright_probe_gate`：真实 Bright probe 前的花钱门控，只批准补全后能产生判断价值的 LinkedIn URL。",
    "- `serper_snippet_risk`：检验 Serper/Google 摘要是否让 LLM yes 偏乐观。",
    "- `github_profile_needed`：判断 GitHub 证据是否值得继续找职业 profile。",
    "- `negative_control`：少量负例对照，防止只审正例导致偏差。",
    "",
    "## How To Use",
    "",
    "1. 填写 CSV 里的 `human_decision`、`reviewer_type`、`human_reason`、`human_notes`。",
    "2. 先完成 P0 行，再看 P1；P2 只做少量边界校准。",
    "3. 如果 `bright_probe_gate` 行没有人工通过，不要执行真实 Bright probe。",
    "4. 人审完成后，再用人工结果更新 benchmark decision report。",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function buildCsv(rows: ReviewRow[]) {
  const headers: Array<keyof ReviewRow> = [
    "review_id",
    "priority",
    "bucket",
    "jd_id",
    "jd_title",
    "candidate_id",
    "name",
    "headline",
    "profile_urls",
    "llm_decision",
    "assistant_decision",
    "provider_mix",
    "source_types",
    "snippet_only_risk",
    "profile_completeness",
    "source_confidence",
    "missing_evidence",
    "evidence_summary",
    "review_question",
    "recommended_human_standard",
    "expected_action_after_review",
    "bright_probe_candidate",
    "priority_score",
    "human_decision",
    "reviewer_type",
    "human_reason",
    "human_notes",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(String(row[header]))).join(",")),
  ].join("\n") + "\n";
}

function buildBrightCandidateMap(plan: BrightProbePlan | null) {
  const map = new Map<string, { priority_score: number; priority_reasons: string[] }>();
  for (const jdPlan of plan?.jd_plans || []) {
    for (const candidate of jdPlan.selected_candidates || []) {
      map.set(`${jdPlan.jd_id}:${candidate.candidate_id}`, {
        priority_score: candidate.priority_score || 0,
        priority_reasons: candidate.priority_reasons || [],
      });
    }
  }
  return map;
}

function baseScore(row: CalibrationRow) {
  let score = 0;
  if (row.llm_decision === "yes") score += 30;
  if (row.llm_decision === "maybe") score += 15;
  if (normalize(row.snippet_only_risk) === "yes") score += 10;
  if (row.profile_completeness === "high") score += 12;
  if (row.profile_completeness === "medium") score += 8;
  if (row.source_confidence === "high") score += 10;
  if (row.source_confidence === "medium") score += 6;
  if (splitPipe(row.provider_mix).includes("serper")) score += 8;
  if (splitPipe(row.source_types).includes("linkedin")) score += 8;
  return score;
}

function keyOf(row: CalibrationRow) {
  return `${row.jd_id || ""}:${row.candidate_id || ""}`;
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
    const record: Record<string, string> = {};
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

function splitPipe(value: string | undefined) {
  return (value || "")
    .split("|")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeDecision(value: string | undefined) {
  const normalized = normalize(value);
  if (["contact_worthy", "contact-worthy", "contact", "yes"].includes(normalized)) return "contact_worthy";
  if (["research_more", "research-more", "reviewable", "maybe"].includes(normalized)) return "research_more";
  if (["reject", "no"].includes(normalized)) return "reject";
  if (["uncertain", "unknown"].includes(normalized)) return "uncertain";
  return null;
}

function normalize(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function countBy<T>(values: T[], keyFn: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function firstUrl(value: string) {
  return value.split(/\s+/).find(Boolean) || "";
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

main();
