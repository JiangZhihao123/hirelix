import fs from "node:fs";
import path from "node:path";

import type { CandidateCard, CandidateLead, LightScreenDecision } from "./types";

type CliOptions = {
  benchmarkDir: string | null;
  outPath: string;
  yesPerJd: number;
  maybePerJd: number;
  noPerJd: number;
  allReviewable: boolean;
  assistantStrict: boolean;
};

type BenchmarkSummary = {
  benchmark_id?: string;
  runs?: Array<{
    jd_id: string;
    title?: string;
    category?: string;
    run_dir?: string | null;
  }>;
};

type CalibrationRow = {
  benchmark_id: string;
  jd_id: string;
  jd_title: string;
  run_dir: string;
  candidate_id: string;
  llm_decision: string;
  suggested_next_action: string;
  source_confidence: string;
  profile_completeness: string;
  provider_mix: string;
  lane_ids: string;
  source_types: string;
  snippet_only_risk: string;
  name: string;
  headline: string;
  profile_urls: string;
  llm_reason: string;
  missing_evidence: string;
  evidence_summary: string;
  reviewer_decision: string;
  reviewer_reason: string;
  reviewer_notes: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    benchmarkDir: null,
    outPath: "docs/architecture/jd-sourcing-calibration-samples.csv",
    yesPerJd: 3,
    maybePerJd: 2,
    noPerJd: 1,
    allReviewable: false,
    assistantStrict: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--benchmark-dir=")) {
      options.benchmarkDir = arg.slice("--benchmark-dir=".length);
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("--yes-per-jd=")) {
      options.yesPerJd = nonNegativeInt(arg.split("=")[1], options.yesPerJd);
      continue;
    }
    if (arg.startsWith("--maybe-per-jd=")) {
      options.maybePerJd = nonNegativeInt(arg.split("=")[1], options.maybePerJd);
      continue;
    }
    if (arg.startsWith("--no-per-jd=")) {
      options.noPerJd = nonNegativeInt(arg.split("=")[1], options.noPerJd);
      continue;
    }
    if (arg === "--all-reviewable") {
      options.allReviewable = true;
      continue;
    }
    if (arg === "--assistant-strict") {
      options.assistantStrict = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.benchmarkDir) {
    throw new Error(
      "Usage: npx tsx scripts/sourcing/build-calibration-samples.ts --benchmark-dir=<benchmark-dir> [--out=docs/architecture/jd-sourcing-calibration-samples.csv]",
    );
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const benchmarkDir = path.resolve(options.benchmarkDir!);
  const summary = readJson(path.join(benchmarkDir, "benchmark-summary.json")) as BenchmarkSummary;
  const rows = buildRows(summary, options);
  const outPath = path.resolve(options.outPath);
  writeText(outPath, buildCsv(rows));
  console.log(`Calibration samples written: ${outPath}`);
  console.log(`Rows: ${rows.length}`);
}

function buildRows(summary: BenchmarkSummary, options: CliOptions): CalibrationRow[] {
  const rows: CalibrationRow[] = [];
  for (const run of summary.runs || []) {
    if (!run.run_dir) continue;
    const runDir = path.resolve(run.run_dir);
    const cards = readOptionalJson<{ cards?: CandidateCard[] }>(path.join(runDir, "candidate-cards.json"))?.cards || [];
    const leads = readOptionalJson<{ leads?: CandidateLead[] }>(path.join(runDir, "candidate-leads.json"))?.leads || [];
    const decisions = readOptionalJson<{ decisions?: LightScreenDecision[] }>(path.join(runDir, "light-screen.json"))?.decisions || [];
    const selected = selectDecisions(decisions, options);
    for (const decision of selected) {
      const card = cards.find((item) => item.candidate_id === decision.candidate_id);
      if (!card) continue;
      const cardLeads = card.lead_ids
        .map((leadId) => leads.find((lead) => lead.lead_id === leadId))
        .filter((lead): lead is CandidateLead => Boolean(lead));
      rows.push(buildRow({
        benchmarkId: summary.benchmark_id || "",
        jdId: run.jd_id,
        jdTitle: run.title || "",
        runDir,
        card,
        decision,
        leads: cardLeads,
        assistantStrict: options.assistantStrict,
      }));
    }
  }
  return rows;
}

function selectDecisions(decisions: LightScreenDecision[], options: CliOptions) {
  const yes = decisions.filter((decision) => decision.would_advance === "yes");
  const maybe = decisions.filter((decision) => decision.would_advance === "maybe");
  const no = decisions.filter((decision) => decision.would_advance === "no");
  if (options.allReviewable) {
    return [...yes, ...maybe, ...no.slice(0, options.noPerJd)];
  }
  return [
    ...yes.slice(0, options.yesPerJd),
    ...maybe.slice(0, options.maybePerJd),
    ...no.slice(0, options.noPerJd),
  ];
}

