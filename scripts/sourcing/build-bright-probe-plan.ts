import fs from "node:fs";
import path from "node:path";

import { buildBrightProbeFilter } from "./providers";
import type { CandidateCard, CandidateLead, ParsedSearchIntent, SourcingLane } from "./types";

type CliOptions = {
  calibrationCsvPath: string;
  outJsonPath: string;
  outMdPath: string;
  maxJds: number;
  maxCandidatesPerJd: number;
  brightRecordsPerJd: number;
  brightRecordUnitCostUsd: number;
  brightBudgetCapUsd: number;
};

type CalibrationRow = Record<string, string>;

type CandidateProbe = {
  jd_id: string;
  jd_title: string;
  candidate_id: string;
  name: string;
  headline: string;
  llm_decision: string;
  reviewer_decision: string;
  source_confidence: string;
  profile_completeness: string;
  provider_mix: string[];
  lane_ids: string[];
  source_types: string[];
  snippet_only_risk: boolean;
  profile_urls: string[];
  linkedin_urls: string[];
  evidence_summary: string;
  missing_evidence: string[];
  run_dir: string;
  probe_action: "bright_url_completion" | "profile_completion_needed";
  priority_score: number;
  priority_reasons: string[];
};

type JdProbePlan = {
  jd_id: string;
  jd_title: string;
  run_dir: string;
  selected_candidates: CandidateProbe[];
  bright_dataset_filter_probe: {
    enabled: boolean;
    reason: string;
    records_limit: number;
    estimated_cost_usd: number;
    lane_id: string | null;
    lane_goal: string | null;
    query: string | null;
    filter: unknown | null;
  };
  estimated_profile_completion_cost_usd: number;
  estimated_total_cost_usd: number;
};

