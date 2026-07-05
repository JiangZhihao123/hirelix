import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { loadLocalEnv, parseBoolean, parseNonNegativeNumber, parsePositiveInt, parsePositiveNumber } from "./env";
import { createRunId, ensureDir, readTextFile, writeJson, writeText } from "./io";
import { isProviderName } from "./providers";
import type { CandidateCard, CandidateLead, CostLedgerEntry, LightScreenDecision, ProviderName } from "./types";

type BenchmarkJd = {
  id: string;
  title: string;
  category: string;
  location: string;
  difficulty: string;
  jdText: string;
};

type CliOptions = {
  jdDocPath: string;
  outDir: string;
  mode: "dry-run" | "live";
  allowPaid: boolean;
  ids: string[];
  limit: number | null;
  providers: ProviderName[];
  totalBudgetUsd: number;
  perJdBudgetUsd: number;
  brightBudgetUsd: number;
  maxQueriesPerProvider: number;
  maxResultsPerQuery: number;
  maxFirecrawlUrls: number;
  brightRecordsLimit: number;
  skipScreen: boolean;
  noLlmCache: boolean;
  llmCacheDir: string | null;
  perJdTimeoutMs: number;
};

type RunAggregate = {
  jd_id: string;
  title: string;
  category: string;
  run_dir: string | null;
  status: "completed" | "planned" | "error";
  error: string | null;
  raw_leads: number;
  enriched_leads: number;
  deduped_leads: number;
  candidate_cards: number;
  yes: number;
  maybe: number;
  no: number;
  actual_cost_usd: number;
  estimated_cost_usd: number;
  provider_stats: Record<string, ProviderStats>;
  provider_lane_stats: ProviderLaneStats[];
};

type ProviderStats = {
  planned: number;
  success: number;
  error: number;
  blocked: number;
  returned: number;
  actual_cost_usd: number;
  latency_ms: number;
  candidate_cards: number;
  reviewable_candidates: number;
  contact_worthy_candidates: number;
  rejected_candidates: number;
};

