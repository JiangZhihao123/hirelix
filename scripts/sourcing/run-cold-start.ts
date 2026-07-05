import path from "node:path";

import {
  assertBudgetAllowsCall,
  completedLedgerEntry,
  createBudget,
  plannedLedgerEntry,
} from "./budget";
import {
  loadLocalEnv,
  parseBoolean,
  parseNonNegativeNumber,
  parsePositiveInt,
  parsePositiveNumber,
} from "./env";
import {
  appendLedger,
  createRunDir,
  createRunId,
  readTextFile,
  writeJson,
  writeManifest,
  writeText,
} from "./io";
import {
  generateSourcingLanesWithLlm,
  lightScreenCandidatesWithLlm,
  parseJdWithLlm,
} from "./llm";
import { buildCandidateCards, dedupeLeadsByUrl } from "./normalize";
import {
  isProviderName,
  mapSerperResultsToLeads,
  serperSearch,
} from "./providers";
import type {
  CandidateLead,
  CostLedgerEntry,
  ParsedSearchIntent,
  ProviderName,
  SearchBudget,
  SourcingLane,
  SourcingRunMode,
} from "./types";

type CliOptions = {
  jdPath: string | null;
  outDir: string;
  mode: SourcingRunMode;
  allowPaid: boolean;
  totalBudgetUsd: number;
  brightBudgetUsd: number;
  providers: ProviderName[];
  maxQueriesPerProvider: number;
  maxResultsPerQuery: number;
  skipScreen: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    jdPath: null,
    outDir: "runs/sourcing",
    mode: "dry-run",
    allowPaid: false,
    totalBudgetUsd: 50,
    brightBudgetUsd: 5,
    providers: ["serper"],
    maxQueriesPerProvider: 6,
    maxResultsPerQuery: 10,
    skipScreen: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
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
    if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length);
      continue;
    }
    if (arg === "--out-dir") {
      index += 1;
      options.outDir = argv[index] ?? options.outDir;
      continue;
    }
    if (arg.startsWith("--total-budget-usd=")) {
      options.totalBudgetUsd = parsePositiveNumber(arg.split("=")[1], options.totalBudgetUsd);
      continue;
    }
    if (arg.startsWith("--bright-budget-usd=")) {
      options.brightBudgetUsd = parseNonNegativeNumber(
        arg.split("=")[1],
        options.brightBudgetUsd,
      );
      continue;
    }
    if (arg.startsWith("--max-queries-per-provider=")) {
      options.maxQueriesPerProvider = parsePositiveInt(
        arg.split("=")[1],
        options.maxQueriesPerProvider,
      );
      continue;
    }
    if (arg.startsWith("--max-results-per-query=")) {
      options.maxResultsPerQuery = parsePositiveInt(
        arg.split("=")[1],
        options.maxResultsPerQuery,
      );
      continue;
    }
    if (arg.startsWith("--providers=")) {
      const providers = arg
        .slice("--providers=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const invalid = providers.find((provider) => !isProviderName(provider));
      if (invalid) throw new Error(`Unknown provider: ${invalid}`);
      options.providers = providers as ProviderName[];
      continue;
    }
    if (!options.jdPath) {
      options.jdPath = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.jdPath) {
    throw new Error(
      "Usage: npx tsx scripts/sourcing/run-cold-start.ts <jd-file> [--dry-run|--live] [--allow-paid] [--providers=serper] [--out-dir=runs/sourcing]",
    );
  }
  return options;
}

async function main() {
  loadLocalEnv(path.resolve(process.cwd()));
  const options = parseArgs(process.argv.slice(2));
  const runId = createRunId();
  const runDir = createRunDir(options.outDir, runId);
  const jdPath = path.resolve(options.jdPath!);
  const jdText = readTextFile(jdPath);
  const budget = createBudget({
    totalUsdCap: options.totalBudgetUsd,
    brightUsdCap: options.brightBudgetUsd,
    allowPaid: options.allowPaid,
  });

  writeManifest(runDir, {
    run_id: runId,
    created_at: new Date().toISOString(),
    mode: options.mode,
    jd_path: jdPath,
    budget,
    providers: options.providers,
  });
  writeText(path.join(runDir, "jd.txt"), jdText);

  const parseResult = await parseJdWithLlm(jdText);
  const intent = normalizeIntent(parseResult.data);
  writeJson(path.join(runDir, "parsed-intent.json"), {
    intent,
    usage: parseResult.usage,
    latency_ms: parseResult.latencyMs,
  });

  const laneResult = await generateSourcingLanesWithLlm({ jdText, intent });
  const lanes = normalizeLanes(laneResult.data.lanes, options.providers);
  writeJson(path.join(runDir, "sourcing-lanes.json"), {
    lanes,
    usage: laneResult.usage,
    latency_ms: laneResult.latencyMs,
  });

  const planned = planProviderCalls({
    runId,
    lanes,
    budget,
    maxQueriesPerProvider: options.maxQueriesPerProvider,
    maxResultsPerQuery: options.maxResultsPerQuery,
  });
  writeJson(path.join(runDir, "provider-plan.json"), planned);
  for (const entry of planned.ledger) appendLedger(runDir, entry);

  if (options.mode === "dry-run") {
    writeJson(path.join(runDir, "summary.json"), {
      status: "planned",
      run_id: runId,
      run_dir: runDir,
      next: "Run with --live --allow-paid to execute paid discovery calls within the configured caps.",
    });
    console.log(`Dry run complete: ${runDir}`);
    return;
  }

  const leads = await executeProviderPlan({
    runDir,
    budget,
    planned: planned.ledger,
    maxResultsPerQuery: options.maxResultsPerQuery,
  });
  const dedupedLeads = dedupeLeadsByUrl(leads);
  const cards = buildCandidateCards(dedupedLeads, 30);
  writeJson(path.join(runDir, "candidate-leads.json"), { leads, deduped_count: dedupedLeads.length });
  writeJson(path.join(runDir, "candidate-cards.json"), { cards });

  if (!options.skipScreen && cards.length > 0) {
    const screenResult = await lightScreenCandidatesWithLlm({
      jdText,
      intent,
      cards: cards.slice(0, 20),
    });
    writeJson(path.join(runDir, "light-screen.json"), {
      decisions: screenResult.data.decisions,
      usage: screenResult.usage,
      latency_ms: screenResult.latencyMs,
    });
  }

  writeJson(path.join(runDir, "summary.json"), {
    status: "completed",
    run_id: runId,
    run_dir: runDir,
    lanes: lanes.length,
    raw_leads: leads.length,
    deduped_leads: dedupedLeads.length,
    candidate_cards: cards.length,
  });
  console.log(`Live run complete: ${runDir}`);
}

