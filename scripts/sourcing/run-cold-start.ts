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
  diagnoseLanesWithLlm,
  generateSourcingLanesWithLlm,
  lightScreenCandidatesWithLlm,
  parseJdWithLlm,
} from "./llm";
import { buildCandidateCards, dedupeLeadsByUrl } from "./normalize";
import {
  buildBrightProbeFilter,
  exaSearch,
  fetchGithubEvidence,
  firecrawlExtractUrl,
  isProviderName,
  mapBrightProfilesToLeads,
  mapExaResultsToLeads,
  mapFirecrawlExtractionToLead,
  mapGithubEvidenceToLead,
  mapSerperResultsToLeads,
  runBrightProbe,
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
  maxFirecrawlUrls: number;
  brightRecordsLimit: number;
  skipScreen: boolean;
  noLlmCache: boolean;
  llmCacheDir: string | null;
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
    maxFirecrawlUrls: 3,
    brightRecordsLimit: 25,
    skipScreen: false,
    noLlmCache: false,
    llmCacheDir: null,
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
    if (arg === "--no-llm-cache") {
      options.noLlmCache = true;
      continue;
    }
    if (arg.startsWith("--llm-cache-dir=")) {
      options.llmCacheDir = arg.slice("--llm-cache-dir=".length);
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
    if (arg.startsWith("--max-firecrawl-urls=")) {
      options.maxFirecrawlUrls = parsePositiveInt(
        arg.split("=")[1],
        options.maxFirecrawlUrls,
      );
      continue;
    }
    if (arg.startsWith("--bright-records-limit=")) {
      options.brightRecordsLimit = Math.min(
        100,
        parsePositiveInt(arg.split("=")[1], options.brightRecordsLimit),
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
    options: {
      maxQueriesPerProvider: options.maxQueriesPerProvider,
      maxResultsPerQuery: options.maxResultsPerQuery,
      maxFirecrawlUrls: options.maxFirecrawlUrls,
      brightRecordsLimit: options.brightRecordsLimit,
      llmCache: !options.noLlmCache,
      llmCacheDir: options.llmCacheDir ? path.resolve(options.llmCacheDir) : null,
    },
  });
  writeText(path.join(runDir, "jd.txt"), jdText);

  const cacheDir = options.noLlmCache
    ? null
    : path.resolve(options.llmCacheDir || path.join(options.outDir, ".llm-cache"));
  const parseResult = await parseJdWithLlm(jdText, { cacheDir });
  const intent = normalizeIntent(parseResult.data);
  writeJson(path.join(runDir, "parsed-intent.json"), {
    intent,
    usage: parseResult.usage,
    latency_ms: parseResult.latencyMs,
    cache_hit: parseResult.cacheHit,
  });

  const laneResult = await generateSourcingLanesWithLlm({ jdText, intent, cacheDir });
  const lanes = normalizeLanes(laneResult.data.lanes, options.providers);
  writeJson(path.join(runDir, "sourcing-lanes.json"), {
    lanes,
    usage: laneResult.usage,
    latency_ms: laneResult.latencyMs,
    cache_hit: laneResult.cacheHit,
  });

  const planned = planProviderCalls({
    runId,
    lanes,
    intent,
    mode: options.mode,
    budget,
    providers: options.providers,
    maxQueriesPerProvider: options.maxQueriesPerProvider,
    maxResultsPerQuery: options.maxResultsPerQuery,
    maxFirecrawlUrls: options.maxFirecrawlUrls,
    brightRecordsLimit: options.brightRecordsLimit,
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

  const discovery = await executeProviderPlan({
    runDir,
    intent,
    lanes,
    budget,
    planned: planned.ledger,
    maxResultsPerQuery: options.maxResultsPerQuery,
    brightRecordsLimit: options.brightRecordsLimit,
  });
  const leads = discovery.leads;
  const enrichedLeads = options.providers.includes("firecrawl")
    ? await extractTopUrlEvidence({
        runId,
        runDir,
        budget,
        leads,
        maxUrls: options.maxFirecrawlUrls,
        spentUsd: discovery.spentUsd,
        brightSpentUsd: discovery.brightSpentUsd,
      })
    : leads;
  const githubEnrichedLeads = options.providers.includes("github")
    ? await enrichGithubEvidence({
        runId,
        runDir,
        budget,
        leads: enrichedLeads,
        spentUsd: discovery.spentUsd,
        brightSpentUsd: discovery.brightSpentUsd,
      })
    : enrichedLeads;
  const dedupedLeads = dedupeLeadsByUrl(githubEnrichedLeads);
  const cards = buildCandidateCards(dedupedLeads, 30);
  writeJson(path.join(runDir, "candidate-leads.json"), {
    leads: githubEnrichedLeads,
    raw_count: leads.length,
    enriched_count: githubEnrichedLeads.length,
    deduped_count: dedupedLeads.length,
  });
  writeJson(path.join(runDir, "candidate-cards.json"), { cards });

  if (!options.skipScreen && cards.length > 0) {
    const screenResult = await lightScreenCandidatesWithLlm({
      jdText,
      intent,
      cards: cards.slice(0, 20),
      cacheDir,
    });
    writeJson(path.join(runDir, "light-screen.json"), {
      decisions: screenResult.data.decisions,
      usage: screenResult.usage,
      latency_ms: screenResult.latencyMs,
      cache_hit: screenResult.cacheHit,
    });
    writeText(
      path.join(runDir, "review-samples.csv"),
      buildReviewCsv(cards, screenResult.data.decisions),
    );
  }

  const laneDiagnosis = await diagnoseLanesWithLlm({
    jdText,
    intent,
    lanes,
    laneStats: buildLaneStats(planned.ledger, githubEnrichedLeads),
    cacheDir,
  });
  writeJson(path.join(runDir, "lane-diagnosis.json"), {
    diagnoses: laneDiagnosis.data.diagnoses,
    usage: laneDiagnosis.usage,
    latency_ms: laneDiagnosis.latencyMs,
    cache_hit: laneDiagnosis.cacheHit,
  });

  writeJson(path.join(runDir, "summary.json"), {
    status: "completed",
    run_id: runId,
    run_dir: runDir,
    lanes: lanes.length,
    raw_leads: leads.length,
    enriched_leads: githubEnrichedLeads.length,
    deduped_leads: dedupedLeads.length,
    candidate_cards: cards.length,
  });
  console.log(`Live run complete: ${runDir}`);
}

function planProviderCalls(params: {
  runId: string;
  lanes: SourcingLane[];
  intent: ParsedSearchIntent;
  mode: SourcingRunMode;
  budget: SearchBudget;
  providers: ProviderName[];
  maxQueriesPerProvider: number;
  maxResultsPerQuery: number;
  maxFirecrawlUrls: number;
  brightRecordsLimit: number;
}) {
  const ledger: CostLedgerEntry[] = [];
  let spentUsd = 0;
  let brightSpentUsd = 0;
  const queryCountByProvider = new Map<ProviderName, number>();
  const planningBudget = params.mode === "dry-run"
    ? { ...params.budget, allowPaid: true }
    : params.budget;

  for (const lane of params.lanes) {
    for (const query of lane.queries) {
      if (!["serper", "exa", "bright"].includes(query.provider)) continue;
      const currentCount = queryCountByProvider.get(query.provider) ?? 0;
      if (currentCount >= params.maxQueriesPerProvider) continue;

      const maxResults = query.provider === "bright"
        ? params.brightRecordsLimit
        : params.maxResultsPerQuery;
      const estimatedCostUsd = estimateProviderCost(query.provider, maxResults);
      try {
        assertBudgetAllowsCall({
          provider: query.provider,
          estimatedCostUsd,
          budget: planningBudget,
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
            operation: operationForProvider(query.provider),
            laneId: lane.lane_id,
            query: query.query,
            estimatedCostUsd,
            metadata: {
              maxResults,
              ...(query.provider === "bright"
                ? {
                    brightFilter: buildBrightProbeFilter({ lane, intent: params.intent, query: query.query }),
                  }
                : {}),
            },
          }),
        );
      } catch (error) {
        ledger.push(
          plannedLedgerEntry({
            runId: params.runId,
            provider: query.provider,
            operation: operationForProvider(query.provider),
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

  if (params.providers.includes("firecrawl") && params.maxFirecrawlUrls > 0) {
    const estimatedCostUsd = estimateProviderCost("firecrawl", params.maxFirecrawlUrls);
    try {
      assertBudgetAllowsCall({
        provider: "firecrawl",
        estimatedCostUsd,
        budget: planningBudget,
        spentUsd,
        brightSpentUsd,
      });
      spentUsd += estimatedCostUsd;
      ledger.push(
        plannedLedgerEntry({
          runId: params.runId,
          provider: "firecrawl",
          operation: "extract_url",
          estimatedCostUsd,
          metadata: { maxUrls: params.maxFirecrawlUrls, execution: "post_discovery_top_urls" },
        }),
      );
    } catch (error) {
      ledger.push(
        plannedLedgerEntry({
          runId: params.runId,
          provider: "firecrawl",
          operation: "extract_url",
          estimatedCostUsd,
          status: "blocked",
          message: error instanceof Error ? error.message : String(error),
          metadata: { maxUrls: params.maxFirecrawlUrls, execution: "post_discovery_top_urls" },
        }),
      );
    }
  }

  return {
    estimated_total_usd: spentUsd,
    estimated_bright_usd: brightSpentUsd,
    ledger,
  };
}

function operationForProvider(provider: ProviderName) {
  if (provider === "exa") return "semantic_search";
  if (provider === "bright") return "bright_filter_probe";
  return "search";
}

async function executeProviderPlan(params: {
  runDir: string;
  intent: ParsedSearchIntent;
  lanes: SourcingLane[];
  budget: SearchBudget;
  planned: CostLedgerEntry[];
  maxResultsPerQuery: number;
  brightRecordsLimit: number;
}) {
  const leads: CandidateLead[] = [];
  let spentUsd = 0;
  let brightSpentUsd = 0;

  for (const entry of params.planned) {
    if (entry.status === "blocked") continue;
    if (entry.provider === "firecrawl") continue;
    try {
      assertBudgetAllowsCall({
        provider: entry.provider,
        estimatedCostUsd: entry.estimated_cost_usd,
        budget: params.budget,
        spentUsd,
        brightSpentUsd,
      });
      const startedAt = Date.now();
      const mapped = await executeDiscoveryEntry({
        entry,
        intent: params.intent,
        lanes: params.lanes,
        maxResultsPerQuery: params.maxResultsPerQuery,
        brightRecordsLimit: params.brightRecordsLimit,
      });
      leads.push(...mapped);
      spentUsd += entry.estimated_cost_usd;
      if (entry.provider === "bright") brightSpentUsd += entry.estimated_cost_usd;
      appendLedger(
        params.runDir,
        completedLedgerEntry(entry, {
          status: "success",
          actual_cost_usd: entry.estimated_cost_usd,
          latency_ms: Date.now() - startedAt,
          returned_count: mapped.length,
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

  return { leads, spentUsd, brightSpentUsd };
}

async function executeDiscoveryEntry(params: {
  entry: CostLedgerEntry;
  intent: ParsedSearchIntent;
  lanes: SourcingLane[];
  maxResultsPerQuery: number;
  brightRecordsLimit: number;
}) {
  if (params.entry.provider === "serper") {
    const results = await serperSearch({
      query: params.entry.query || "",
      num: params.maxResultsPerQuery,
    });
    return mapSerperResultsToLeads({
      laneId: params.entry.lane_id || "unknown",
      results,
    });
  }

  if (params.entry.provider === "exa") {
    const payload = await exaSearch({
      query: params.entry.query || "",
      numResults: params.maxResultsPerQuery,
    });
    return mapExaResultsToLeads({
      laneId: params.entry.lane_id || "unknown",
      payload,
    });
  }

  if (params.entry.provider === "bright") {
    const lane = params.lanes.find((item) => item.lane_id === params.entry.lane_id);
    if (!lane) throw new Error(`Bright lane not found: ${params.entry.lane_id}`);
    const result = await runBrightProbe({
      lane,
      intent: params.intent,
      query: params.entry.query || "",
      recordsLimit: Math.min(100, params.brightRecordsLimit),
    });
    return mapBrightProfilesToLeads({
      laneId: params.entry.lane_id || "unknown",
      profiles: result.profiles,
    });
  }

  return [];
}

async function extractTopUrlEvidence(params: {
  runId: string;
  runDir: string;
  budget: SearchBudget;
  leads: CandidateLead[];
  maxUrls: number;
  spentUsd: number;
  brightSpentUsd: number;
}) {
  const selected = dedupeLeadsByUrl(params.leads)
    .filter((lead) => lead.source_type !== "linkedin")
    .slice(0, params.maxUrls);
  if (selected.length === 0) return params.leads;

  const enriched = new Map(params.leads.map((lead) => [lead.lead_id, lead]));
  const evidence: Array<{ lead_id: string; url: string; status: string; error?: string | null }> = [];
  let spentUsd = params.spentUsd;
  let brightSpentUsd = params.brightSpentUsd;

  for (const lead of selected) {
    const estimatedCostUsd = estimateProviderCost("firecrawl", 1);
    const planned = plannedLedgerEntry({
      runId: params.runId,
      provider: "firecrawl",
      operation: "extract_url",
      query: lead.url,
      laneId: lead.lane_id,
      estimatedCostUsd,
    });
    appendLedger(params.runDir, planned);
    try {
      assertBudgetAllowsCall({
        provider: "firecrawl",
        estimatedCostUsd,
        budget: params.budget,
        spentUsd,
        brightSpentUsd,
      });
      const startedAt = Date.now();
      const payload = await firecrawlExtractUrl({ url: lead.url });
      const updated = mapFirecrawlExtractionToLead({ sourceLead: lead, payload });
      enriched.set(lead.lead_id, updated);
      spentUsd += estimatedCostUsd;
      appendLedger(params.runDir, completedLedgerEntry(planned, {
        status: "success",
        actual_cost_usd: estimatedCostUsd,
        latency_ms: Date.now() - startedAt,
        returned_count: 1,
      }));
      evidence.push({ lead_id: lead.lead_id, url: lead.url, status: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLedger(params.runDir, completedLedgerEntry(planned, {
        status: "error",
        message,
      }));
      evidence.push({ lead_id: lead.lead_id, url: lead.url, status: "error", error: message });
    }
  }

  writeJson(path.join(params.runDir, "extracted-evidence.json"), evidence);
  return Array.from(enriched.values());
}

async function enrichGithubEvidence(params: {
  runId: string;
  runDir: string;
  budget: SearchBudget;
  leads: CandidateLead[];
  spentUsd: number;
  brightSpentUsd: number;
}) {
  const selected = dedupeLeadsByUrl(params.leads)
    .filter((lead) => lead.source_type === "github")
    .slice(0, 5);
  if (selected.length === 0) return params.leads;

  const enriched = new Map(params.leads.map((lead) => [lead.lead_id, lead]));
  const evidence: Array<{ lead_id: string; url: string; status: string; error?: string | null }> = [];
  let spentUsd = params.spentUsd;

  for (const lead of selected) {
    const estimatedCostUsd = estimateProviderCost("github", 1);
    const planned = plannedLedgerEntry({
      runId: params.runId,
      provider: "github",
      operation: "extract_url",
      query: lead.url,
      laneId: lead.lane_id,
      estimatedCostUsd,
    });
    appendLedger(params.runDir, planned);
    try {
      assertBudgetAllowsCall({
        provider: "github",
        estimatedCostUsd,
        budget: params.budget,
        spentUsd,
        brightSpentUsd: params.brightSpentUsd,
      });
      const startedAt = Date.now();
      const payload = await fetchGithubEvidence({ url: lead.url });
      const updated = mapGithubEvidenceToLead({ sourceLead: lead, payload });
      enriched.set(lead.lead_id, updated);
      spentUsd += estimatedCostUsd;
      appendLedger(params.runDir, completedLedgerEntry(planned, {
        status: "success",
        actual_cost_usd: estimatedCostUsd,
        latency_ms: Date.now() - startedAt,
        returned_count: 1,
      }));
      evidence.push({ lead_id: lead.lead_id, url: lead.url, status: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLedger(params.runDir, completedLedgerEntry(planned, {
        status: "error",
        message,
      }));
      evidence.push({ lead_id: lead.lead_id, url: lead.url, status: "error", error: message });
    }
  }

  writeJson(path.join(params.runDir, "github-evidence.json"), evidence);
  return Array.from(enriched.values());
}

function estimateProviderCost(provider: ProviderName, maxResults: number) {
  if (provider === "serper") return 0.001 * Math.max(1, Math.ceil(maxResults / 10));
  if (provider === "bright") return 0.0025 * maxResults;
  if (provider === "exa") return 0.005 * Math.max(1, Math.ceil(maxResults / 10));
  if (provider === "firecrawl") return 0.002 * Math.max(1, maxResults);
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

function buildReviewCsv(
  cards: Array<{ candidate_id: string; name: string | null; headline: string | null; profile_urls: string[]; evidence_summary: string }>,
  decisions: Array<{
    candidate_id: string;
    would_advance: string;
    reason: string;
    deal_breaker: string | null;
    missing_evidence: string[];
    source_confidence: string;
    profile_completeness: string;
    suggested_next_action: string;
  }>,
) {
  const decisionsById = new Map(decisions.map((decision) => [decision.candidate_id, decision]));
  const rows = [
    [
      "candidate_id",
      "would_advance",
      "suggested_next_action",
      "source_confidence",
      "profile_completeness",
      "name",
      "headline",
      "profile_urls",
      "reason",
      "deal_breaker",
      "missing_evidence",
      "evidence_summary",
    ],
  ];
  for (const card of cards) {
    const decision = decisionsById.get(card.candidate_id);
    rows.push([
      card.candidate_id,
      decision?.would_advance ?? "",
      decision?.suggested_next_action ?? "",
      decision?.source_confidence ?? "",
      decision?.profile_completeness ?? "",
      card.name ?? "",
      card.headline ?? "",
      card.profile_urls.join(" "),
      decision?.reason ?? "",
      decision?.deal_breaker ?? "",
      decision?.missing_evidence.join("; ") ?? "",
      card.evidence_summary,
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function buildLaneStats(ledger: CostLedgerEntry[], leads: CandidateLead[]) {
  const laneIds = new Set<string>();
  for (const entry of ledger) {
    if (entry.lane_id) laneIds.add(entry.lane_id);
  }
  for (const lead of leads) {
    laneIds.add(lead.lane_id);
  }

  return Array.from(laneIds).map((laneId) => {
    const entries = ledger.filter((entry) => entry.lane_id === laneId);
    const laneLeads = leads.filter((lead) => lead.lane_id === laneId);
    return {
      lane_id: laneId,
      provider: Array.from(new Set(entries.map((entry) => entry.provider))).join(","),
      planned_queries: entries.length,
      success_count: entries.filter((entry) => entry.status === "success").length,
      error_count: entries.filter((entry) => entry.status === "error").length,
      returned_count: entries.reduce((sum, entry) => sum + (entry.returned_count ?? 0), 0),
      lead_count: laneLeads.length,
      sample_queries: entries.map((entry) => entry.query).filter((value): value is string => Boolean(value)).slice(0, 3),
      sample_errors: entries.map((entry) => entry.message).filter((value): value is string => Boolean(value)).slice(0, 3),
    };
  });
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

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