type ProviderLaneStats = ProviderStats & {
  jd_id: string;
  title: string;
  category: string;
  provider: string;
  lane_id: string;
  failure_modes: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    jdDocPath: "docs/architecture/benchmark-jds.md",
    outDir: "runs/sourcing-benchmark",
    mode: "dry-run",
    allowPaid: false,
    ids: [],
    limit: null,
    providers: ["serper", "exa", "firecrawl", "github"],
    totalBudgetUsd: 50,
    perJdBudgetUsd: 5,
    brightBudgetUsd: 0.5,
    maxQueriesPerProvider: 2,
    maxResultsPerQuery: 5,
    maxFirecrawlUrls: 2,
    brightRecordsLimit: 25,
    skipScreen: false,
    noLlmCache: false,
    llmCacheDir: null,
    perJdTimeoutMs: 180000,
  };

  for (const arg of argv) {
    if (arg === "--live") {
      options.mode = "live";
      continue;
    }
    if (arg === "--dry-run") {
      options.mode = "dry-run";
      continue;
    }
    if (arg === "--allow-paid") {
      options.allowPaid = true;
      continue;
    }
    if (arg.startsWith("--allow-paid=")) {
      options.allowPaid = parseBoolean(arg.split("=")[1], false);
      continue;
    }
    if (arg === "--skip-screen") {
      options.skipScreen = true;
      continue;
    }
    if (arg === "--no-llm-cache") {
      options.noLlmCache = true;
      continue;
    }
    if (arg === "--include-bright") {
      if (!options.providers.includes("bright")) options.providers.push("bright");
      continue;
    }
    if (arg.startsWith("--jd-doc=")) {
      options.jdDocPath = arg.slice("--jd-doc=".length);
      continue;
    }
    if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length);
      continue;
    }
    if (arg.startsWith("--llm-cache-dir=")) {
      options.llmCacheDir = arg.slice("--llm-cache-dir=".length);
      continue;
    }
    if (arg.startsWith("--per-jd-timeout-ms=")) {
      options.perJdTimeoutMs = parsePositiveInt(arg.split("=")[1], options.perJdTimeoutMs);
      continue;
    }
    if (arg.startsWith("--ids=")) {
      options.ids = arg.slice("--ids=".length).split(",").map((item) => item.trim()).filter(Boolean);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = parsePositiveInt(arg.split("=")[1], 0) || null;
      continue;
    }
    if (arg.startsWith("--providers=")) {
      const providers = arg.slice("--providers=".length).split(",").map((item) => item.trim()).filter(Boolean);
      const invalid = providers.find((provider) => !isProviderName(provider));
      if (invalid) throw new Error(`Unknown provider: ${invalid}`);
      options.providers = providers as ProviderName[];
      continue;
    }
    if (arg.startsWith("--total-budget-usd=")) {
      options.totalBudgetUsd = parsePositiveNumber(arg.split("=")[1], options.totalBudgetUsd);
      continue;
    }
    if (arg.startsWith("--per-jd-budget-usd=")) {
      options.perJdBudgetUsd = parsePositiveNumber(arg.split("=")[1], options.perJdBudgetUsd);
      continue;
    }
    if (arg.startsWith("--bright-budget-usd=")) {
      options.brightBudgetUsd = parseNonNegativeNumber(arg.split("=")[1], options.brightBudgetUsd);
      continue;
    }
    if (arg.startsWith("--max-queries-per-provider=")) {
      options.maxQueriesPerProvider = parsePositiveInt(arg.split("=")[1], options.maxQueriesPerProvider);
      continue;
    }
    if (arg.startsWith("--max-results-per-query=")) {
      options.maxResultsPerQuery = parsePositiveInt(arg.split("=")[1], options.maxResultsPerQuery);
      continue;
    }
    if (arg.startsWith("--max-firecrawl-urls=")) {
      options.maxFirecrawlUrls = parsePositiveInt(arg.split("=")[1], options.maxFirecrawlUrls);
      continue;
    }
    if (arg.startsWith("--bright-records-limit=")) {
      options.brightRecordsLimit = Math.min(100, parsePositiveInt(arg.split("=")[1], options.brightRecordsLimit));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  loadLocalEnv(path.resolve(process.cwd()));
  const options = parseArgs(process.argv.slice(2));
  const jds = selectJds(parseBenchmarkJds(readTextFile(options.jdDocPath)), options);
  if (jds.length === 0) throw new Error("No benchmark JDs selected");

  const maxSpend = jds.length * options.perJdBudgetUsd;
  if (maxSpend > options.totalBudgetUsd) {
    throw new Error(
      `Benchmark budget blocked: ${jds.length} JDs * $${options.perJdBudgetUsd.toFixed(2)} per JD > total cap $${options.totalBudgetUsd.toFixed(2)}`,
    );
  }

  const benchmarkId = createRunId().replace(/^sourcing-/, "benchmark-");
  const benchmarkDir = path.resolve(options.outDir, benchmarkId);
  const jdDir = path.join(benchmarkDir, "jds");
  ensureDir(jdDir);

  writeJson(path.join(benchmarkDir, "benchmark-manifest.json"), {
    benchmark_id: benchmarkId,
    created_at: new Date().toISOString(),
    mode: options.mode,
    jd_doc_path: path.resolve(options.jdDocPath),
    selected_jds: jds.map((jd) => jd.id),
    providers: options.providers,
    budget: {
      total_budget_usd: options.totalBudgetUsd,
      per_jd_budget_usd: options.perJdBudgetUsd,
      bright_budget_usd: options.brightBudgetUsd,
      max_selected_spend_usd: maxSpend,
    },
    options,
  });

  const aggregates: RunAggregate[] = [];
  for (const jd of jds) {
    const jdPath = path.join(jdDir, `${jd.id}.txt`);
    writeText(jdPath, jd.jdText);
    const aggregate = runOneJd({ jd, jdPath, benchmarkDir, options });
    aggregates.push(aggregate);
    writeJson(path.join(benchmarkDir, "benchmark-summary.json"), buildSummary(benchmarkId, options, aggregates));
    writeText(path.join(benchmarkDir, "provider-value-table.csv"), buildProviderValueCsv(aggregates));
    writeText(path.join(benchmarkDir, "provider-lane-value-table.csv"), buildProviderLaneValueCsv(aggregates));
    writeText(path.join(benchmarkDir, "benchmark-report.md"), buildMarkdownReport(benchmarkId, options, aggregates));
  }

  console.log(`${options.mode === "live" ? "Live" : "Dry"} benchmark complete: ${benchmarkDir}`);
}