function buildRow(params: {
  benchmarkId: string;
  jdId: string;
  jdTitle: string;
  runDir: string;
  card: CandidateCard;
  decision: LightScreenDecision;
  leads: CandidateLead[];
  assistantStrict: boolean;
}): CalibrationRow {
  const providers = unique([
    ...params.card.source_mix,
    ...params.leads.map((lead) => lead.provider),
  ]);
  const laneIds = unique(params.leads.map((lead) => lead.lane_id));
  const sourceTypes = unique(params.leads.map((lead) => lead.source_type));
  const assistantReview = params.assistantStrict
    ? strictAssistantReview({
        decision: params.decision,
        leads: params.leads,
        evidenceSummary: params.card.evidence_summary,
        missingEvidence: params.decision.missing_evidence,
        sourceTypes,
      })
    : null;
  return {
    benchmark_id: params.benchmarkId,
    jd_id: params.jdId,
    jd_title: params.jdTitle,
    run_dir: params.runDir,
    candidate_id: params.card.candidate_id,
    llm_decision: params.decision.would_advance,
    suggested_next_action: params.decision.suggested_next_action,
    source_confidence: params.decision.source_confidence,
    profile_completeness: params.decision.profile_completeness,
    provider_mix: providers.join("|"),
    lane_ids: laneIds.join("|"),
    source_types: sourceTypes.join("|"),
    snippet_only_risk: hasSnippetOnlyRisk(params.leads) ? "yes" : "no",
    name: params.card.name || "",
    headline: params.card.headline || "",
    profile_urls: params.card.profile_urls.join(" "),
    llm_reason: oneLine(params.decision.reason),
    missing_evidence: params.decision.missing_evidence.map(oneLine).join("; "),
    evidence_summary: oneLine(params.card.evidence_summary),
    reviewer_decision: assistantReview?.decision || "",
    reviewer_reason: assistantReview?.reason || "",
    reviewer_notes: assistantReview?.notes || "",
  };
}

function hasSnippetOnlyRisk(leads: CandidateLead[]) {
  if (leads.length === 0) return true;
  return leads.every((lead) => {
    const hasExtractedEvidence = Boolean(
      (lead.raw as { firecrawl?: unknown; github?: unknown; profile?: unknown }).firecrawl ||
      (lead.raw as { firecrawl?: unknown; github?: unknown; profile?: unknown }).github ||
      (lead.raw as { firecrawl?: unknown; github?: unknown; profile?: unknown }).profile,
    );
    return !hasExtractedEvidence;
  });
}

function strictAssistantReview(params: {
  decision: LightScreenDecision;
  leads: CandidateLead[];
  evidenceSummary: string;
  missingEvidence: string[];
  sourceTypes: string[];
}) {
  const evidence = params.evidenceSummary.toLowerCase();
  const missing = params.missingEvidence.join(" ").toLowerCase();
  const snippetOnly = hasSnippetOnlyRisk(params.leads);
  const hasDirectRoleEvidence = /\b(engineer|developer|architect|manager|scientist|data|platform|backend|full stack|full-stack|infrastructure|ml|machine learning|solutions)\b/i.test(evidence);
  const hasExperienceEvidence = /\b(\d\+?\s*years|staff|principal|senior|manager|lead|ex-|@| at )\b/i.test(evidence);
  const githubOnly = params.sourceTypes.length > 0 && params.sourceTypes.every((type) => type === "github");
  const noEvidence = evidence.trim().length < 80 || /no evidence|only name|all must-haves/i.test(`${params.decision.reason} ${missing}`);

  if (params.decision.would_advance === "no" || noEvidence) {
    return {
      decision: "reject",
      reason: "证据不足或 LLM 已拒绝，真实猎头不会联系。",
      notes: "assistant_strict",
    };
  }
  if (githubOnly) {
    return {
      decision: "research_more",
      reason: "只有 GitHub 项目证据，不能证明职业经历和岗位匹配，需要补 Profile。",
      notes: "assistant_strict",
    };
  }
  if (params.decision.would_advance === "maybe") {
    return {
      decision: "research_more",
      reason: "方向可能相关，但 LLM 已标记证据不足，需补全后再判断。",
      notes: "assistant_strict",
    };
  }
  if (snippetOnly && (!hasDirectRoleEvidence || !hasExperienceEvidence || missing.length > 40)) {
    return {
      decision: "research_more",
      reason: "主要依赖搜索摘要，仍缺关键经验或技能证据，不能直接 outreach。",
      notes: "assistant_strict",
    };
  }
  return {
    decision: "contact_worthy",
    reason: "摘要中已有直接岗位、技能和经验信号，按严格猎头初筛可进入联系池。",
    notes: "assistant_strict",
  };
}

function buildCsv(rows: CalibrationRow[]) {
  const headers: Array<keyof CalibrationRow> = [
    "benchmark_id",
    "jd_id",
    "jd_title",
    "run_dir",
    "candidate_id",
    "llm_decision",
    "suggested_next_action",
    "source_confidence",
    "profile_completeness",
    "provider_mix",
    "lane_ids",
    "source_types",
    "snippet_only_risk",
    "name",
    "headline",
    "profile_urls",
    "llm_reason",
    "missing_evidence",
    "evidence_summary",
    "reviewer_decision",
    "reviewer_reason",
    "reviewer_notes",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n") + "\n";
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function readOptionalJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath) as T;
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function nonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

main();