type BrightProbePlan = {
  generated_at: string;
  source_calibration_csv: string;
  mode: "dry_plan_only";
  guardrails: {
    does_not_call_bright: true;
    requires_explicit_authorization_for_real_probe: true;
    bright_balance_assumption_usd: 9;
    bright_record_unit_cost_usd: number;
    bright_budget_cap_usd: number;
  };
  selection_policy: {
    reviewer_decision: string;
    snippet_only_risk: string;
    preferred_sources: string[];
    max_jds: number;
    max_candidates_per_jd: number;
    bright_records_per_jd: number;
  };
  totals: {
    calibration_rows: number;
    eligible_rows: number;
    selected_jds: number;
    selected_candidates: number;
    linkedin_url_candidates: number;
    estimated_profile_completion_cost_usd: number;
    estimated_filter_probe_cost_usd: number;
    estimated_total_cost_usd: number;
    within_budget_cap: boolean;
  };
  jd_plans: JdProbePlan[];
  excluded_summary: {
    no_linkedin_url: number;
    not_research_more: number;
    not_snippet_only: number;
    not_preferred_source: number;
  };
  next_steps: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    calibrationCsvPath: "docs/architecture/jd-sourcing-calibration-assistant-strict.csv",
    outJsonPath: "docs/architecture/jd-sourcing-bright-probe-plan.json",
    outMdPath: "docs/architecture/jd-sourcing-bright-probe-plan.md",
    maxJds: 2,
    maxCandidatesPerJd: 5,
    brightRecordsPerJd: 25,
    brightRecordUnitCostUsd: 0.0025,
    brightBudgetCapUsd: 1,
  };

  for (const arg of argv) {
    if (arg.startsWith("--calibration-csv=")) {
      options.calibrationCsvPath = arg.slice("--calibration-csv=".length);
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
    if (arg.startsWith("--max-jds=")) {
      options.maxJds = positiveInt(arg.split("=")[1], options.maxJds);
      continue;
    }
    if (arg.startsWith("--max-candidates-per-jd=")) {
      options.maxCandidatesPerJd = positiveInt(arg.split("=")[1], options.maxCandidatesPerJd);
      continue;
    }
    if (arg.startsWith("--bright-records-per-jd=")) {
      options.brightRecordsPerJd = positiveInt(arg.split("=")[1], options.brightRecordsPerJd);
      continue;
    }
    if (arg.startsWith("--bright-record-unit-cost-usd=")) {
      options.brightRecordUnitCostUsd = positiveNumber(arg.split("=")[1], options.brightRecordUnitCostUsd);
      continue;
    }
    if (arg.startsWith("--bright-budget-cap-usd=")) {
      options.brightBudgetCapUsd = positiveNumber(arg.split("=")[1], options.brightBudgetCapUsd);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const calibrationCsvPath = path.resolve(options.calibrationCsvPath);
  const rows = parseCsv(fs.readFileSync(calibrationCsvPath, "utf8"));
  const plan = buildPlan(rows, { ...options, calibrationCsvPath });
  writeJson(path.resolve(options.outJsonPath), plan);
  writeText(path.resolve(options.outMdPath), renderMarkdown(plan));
  console.log(`Bright/Profile dry probe plan written: ${path.resolve(options.outMdPath)}`);
  console.log(`JSON written: ${path.resolve(options.outJsonPath)}`);
  console.log(`Selected JD: ${plan.totals.selected_jds}`);
  console.log(`Selected candidates: ${plan.totals.selected_candidates}`);
  console.log(`Estimated total Bright cost: $${plan.totals.estimated_total_cost_usd.toFixed(4)}`);
}

function buildPlan(rows: CalibrationRow[], options: CliOptions): BrightProbePlan {
  const excluded = {
    no_linkedin_url: 0,
    not_research_more: 0,
    not_snippet_only: 0,
    not_preferred_source: 0,
  };
  const candidates: CandidateProbe[] = [];

  for (const row of rows) {
    const reviewerDecision = normalize(row.reviewer_decision);
    const snippetOnly = normalize(row.snippet_only_risk) === "yes";
    const providerMix = splitPipe(row.provider_mix);
    const sourceTypes = splitPipe(row.source_types);
    const profileUrls = splitUrls(row.profile_urls);
    const linkedInUrls = profileUrls.filter(isLinkedInProfileUrl);

    if (reviewerDecision !== "research_more") {
      excluded.not_research_more += 1;
      continue;
    }
    if (!snippetOnly) {
      excluded.not_snippet_only += 1;
      continue;
    }
    if (!hasPreferredSource(providerMix, sourceTypes)) {
      excluded.not_preferred_source += 1;
      continue;
    }
    if (linkedInUrls.length === 0) {
      excluded.no_linkedin_url += 1;
      continue;
    }

    candidates.push(buildCandidateProbe(row, {
      providerMix,
      sourceTypes,
      profileUrls,
      linkedInUrls,
    }));
  }

  const grouped = groupBy(candidates.sort((a, b) => b.priority_score - a.priority_score), (item) => item.jd_id);
  const jdPlans: JdProbePlan[] = [];
  for (const group of Array.from(grouped.values()).sort(compareCandidateGroups)) {
    if (jdPlans.length >= options.maxJds) break;
    const selected = group.slice(0, options.maxCandidatesPerJd);
    if (selected.length === 0) continue;
    jdPlans.push(buildJdPlan(selected, options));
  }

  const estimatedProfileCompletionCost = sum(jdPlans.map((plan) => plan.estimated_profile_completion_cost_usd));
  const estimatedFilterProbeCost = sum(jdPlans.map((plan) => plan.bright_dataset_filter_probe.estimated_cost_usd));
  const estimatedTotal = estimatedProfileCompletionCost + estimatedFilterProbeCost;

  return {
    generated_at: new Date().toISOString(),
    source_calibration_csv: calibrationCsvPathForPlan(options.calibrationCsvPath),
    mode: "dry_plan_only",
    guardrails: {
      does_not_call_bright: true,
      requires_explicit_authorization_for_real_probe: true,
      bright_balance_assumption_usd: 9,
      bright_record_unit_cost_usd: options.brightRecordUnitCostUsd,
      bright_budget_cap_usd: options.brightBudgetCapUsd,
    },
    selection_policy: {
      reviewer_decision: "research_more",
      snippet_only_risk: "yes",
      preferred_sources: ["serper + linkedin", "exa + linkedin"],
      max_jds: options.maxJds,
      max_candidates_per_jd: options.maxCandidatesPerJd,
      bright_records_per_jd: options.brightRecordsPerJd,
    },
    totals: {
      calibration_rows: rows.length,
      eligible_rows: candidates.length,
      selected_jds: jdPlans.length,
      selected_candidates: sum(jdPlans.map((plan) => plan.selected_candidates.length)),
      linkedin_url_candidates: sum(jdPlans.map((plan) => plan.selected_candidates.filter((candidate) => candidate.linkedin_urls.length > 0).length)),
      estimated_profile_completion_cost_usd: roundMoney(estimatedProfileCompletionCost),
      estimated_filter_probe_cost_usd: roundMoney(estimatedFilterProbeCost),
      estimated_total_cost_usd: roundMoney(estimatedTotal),
      within_budget_cap: estimatedTotal <= options.brightBudgetCapUsd,
    },
    jd_plans: jdPlans,
    excluded_summary: excluded,
    next_steps: [
      "先人工复核本计划中的 selected_candidates，确认这些 LinkedIn URL 真值得花钱补全。",
      "如果要真实调用 Bright，先把实际预算 cap 写清楚；建议第一轮不超过 $1。",
      "真实 probe 后只评估两件事：Bright URL/profile completion 是否补足关键证据；Bright Dataset Filter 是否能补到同类候选。",
      "不要把 Bright Dataset Filter 结果当 JD 语义召回成功；它只能作为结构化对照组。",
    ],
  };
}

function buildCandidateProbe(
  row: CalibrationRow,
  resolved: {
    providerMix: string[];
    sourceTypes: string[];
    profileUrls: string[];
    linkedInUrls: string[];
  },
): CandidateProbe {
  const missingEvidence = splitSemicolon(row.missing_evidence);
  const priorityReasons = buildPriorityReasons(row, resolved, missingEvidence);
  return {
    jd_id: row.jd_id || "unknown",
    jd_title: row.jd_title || "",
    candidate_id: row.candidate_id || "",
    name: row.name || "",
    headline: row.headline || "",
    llm_decision: row.llm_decision || "",
    reviewer_decision: row.reviewer_decision || "",
    source_confidence: row.source_confidence || "",
    profile_completeness: row.profile_completeness || "",
    provider_mix: resolved.providerMix,
    lane_ids: splitPipe(row.lane_ids),
    source_types: resolved.sourceTypes,
    snippet_only_risk: normalize(row.snippet_only_risk) === "yes",
    profile_urls: resolved.profileUrls,
    linkedin_urls: resolved.linkedInUrls,
    evidence_summary: row.evidence_summary || "",
    missing_evidence: missingEvidence,
    run_dir: row.run_dir || "",
    probe_action: resolved.linkedInUrls.length > 0 ? "bright_url_completion" : "profile_completion_needed",
    priority_score: scoreCandidate(row, resolved, missingEvidence),
    priority_reasons: priorityReasons,
  };
}

function buildJdPlan(selected: CandidateProbe[], options: CliOptions): JdProbePlan {
  const first = selected[0]!;
  const runDir = path.resolve(first.run_dir);
  const intent = readOptionalJson<{ intent?: ParsedSearchIntent }>(path.join(runDir, "parsed-intent.json"))?.intent || null;
  const lanes = readOptionalJson<{ lanes?: SourcingLane[] }>(path.join(runDir, "sourcing-lanes.json"))?.lanes || [];
  const cards = readOptionalJson<{ cards?: CandidateCard[] }>(path.join(runDir, "candidate-cards.json"))?.cards || [];
  const leads = readOptionalJson<{ leads?: CandidateLead[] }>(path.join(runDir, "candidate-leads.json"))?.leads || [];
  const bestLane = chooseBestLaneForFilter({ selected, lanes, cards, leads });
  const bestQuery = bestLane?.queries.find((query) => query.provider === "serper")?.query ||
    bestLane?.queries[0]?.query ||
    null;
  const filter = intent && bestLane && bestQuery
    ? buildBrightProbeFilter({ lane: bestLane, intent, query: bestQuery })
    : null;
  const profileCompletionCost = selected.length * options.brightRecordUnitCostUsd;
  const filterCost = filter ? options.brightRecordsPerJd * options.brightRecordUnitCostUsd : 0;

  return {
    jd_id: first.jd_id,
    jd_title: first.jd_title,
    run_dir: first.run_dir,
    selected_candidates: selected,
    bright_dataset_filter_probe: {
      enabled: Boolean(filter),
      reason: filter
        ? "按该 JD 的高优先级 lane 做一个极小 Bright Dataset Filter 对照，只验证结构化过滤能否补到同类人。"
        : "缺少 parsed intent、lane 或 query，不能安全生成 Bright Dataset Filter。",
      records_limit: filter ? options.brightRecordsPerJd : 0,
      estimated_cost_usd: roundMoney(filterCost),
      lane_id: bestLane?.lane_id || null,
      lane_goal: bestLane?.goal || null,
      query: bestQuery,
      filter,
    },
    estimated_profile_completion_cost_usd: roundMoney(profileCompletionCost),
    estimated_total_cost_usd: roundMoney(profileCompletionCost + filterCost),
  };
}

function chooseBestLaneForFilter(params: {
  selected: CandidateProbe[];
  lanes: SourcingLane[];
  cards: CandidateCard[];
  leads: CandidateLead[];
}) {
  const selectedCardIds = new Set(params.selected.map((candidate) => candidate.candidate_id));
  const laneScores = new Map<string, number>();
  for (const card of params.cards) {
    if (!selectedCardIds.has(card.candidate_id)) continue;
    for (const leadId of card.lead_ids) {
      const lead = params.leads.find((item) => item.lead_id === leadId);
      if (!lead) continue;
      laneScores.set(lead.lane_id, (laneScores.get(lead.lane_id) || 0) + 1);
    }
  }

  return [...params.lanes]
    .filter((lane) => lane.queries.some((query) => query.provider === "serper" || query.provider === "bright"))
    .sort((a, b) => {
      const scoreDiff = (laneScores.get(b.lane_id) || 0) - (laneScores.get(a.lane_id) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return typeRank(a.type) - typeRank(b.type);
    })[0] || null;
}

function renderMarkdown(plan: BrightProbePlan) {
  const lines = [
    "# JD Sourcing Bright/Profile Dry Probe Plan",
    "",
    "本计划只基于已有 benchmark、校准 CSV 和 run directory 生成，不调用 Bright，不创建 snapshot，也不产生外部费用。",
    "",
    "## 结论",
    "",
    `- 模式：\`${plan.mode}\``,
    `- 校准来源：\`${plan.source_calibration_csv}\``,
    `- 选中 JD：${plan.totals.selected_jds}`,
    `- 选中候选人：${plan.totals.selected_candidates}`,
    `- 预计 Bright URL/Profile completion 成本：$${plan.totals.estimated_profile_completion_cost_usd.toFixed(4)}`,
    `- 预计 Bright Dataset Filter 对照成本：$${plan.totals.estimated_filter_probe_cost_usd.toFixed(4)}`,
    `- 预计总 Bright 成本：$${plan.totals.estimated_total_cost_usd.toFixed(4)}`,
    `- 预算 cap：$${plan.guardrails.bright_budget_cap_usd.toFixed(2)}，是否在 cap 内：${plan.totals.within_budget_cap ? "yes" : "no"}`,
    "",
    "## 选择口径",
    "",
    "- 只选 `assistant_strict` 标为 `research_more` 的行。",
    "- 只选 `snippet_only_risk=yes` 的行，因为它们最能验证 profile 补全是否有价值。",
    "- 优先 LinkedIn URL 候选，因为 Bright 的高价值验证应是 URL/profile completion，不是泛召回。",
    "- 每个 JD 限制候选数量，避免单个 JD 把小额预算吃完。",
    "",
    "## 为什么不是直接跑 Bright 召回",
    "",
    "Bright 当前应被验证为结构化 profile 原料或 LinkedIn URL 补全源，而不是 JD 语义召回引擎。Dataset Filter 对照只能回答“这些字段过滤是否能补到类似人”，不能证明 Bright 能理解 JD 并完成 recruiter sourcing。",
    "",
    "## 总体统计",
    "",
    "| 指标 | 数值 |",
    "| --- | ---: |",
    `| calibration rows | ${plan.totals.calibration_rows} |`,
    `| eligible rows | ${plan.totals.eligible_rows} |`,
    `| selected JDs | ${plan.totals.selected_jds} |`,
    `| selected candidates | ${plan.totals.selected_candidates} |`,
    `| linkedin URL candidates | ${plan.totals.linkedin_url_candidates} |`,
    `| excluded: not research_more | ${plan.excluded_summary.not_research_more} |`,
    `| excluded: not snippet_only | ${plan.excluded_summary.not_snippet_only} |`,
    `| excluded: not preferred source | ${plan.excluded_summary.not_preferred_source} |`,
    `| excluded: no LinkedIn URL | ${plan.excluded_summary.no_linkedin_url} |`,
    "",
  ];

  for (const jdPlan of plan.jd_plans) {
    lines.push(
      `## ${jdPlan.jd_id} ${escapeMarkdown(jdPlan.jd_title)}`,
      "",
      `- Run dir：\`${jdPlan.run_dir}\``,
      `- 选中候选人：${jdPlan.selected_candidates.length}`,
      `- URL/Profile completion 预计成本：$${jdPlan.estimated_profile_completion_cost_usd.toFixed(4)}`,
      `- Dataset Filter 对照：${jdPlan.bright_dataset_filter_probe.enabled ? "enabled" : "disabled"}，预计成本 $${jdPlan.bright_dataset_filter_probe.estimated_cost_usd.toFixed(4)}`,
      `- 对照 lane：${jdPlan.bright_dataset_filter_probe.lane_id || "N/A"}`,
      "",
      "| Candidate | LLM | Source | LinkedIn URL | 为什么值得补全 |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const candidate of jdPlan.selected_candidates) {
      lines.push(
        `| ${escapeMarkdown(candidate.name || candidate.candidate_id)} | ${candidate.llm_decision} | ${escapeMarkdown(candidate.provider_mix.join("+"))} | ${escapeMarkdown(candidate.linkedin_urls[0] || "N/A")} | ${escapeMarkdown(candidate.priority_reasons.join("; "))} |`,
      );
    }
    lines.push(
      "",
      "Dataset Filter preview:",
      "",
      "```json",
      JSON.stringify(jdPlan.bright_dataset_filter_probe.filter, null, 2),
      "```",
      "",
    );
  }

  lines.push(
    "## 下一步",
    "",
    ...plan.next_steps.map((step) => `- ${step}`),
    "",
  );

  return `${lines.join("\n")}\n`;
}

function buildPriorityReasons(row: CalibrationRow, resolved: {
  providerMix: string[];
  sourceTypes: string[];
  linkedInUrls: string[];
}, missingEvidence: string[]) {
  const reasons: string[] = [];
  if (row.llm_decision === "yes") reasons.push("LLM 原判 yes，但严格校准认为证据不足");
  if (row.llm_decision === "maybe") reasons.push("LLM 原判 maybe，适合验证补全能否转正或排除");
  if (resolved.providerMix.includes("serper")) reasons.push("来自 Serper/Google discovery，需验证摘要是否误判");
  if (resolved.sourceTypes.includes("linkedin")) reasons.push("已有 LinkedIn URL，适合 Bright URL/Profile completion");
  if (missingEvidence.length > 0) reasons.push(`缺失证据：${missingEvidence.slice(0, 2).join("; ")}`);
  if (resolved.linkedInUrls.length > 1) reasons.push("存在多个 LinkedIn URL，需要补全后做身份确认");
  return reasons.slice(0, 4);
}

function scoreCandidate(row: CalibrationRow, resolved: {
  providerMix: string[];
  sourceTypes: string[];
  linkedInUrls: string[];
}, missingEvidence: string[]) {
  let score = 0;
  if (row.llm_decision === "yes") score += 40;
  if (row.llm_decision === "maybe") score += 20;
  if (row.source_confidence === "medium") score += 10;
  if (row.source_confidence === "low") score += 4;
  if (row.profile_completeness === "medium") score += 10;
  if (row.profile_completeness === "low") score += 6;
  if (resolved.providerMix.includes("serper")) score += 10;
  if (resolved.sourceTypes.includes("linkedin")) score += 10;
  if (resolved.linkedInUrls.length > 0) score += 15;
  score += Math.min(10, missingEvidence.length * 3);
  return score;
}

function hasPreferredSource(providerMix: string[], sourceTypes: string[]) {
  return sourceTypes.includes("linkedin") && (
    providerMix.includes("serper") ||
    providerMix.includes("exa")
  );
}

function compareCandidateGroups(a: CandidateProbe[], b: CandidateProbe[]) {
  const aYes = a.filter((item) => item.llm_decision === "yes").length;
  const bYes = b.filter((item) => item.llm_decision === "yes").length;
  if (bYes !== aYes) return bYes - aYes;
  const aScore = sum(a.map((item) => item.priority_score));
  const bScore = sum(b.map((item) => item.priority_score));
  if (bScore !== aScore) return bScore - aScore;
  return a[0]!.jd_id.localeCompare(b[0]!.jd_id);
}

function typeRank(type: SourcingLane["type"]) {
  const ranks: Record<SourcingLane["type"], number> = {
    title_xray: 1,
    company_target: 2,
    skill_evidence: 3,
    public_evidence: 4,
    adjacent_background: 5,
    bright_probe: 6,
  };
  return ranks[type] || 99;
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

function readOptionalJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function groupBy<T>(values: T[], keyFn: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFn(value);
    const group = grouped.get(key) || [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}

function splitPipe(value: string | undefined) {
  return (value || "")
    .split("|")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function splitSemicolon(value: string | undefined) {
  return (value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitUrls(value: string | undefined) {
  return (value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLinkedInProfileUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().includes("linkedin.") &&
      url.pathname.toLowerCase().split("/").filter(Boolean).includes("in");
  } catch {
    return false;
  }
}

function normalize(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function calibrationCsvPathForPlan(filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function escapeMarkdown(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

main();
