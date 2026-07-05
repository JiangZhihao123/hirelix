import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  coldDir: string | null;
  warmDir: string | null;
  outPath: string | null;
  jsonOutPath: string | null;
};

type BenchmarkSummary = {
  benchmark_id?: string;
  mode?: string;
  providers?: string[];
  totals?: {
    actual_cost_usd?: number;
    estimated_cost_usd?: number;
    candidate_cards?: number;
    yes?: number;
    maybe?: number;
    no?: number;
    reviewable_candidates?: number;
    contact_worthy_candidates?: number;
  };
  runs?: Array<{
    jd_id: string;
    title?: string;
    status?: string;
    run_dir?: string | null;
    candidate_cards?: number;
    yes?: number;
    maybe?: number;
    no?: number;
    actual_cost_usd?: number;
    estimated_cost_usd?: number;
  }>;
};

type LlmCacheStats = {
  files: number;
  cache_hits: number;
  cache_misses: number;
  total_latency_ms: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    coldDir: null,
    warmDir: null,
    outPath: null,
    jsonOutPath: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--cold=")) {
      options.coldDir = arg.slice("--cold=".length);
      continue;
    }
    if (arg.startsWith("--warm=")) {
      options.warmDir = arg.slice("--warm=".length);
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("--json-out=")) {
      options.jsonOutPath = arg.slice("--json-out=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.coldDir || !options.warmDir) {
    throw new Error(
      "Usage: npx tsx scripts/sourcing/compare-warm-rerun.ts --cold=<cold-benchmark-dir> --warm=<warm-benchmark-dir> [--out=report.md]",
    );
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const coldDir = path.resolve(options.coldDir!);
  const warmDir = path.resolve(options.warmDir!);
  const cold = readSummary(coldDir);
  const warm = readSummary(warmDir);
  const comparison = buildComparison({ coldDir, warmDir, cold, warm });
  const outPath = path.resolve(options.outPath || path.join(warmDir, "warm-comparison.md"));
  const jsonOutPath = path.resolve(options.jsonOutPath || path.join(warmDir, "warm-comparison.json"));
  writeText(outPath, buildMarkdownReport(comparison));
  writeJson(jsonOutPath, comparison);
  console.log(`Warm comparison complete: ${outPath}`);
}

function readSummary(dir: string): BenchmarkSummary {
  return readJson(path.join(dir, "benchmark-summary.json")) as BenchmarkSummary;
}

function buildComparison(params: {
  coldDir: string;
  warmDir: string;
  cold: BenchmarkSummary;
  warm: BenchmarkSummary;
}) {
  const coldRuns = new Map((params.cold.runs || []).map((run) => [run.jd_id, run]));
  const warmRuns = new Map((params.warm.runs || []).map((run) => [run.jd_id, run]));
  const jdIds = Array.from(new Set([...coldRuns.keys(), ...warmRuns.keys()])).sort();
  const runs = jdIds.map((jdId) => {
    const coldRun = coldRuns.get(jdId);
    const warmRun = warmRuns.get(jdId);
    return {
      jd_id: jdId,
      title: warmRun?.title || coldRun?.title || "",
      cold_status: coldRun?.status || "missing",
      warm_status: warmRun?.status || "missing",
      cold_cards: numeric(coldRun?.candidate_cards),
      warm_cards: numeric(warmRun?.candidate_cards),
      cards_delta: numeric(warmRun?.candidate_cards) - numeric(coldRun?.candidate_cards),
      cold_contact_worthy: numeric(coldRun?.yes),
      warm_contact_worthy: numeric(warmRun?.yes),
      contact_worthy_delta: numeric(warmRun?.yes) - numeric(coldRun?.yes),
      cold_reviewable: numeric(coldRun?.yes) + numeric(coldRun?.maybe),
      warm_reviewable: numeric(warmRun?.yes) + numeric(warmRun?.maybe),
      reviewable_delta:
        numeric(warmRun?.yes) + numeric(warmRun?.maybe) -
        numeric(coldRun?.yes) - numeric(coldRun?.maybe),
      cold_actual_cost_usd: money(coldRun?.actual_cost_usd),
      warm_actual_cost_usd: money(warmRun?.actual_cost_usd),
      actual_cost_delta_usd: money(numeric(warmRun?.actual_cost_usd) - numeric(coldRun?.actual_cost_usd)),
    };
  });

  const coldLlmCache = collectLlmCacheStats(params.cold);
  const warmLlmCache = collectLlmCacheStats(params.warm);
  const coldTotals = normalizeTotals(params.cold);
  const warmTotals = normalizeTotals(params.warm);

  return {
    cold: {
      benchmark_id: params.cold.benchmark_id,
      dir: params.coldDir,
      mode: params.cold.mode,
      providers: params.cold.providers || [],
      totals: coldTotals,
      llm_cache: coldLlmCache,
    },
    warm: {
      benchmark_id: params.warm.benchmark_id,
      dir: params.warmDir,
      mode: params.warm.mode,
      providers: params.warm.providers || [],
      totals: warmTotals,
      llm_cache: warmLlmCache,
    },
    delta: {
      actual_cost_usd: money(warmTotals.actual_cost_usd - coldTotals.actual_cost_usd),
      estimated_cost_usd: money(warmTotals.estimated_cost_usd - coldTotals.estimated_cost_usd),
      candidate_cards: warmTotals.candidate_cards - coldTotals.candidate_cards,
      reviewable_candidates: warmTotals.reviewable_candidates - coldTotals.reviewable_candidates,
      contact_worthy_candidates:
        warmTotals.contact_worthy_candidates - coldTotals.contact_worthy_candidates,
      llm_cache_hits: warmLlmCache.cache_hits - coldLlmCache.cache_hits,
      llm_latency_ms: warmLlmCache.total_latency_ms - coldLlmCache.total_latency_ms,
    },
    runs,
    interpretation: buildInterpretation(coldLlmCache, warmLlmCache, coldTotals, warmTotals),
  };
}

function normalizeTotals(summary: BenchmarkSummary) {
  const totals = summary.totals || {};
  const yes = numeric(totals.yes);
  const maybe = numeric(totals.maybe);
  return {
    actual_cost_usd: money(totals.actual_cost_usd),
    estimated_cost_usd: money(totals.estimated_cost_usd),
    candidate_cards: numeric(totals.candidate_cards),
    reviewable_candidates: numeric(totals.reviewable_candidates) || yes + maybe,
    contact_worthy_candidates: numeric(totals.contact_worthy_candidates) || yes,
    yes,
    maybe,
    no: numeric(totals.no),
  };
}

function collectLlmCacheStats(summary: BenchmarkSummary): LlmCacheStats {
  const stats: LlmCacheStats = {
    files: 0,
    cache_hits: 0,
    cache_misses: 0,
    total_latency_ms: 0,
  };
  const names = ["parsed-intent.json", "sourcing-lanes.json", "light-screen.json", "lane-diagnosis.json"];
  for (const run of summary.runs || []) {
    if (!run.run_dir) continue;
    for (const name of names) {
      const filePath = path.join(run.run_dir, name);
      if (!fs.existsSync(filePath)) continue;
      const value = readJson(filePath) as { cache_hit?: boolean; latency_ms?: number };
      stats.files += 1;
      if (value.cache_hit) stats.cache_hits += 1;
      else stats.cache_misses += 1;
      stats.total_latency_ms += numeric(value.latency_ms);
    }
  }
  return stats;
}

function buildInterpretation(
  coldLlm: LlmCacheStats,
  warmLlm: LlmCacheStats,
  coldTotals: ReturnType<typeof normalizeTotals>,
  warmTotals: ReturnType<typeof normalizeTotals>,
) {
  const notes: string[] = [];
  if (warmLlm.cache_hits > coldLlm.cache_hits) {
    notes.push("warm rerun hit more LLM cache, so repeated parsing/screening cost and latency should drop.");
  }
  if (warmTotals.actual_cost_usd >= coldTotals.actual_cost_usd && warmTotals.candidate_cards > 0) {
    notes.push("external provider cost did not drop; current prototype has LLM cache, not a reusable provider/profile index.");
  }
  if (warmTotals.contact_worthy_candidates < coldTotals.contact_worthy_candidates) {
    notes.push("warm run produced fewer contact-worthy candidates; inspect provider variance before treating warm index as stable.");
  }
  if (notes.length === 0) {
    notes.push("comparison is structurally valid, but there is not enough live candidate data to infer warm-index value.");
  }
  return notes;
}

function buildMarkdownReport(comparison: ReturnType<typeof buildComparison>) {
  const lines = [
    "# Cold vs Warm Sourcing Comparison",
    "",
    `- Cold: \`${comparison.cold.benchmark_id || "unknown"}\``,
    `- Warm: \`${comparison.warm.benchmark_id || "unknown"}\``,
    `- Mode: cold \`${comparison.cold.mode || "unknown"}\`, warm \`${comparison.warm.mode || "unknown"}\``,
    `- Providers: cold \`${comparison.cold.providers.join(",")}\`, warm \`${comparison.warm.providers.join(",")}\``,
    "",
    "## Totals",
    "",
    "| Metric | Cold | Warm | Delta |",
    "| --- | ---: | ---: | ---: |",
    `| Actual cost | $${comparison.cold.totals.actual_cost_usd.toFixed(4)} | $${comparison.warm.totals.actual_cost_usd.toFixed(4)} | $${comparison.delta.actual_cost_usd.toFixed(4)} |`,
    `| Candidate cards | ${comparison.cold.totals.candidate_cards} | ${comparison.warm.totals.candidate_cards} | ${comparison.delta.candidate_cards} |`,
    `| Reviewable candidates | ${comparison.cold.totals.reviewable_candidates} | ${comparison.warm.totals.reviewable_candidates} | ${comparison.delta.reviewable_candidates} |`,
    `| Contact-worthy candidates | ${comparison.cold.totals.contact_worthy_candidates} | ${comparison.warm.totals.contact_worthy_candidates} | ${comparison.delta.contact_worthy_candidates} |`,
    `| LLM cache hits | ${comparison.cold.llm_cache.cache_hits} | ${comparison.warm.llm_cache.cache_hits} | ${comparison.delta.llm_cache_hits} |`,
    `| LLM latency | ${comparison.cold.llm_cache.total_latency_ms} ms | ${comparison.warm.llm_cache.total_latency_ms} ms | ${comparison.delta.llm_latency_ms} ms |`,
    "",
    "## JD Rows",
    "",
    "| JD | Cold cards | Warm cards | Cold contact-worthy | Warm contact-worthy | Cost delta |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const run of comparison.runs) {
    lines.push(
      `| ${run.jd_id} ${escapePipe(run.title)} | ${run.cold_cards} | ${run.warm_cards} | ${run.cold_contact_worthy} | ${run.warm_contact_worthy} | $${run.actual_cost_delta_usd.toFixed(4)} |`,
    );
  }
  lines.push("", "## Interpretation", "");
  for (const note of comparison.interpretation) {
    lines.push(`- ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function money(value: unknown) {
  return Math.round(numeric(value) * 10000) / 10000;
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|");
}

main();