function planProviderCalls(params: {
  runId: string;
  lanes: SourcingLane[];
  budget: SearchBudget;
  maxQueriesPerProvider: number;
  maxResultsPerQuery: number;
}) {
  const ledger: CostLedgerEntry[] = [];
  let spentUsd = 0;
  let brightSpentUsd = 0;
  const queryCountByProvider = new Map<ProviderName, number>();

  for (const lane of params.lanes) {
    for (const query of lane.queries) {
      if (query.provider !== "serper") continue;
      const currentCount = queryCountByProvider.get(query.provider) ?? 0;
      if (currentCount >= params.maxQueriesPerProvider) continue;

      const estimatedCostUsd = estimateProviderCost(query.provider, params.maxResultsPerQuery);
      try {
        assertBudgetAllowsCall({
          provider: query.provider,
          estimatedCostUsd,
          budget: params.budget,
          spentUsd,
          brightSpentUsd,
        });
        spentUsd += estimatedCostUsd;
        if (query.provider === "bright") brightSpentUsd += estimatedCostUsd;
        queryCountByProvider.set(query.provider, currentCount + 1);
        ledger.push(
          plannedLedgerEntry({
            runId: params.runId,
            provider: query.provider,
            operation: "search",
            laneId: lane.lane_id,
            query: query.query,
            estimatedCostUsd,
            metadata: { maxResults: params.maxResultsPerQuery },
          }),
        );
      } catch (error) {
        ledger.push(
          plannedLedgerEntry({
            runId: params.runId,
            provider: query.provider,
            operation: "search",
            laneId: lane.lane_id,
            query: query.query,
            estimatedCostUsd,
            status: "blocked",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }

  return {
    estimated_total_usd: spentUsd,
    estimated_bright_usd: brightSpentUsd,
    ledger,
  };
}

async function executeProviderPlan(params: {
  runDir: string;
  budget: SearchBudget;
  planned: CostLedgerEntry[];
  maxResultsPerQuery: number;
}) {
  const leads: CandidateLead[] = [];
  let spentUsd = 0;
  let brightSpentUsd = 0;

  for (const entry of params.planned) {
    if (entry.status === "blocked") continue;
    try {
      assertBudgetAllowsCall({
        provider: entry.provider,
        estimatedCostUsd: entry.estimated_cost_usd,
        budget: params.budget,
        spentUsd,
        brightSpentUsd,
      });
      const startedAt = Date.now();
      if (entry.provider !== "serper") continue;
      const results = await serperSearch({
        query: entry.query || "",
        num: params.maxResultsPerQuery,
      });
      const mapped = mapSerperResultsToLeads({
        laneId: entry.lane_id || "unknown",
        results,
      });
      leads.push(...mapped);
      spentUsd += entry.estimated_cost_usd;
      appendLedger(
        params.runDir,
        completedLedgerEntry(entry, {
          status: "success",
          actual_cost_usd: entry.estimated_cost_usd,
          latency_ms: Date.now() - startedAt,
          returned_count: results.length,
        }),
      );
    } catch (error) {
      appendLedger(
        params.runDir,
        completedLedgerEntry(entry, {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return leads;
}

function estimateProviderCost(provider: ProviderName, maxResults: number) {
  if (provider === "serper") return 0.001 * Math.max(1, Math.ceil(maxResults / 10));
  if (provider === "bright") return 0.0025 * maxResults;
  if (provider === "exa") return 0.005;
  if (provider === "firecrawl") return 0.002;
  return 0;
}

function normalizeIntent(value: ParsedSearchIntent): ParsedSearchIntent {
  return {
    role_family: asString(value.role_family, "other"),
    target_title: asString(value.target_title, "Unknown role"),
    seniority: asString(value.seniority, "unspecified"),
    must_have: asStringArray(value.must_have),
    nice_to_have: asStringArray(value.nice_to_have),
    location: value.location ? String(value.location) : null,
    target_companies: asStringArray(value.target_companies),
    adjacent_backgrounds: asStringArray(value.adjacent_backgrounds),
    avoid: asStringArray(value.avoid),
    notes: asStringArray(value.notes),
  };
}

function normalizeLanes(lanes: SourcingLane[], allowedProviders: ProviderName[]) {
  const allowed = new Set(allowedProviders);
  return lanes
    .map((lane, index) => ({
      ...lane,
      lane_id: lane.lane_id || `lane-${index + 1}`,
      provider_hints: lane.provider_hints.filter((provider) => allowed.has(provider)),
      queries: lane.queries.filter((query) => allowed.has(query.provider)),
      max_results: Number.isFinite(lane.max_results) ? lane.max_results : 10,
    }))
    .filter((lane) => lane.queries.length > 0);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
