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
}): CalibrationRow {
  const providers = unique([
    ...params.card.source_mix,
    ...params.leads.map((lead) => lead.provider),
  ]);
  const laneIds = unique(params.leads.map((lead) => lead.lane_id));
  const sourceTypes = unique(params.leads.map((lead) => lead.source_type));
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
    reviewer_decision: "",
    reviewer_reason: "",
    reviewer_notes: "",
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