function runOneJd(params: {
  jd: BenchmarkJd;
  jdPath: string;
  benchmarkDir: string;
  options: CliOptions;
}): RunAggregate {
  const runOutDir = path.join(params.benchmarkDir, "runs", params.jd.id);
  ensureDir(runOutDir);
  const args = [
    "tsx",
    "scripts/sourcing/run-cold-start.ts",
    params.jdPath,
    params.options.mode === "live" ? "--live" : "--dry-run",
    `--out-dir=${runOutDir}`,
    `--providers=${params.options.providers.join(",")}`,
    `--total-budget-usd=${params.options.perJdBudgetUsd}`,
    `--bright-budget-usd=${params.options.brightBudgetUsd}`,
    `--max-queries-per-provider=${params.options.maxQueriesPerProvider}`,
    `--max-results-per-query=${params.options.maxResultsPerQuery}`,
    `--max-firecrawl-urls=${params.options.maxFirecrawlUrls}`,
    `--bright-records-limit=${params.options.brightRecordsLimit}`,
    ...(params.options.allowPaid ? ["--allow-paid"] : []),
    ...(params.options.skipScreen ? ["--skip-screen"] : []),
    ...(params.options.noLlmCache ? ["--no-llm-cache"] : []),
    ...(!params.options.noLlmCache ? [
      `--llm-cache-dir=${path.resolve(params.options.llmCacheDir || path.join(params.benchmarkDir, ".llm-cache"))}`,
    ] : []),
  ];

  const result = spawnSync(path.resolve("node_modules/.bin/tsx"), args.slice(1), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: params.options.perJdTimeoutMs,
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const runDir = parseRunDir(stdout);
  if (result.status !== 0 || !runDir) {
    return emptyAggregate(params.jd, runDir, stderr || stdout || runErrorMessage(result.status, result.signal));
  }

  return aggregateRun(params.jd, runDir);
}

function parseBenchmarkJds(markdown: string): BenchmarkJd[] {
  const blocks = markdown.split(/\n(?=## JD-\d{2}\b)/g).filter((block) => /^## JD-\d{2}\b/m.test(block));
  return blocks.map((block) => {
    const heading = block.match(/^##\s+(JD-\d{2})\s+(.+)$/m);
    const category = block.match(/^类型：(.+?)\s*$/m);
    const location = block.match(/^地点：(.+?)\s*$/m);
    const difficulty = block.match(/^难点：(.+?)\s*$/m);
    const jdText = block.match(/```text\n([\s\S]*?)\n```/m);
    if (!heading || !jdText) {
      throw new Error(`Invalid benchmark JD block: ${block.slice(0, 80)}`);
    }
    return {
      id: heading[1],
      title: heading[2].trim(),
      category: category?.[1]?.trim() || "",
      location: location?.[1]?.trim() || "",
      difficulty: difficulty?.[1]?.trim() || "",
      jdText: jdText[1].trim(),
    };
  });
}

function selectJds(jds: BenchmarkJd[], options: CliOptions) {
  let selected = options.ids.length > 0
    ? jds.filter((jd) => options.ids.includes(jd.id))
    : jds;
  if (options.ids.length > 0 && selected.length !== options.ids.length) {
    const found = new Set(selected.map((jd) => jd.id));
    const missing = options.ids.filter((id) => !found.has(id));
    throw new Error(`Unknown benchmark JD ids: ${missing.join(", ")}`);
  }
  if (options.limit) selected = selected.slice(0, options.limit);
  return selected;
}

function parseRunDir(stdout: string) {
  const match = stdout.match(/(?:Dry|Live) run complete:\s*(.+)\s*$/m);
  return match?.[1]?.trim() || null;
}

function runErrorMessage(status: number | null, signal: NodeJS.Signals | null) {
  if (signal) return `run-cold-start terminated by ${signal}`;
  return `run-cold-start exited with ${status}`;
}

function aggregateRun(jd: BenchmarkJd, runDir: string): RunAggregate {
  const summary = readJson<Record<string, unknown>>(path.join(runDir, "summary.json"));
  const providerPlan = readJson<Record<string, unknown>>(path.join(runDir, "provider-plan.json"));
  const ledger = readJsonl<CostLedgerEntry>(path.join(runDir, "cost-ledger.jsonl"));
  const leads = fs.existsSync(path.join(runDir, "candidate-leads.json"))
    ? readJson<{ leads?: CandidateLead[] }>(path.join(runDir, "candidate-leads.json")).leads ?? []
    : [];
  const cards = fs.existsSync(path.join(runDir, "candidate-cards.json"))
    ? readJson<{ cards?: CandidateCard[] }>(path.join(runDir, "candidate-cards.json")).cards ?? []
    : [];
  const decisions = fs.existsSync(path.join(runDir, "light-screen.json"))
    ? readJson<{ decisions?: LightScreenDecision[] }>(path.join(runDir, "light-screen.json")).decisions ?? []
    : [];

  return {
    jd_id: jd.id,
    title: jd.title,
    category: jd.category,
    run_dir: runDir,
    status: summary.status === "planned" ? "planned" : "completed",
    error: null,
    raw_leads: numeric(summary.raw_leads),
    enriched_leads: numeric(summary.enriched_leads),
    deduped_leads: numeric(summary.deduped_leads),
    candidate_cards: numeric(summary.candidate_cards),
    yes: decisions.filter((decision) => decision.would_advance === "yes").length,
    maybe: decisions.filter((decision) => decision.would_advance === "maybe").length,
    no: decisions.filter((decision) => decision.would_advance === "no").length,
    actual_cost_usd: sumActualCost(ledger),
    estimated_cost_usd: numeric(providerPlan.estimated_total_usd),
    provider_stats: aggregateProviderStats(ledger, cards, leads, decisions),
    provider_lane_stats: aggregateProviderLaneStats(jd, ledger, cards, leads, decisions),
  };
}

function emptyAggregate(jd: BenchmarkJd, runDir: string | null, error: string): RunAggregate {
  return {
    jd_id: jd.id,
    title: jd.title,
    category: jd.category,
    run_dir: runDir,
    status: "error",
    error,
    raw_leads: 0,
    enriched_leads: 0,
    deduped_leads: 0,
    candidate_cards: 0,
    yes: 0,
    maybe: 0,
    no: 0,
    actual_cost_usd: 0,
    estimated_cost_usd: 0,
    provider_stats: {},
    provider_lane_stats: [],
  };
}

function aggregateProviderStats(
  ledger: CostLedgerEntry[],
  cards: CandidateCard[],
  leads: CandidateLead[],
  decisions: LightScreenDecision[],
) {
  const stats: Record<string, ProviderStats> = {};
  for (const entry of ledger) {
    const item = stats[entry.provider] || emptyProviderStats();
    if (entry.status === "planned") item.planned += 1;
    if (entry.status === "success") item.success += 1;
    if (entry.status === "error") item.error += 1;
    if (entry.status === "blocked") item.blocked += 1;
    item.returned += entry.returned_count ?? 0;
    item.actual_cost_usd += entry.actual_cost_usd ?? 0;
    item.latency_ms += entry.latency_ms ?? 0;
    stats[entry.provider] = item;
  }
  for (const attribution of buildCandidateAttribution(cards, leads, decisions)) {
    const item = stats[attribution.provider] || emptyProviderStats();
    addCandidateValue(item, attribution);
    stats[attribution.provider] = item;
  }
  return stats;
}

function aggregateProviderLaneStats(
  jd: BenchmarkJd,
  ledger: CostLedgerEntry[],
  cards: CandidateCard[],
  leads: CandidateLead[],
  decisions: LightScreenDecision[],
) {
  const stats: Record<string, ProviderLaneStats> = {};
  const getItem = (provider: string, laneId: string) => {
    const key = `${provider}\t${laneId}`;
    if (!stats[key]) {
      stats[key] = {
        ...emptyProviderStats(),
        jd_id: jd.id,
        title: jd.title,
        category: jd.category,
        provider,
        lane_id: laneId,
        failure_modes: [],
      };
    }
    return stats[key];
  };

  for (const entry of ledger) {
    const item = getItem(entry.provider, entry.lane_id || "benchmark-level");
    if (entry.status === "planned") item.planned += 1;
    if (entry.status === "success") item.success += 1;
    if (entry.status === "error") item.error += 1;
    if (entry.status === "blocked") item.blocked += 1;
    item.returned += entry.returned_count ?? 0;
    item.actual_cost_usd += entry.actual_cost_usd ?? 0;
    item.latency_ms += entry.latency_ms ?? 0;
    if ((entry.status === "error" || entry.status === "blocked") && entry.message) {
      const failureType = typeof entry.metadata?.failure_type === "string"
        ? entry.metadata.failure_type
        : null;
      item.failure_modes.push(failureType ? `${failureType}: ${entry.message}` : entry.message);
    }
  }

  for (const attribution of buildCandidateAttribution(cards, leads, decisions)) {
    const item = getItem(attribution.provider, attribution.lane_id);
    addCandidateValue(item, attribution);
  }

  return Object.values(stats).sort((a, b) =>
    a.jd_id.localeCompare(b.jd_id) ||
    a.provider.localeCompare(b.provider) ||
    a.lane_id.localeCompare(b.lane_id),
  );
}

function emptyProviderStats(): ProviderStats {
  return {
    planned: 0,
    success: 0,
    error: 0,
    blocked: 0,
    returned: 0,
    actual_cost_usd: 0,
    latency_ms: 0,
    candidate_cards: 0,
    reviewable_candidates: 0,
    contact_worthy_candidates: 0,
    rejected_candidates: 0,
  };
}

function buildCandidateAttribution(
  cards: CandidateCard[],
  leads: CandidateLead[],
  decisions: LightScreenDecision[],
) {
  const leadsById = new Map(leads.map((lead) => [lead.lead_id, lead]));
  const decisionsById = new Map(decisions.map((decision) => [decision.candidate_id, decision]));
  const rows: Array<{
    provider: string;
    lane_id: string;
    decision: LightScreenDecision["would_advance"] | "unreviewed";
  }> = [];

  for (const card of cards) {
    const pairs = new Map<string, { provider: string; lane_id: string }>();
    for (const leadId of card.lead_ids) {
      const lead = leadsById.get(leadId);
      if (!lead) continue;
      pairs.set(`${lead.provider}\t${lead.lane_id}`, {
        provider: lead.provider,
        lane_id: lead.lane_id,
      });
    }
    if (pairs.size === 0) {
      for (const provider of card.source_mix) {
        pairs.set(`${provider}\tunknown`, { provider, lane_id: "unknown" });
      }
    }
    const decision = decisionsById.get(card.candidate_id)?.would_advance ?? "unreviewed";
    for (const pair of pairs.values()) {
      rows.push({ ...pair, decision });
    }
  }

  return rows;
}

function addCandidateValue(
  stats: ProviderStats,
  attribution: { decision: LightScreenDecision["would_advance"] | "unreviewed" },
) {
  stats.candidate_cards += 1;
  if (attribution.decision === "yes" || attribution.decision === "maybe") {
    stats.reviewable_candidates += 1;
  }
  if (attribution.decision === "yes") {
    stats.contact_worthy_candidates += 1;
  }
  if (attribution.decision === "no") {
    stats.rejected_candidates += 1;
  }
}

function buildSummary(benchmarkId: string, options: CliOptions, runs: RunAggregate[]) {
  return {
    benchmark_id: benchmarkId,
    mode: options.mode,
    providers: options.providers,
    run_count: runs.length,
    completed_count: runs.filter((run) => run.status === "completed").length,
    planned_count: runs.filter((run) => run.status === "planned").length,
    error_count: runs.filter((run) => run.status === "error").length,
    totals: {
      actual_cost_usd: roundMoney(runs.reduce((sum, run) => sum + run.actual_cost_usd, 0)),
      estimated_cost_usd: roundMoney(runs.reduce((sum, run) => sum + run.estimated_cost_usd, 0)),
      raw_leads: runs.reduce((sum, run) => sum + run.raw_leads, 0),
      enriched_leads: runs.reduce((sum, run) => sum + run.enriched_leads, 0),
      deduped_leads: runs.reduce((sum, run) => sum + run.deduped_leads, 0),
      candidate_cards: runs.reduce((sum, run) => sum + run.candidate_cards, 0),
      yes: runs.reduce((sum, run) => sum + run.yes, 0),
      maybe: runs.reduce((sum, run) => sum + run.maybe, 0),
      no: runs.reduce((sum, run) => sum + run.no, 0),
      reviewable_candidates: runs.reduce((sum, run) => sum + run.yes + run.maybe, 0),
      contact_worthy_candidates: runs.reduce((sum, run) => sum + run.yes, 0),
    },
    runs,
  };
}

function buildProviderValueCsv(runs: RunAggregate[]) {
  const rows = [
    [
      "provider",
      "planned",
      "success",
      "error",
      "blocked",
      "returned",
      "actual_cost_usd",
      "avg_latency_ms",
      "candidate_cards",
      "reviewable_candidates",
      "contact_worthy_candidates",
      "rejected_candidates",
      "reviewable_rate",
      "contact_worthy_rate",
      "cost_per_reviewable_usd",
      "cost_per_contact_worthy_usd",
    ],
  ];
  const merged: Record<string, ProviderStats> = {};
  for (const run of runs) {
    for (const [provider, stats] of Object.entries(run.provider_stats)) {
      const item = merged[provider] || emptyProviderStats();
      item.planned += stats.planned;
      item.success += stats.success;
      item.error += stats.error;
      item.blocked += stats.blocked;
      item.returned += stats.returned;
      item.actual_cost_usd += stats.actual_cost_usd;
      item.latency_ms += stats.latency_ms;
      item.candidate_cards += stats.candidate_cards;
      item.reviewable_candidates += stats.reviewable_candidates;
      item.contact_worthy_candidates += stats.contact_worthy_candidates;
      item.rejected_candidates += stats.rejected_candidates;
      merged[provider] = item;
    }
  }
  for (const [provider, stats] of Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))) {
    rows.push([
      provider,
      String(stats.planned),
      String(stats.success),
      String(stats.error),
      String(stats.blocked),
      String(stats.returned),
      roundMoney(stats.actual_cost_usd).toFixed(4),
      stats.success > 0 ? Math.round(stats.latency_ms / stats.success).toString() : "0",
      String(stats.candidate_cards),
      String(stats.reviewable_candidates),
      String(stats.contact_worthy_candidates),
      String(stats.rejected_candidates),
      rate(stats.reviewable_candidates, stats.candidate_cards),
      rate(stats.contact_worthy_candidates, stats.candidate_cards),
      costPer(stats.actual_cost_usd, stats.reviewable_candidates),
      costPer(stats.actual_cost_usd, stats.contact_worthy_candidates),
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function buildProviderLaneValueCsv(runs: RunAggregate[]) {
  const rows = [
    [
      "jd_id",
      "title",
      "category",
      "provider",
      "lane_id",
      "planned",
      "success",
      "error",
      "blocked",
      "returned",
      "actual_cost_usd",
      "avg_latency_ms",
      "candidate_cards",
      "reviewable_candidates",
      "contact_worthy_candidates",
      "rejected_candidates",
      "reviewable_rate",
      "contact_worthy_rate",
      "cost_per_reviewable_usd",
      "cost_per_contact_worthy_usd",
      "failure_modes",
    ],
  ];
  for (const stats of runs.flatMap((run) => run.provider_lane_stats)) {
    rows.push([
      stats.jd_id,
      stats.title,
      stats.category,
      stats.provider,
      stats.lane_id,
      String(stats.planned),
      String(stats.success),
      String(stats.error),
      String(stats.blocked),
      String(stats.returned),
      roundMoney(stats.actual_cost_usd).toFixed(4),
      stats.success > 0 ? Math.round(stats.latency_ms / stats.success).toString() : "0",
      String(stats.candidate_cards),
      String(stats.reviewable_candidates),
      String(stats.contact_worthy_candidates),
      String(stats.rejected_candidates),
      rate(stats.reviewable_candidates, stats.candidate_cards),
      rate(stats.contact_worthy_candidates, stats.candidate_cards),
      costPer(stats.actual_cost_usd, stats.reviewable_candidates),
      costPer(stats.actual_cost_usd, stats.contact_worthy_candidates),
      uniqueStrings(stats.failure_modes).slice(0, 3).join(" | "),
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function buildMarkdownReport(benchmarkId: string, options: CliOptions, runs: RunAggregate[]) {
  const summary = buildSummary(benchmarkId, options, runs);
  const lines = [
    `# JD Sourcing Benchmark Report`,
    "",
    `- Benchmark: \`${benchmarkId}\``,
    `- Mode: \`${options.mode}\``,
    `- Providers: \`${options.providers.join(",")}\``,
    `- Runs: ${summary.run_count}, completed ${summary.completed_count}, planned ${summary.planned_count}, errors ${summary.error_count}`,
    `- Actual cost: $${summary.totals.actual_cost_usd.toFixed(4)}`,
    `- Estimated cost: $${summary.totals.estimated_cost_usd.toFixed(4)}`,
    `- Leads: raw ${summary.totals.raw_leads}, enriched ${summary.totals.enriched_leads}, deduped ${summary.totals.deduped_leads}, cards ${summary.totals.candidate_cards}`,
    `- Light screen: yes ${summary.totals.yes}, maybe ${summary.totals.maybe}, no ${summary.totals.no}`,
    `- Reviewable rate: ${rate(summary.totals.reviewable_candidates, summary.totals.candidate_cards)}, contact-worthy rate: ${rate(summary.totals.contact_worthy_candidates, summary.totals.candidate_cards)}`,
    `- Cost per contact-worthy: ${costPer(summary.totals.actual_cost_usd, summary.totals.contact_worthy_candidates)}`,
    "",
    "## Runs",
    "",
    "| JD | Status | Cards | Yes | Maybe | No | Actual Cost | Run Dir |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const run of runs) {
    lines.push(
      `| ${run.jd_id} ${escapePipe(run.title)} | ${run.status} | ${run.candidate_cards} | ${run.yes} | ${run.maybe} | ${run.no} | $${run.actual_cost_usd.toFixed(4)} | ${run.run_dir || ""} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function sumActualCost(ledger: CostLedgerEntry[]) {
  return roundMoney(ledger.reduce((sum, entry) => sum + (entry.actual_cost_usd ?? 0), 0));
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function costPer(costUsd: number, count: number) {
  if (count <= 0) return "";
  return roundMoney(costUsd / count).toFixed(4);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
