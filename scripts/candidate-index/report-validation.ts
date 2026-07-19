import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { closeDb, db } from "@/db/client";
import {
  hirelix_candidate_comparisons,
  hirelix_candidates,
  hirelix_llm_usage_events,
  hirelix_search_jobs,
  hirelix_searches,
} from "@/db/schema";

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || null;
}

function csv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] || 0) + 1;
  return counts;
}

async function main() {
  const searchId = arg("search-id");
  if (!searchId) throw new Error("--search-id is required");
  const balanceBefore = Number(arg("balance-before"));
  const balanceAfter = Number(arg("balance-after"));
  const runStartedAt = arg("run-started-at");
  const outDir = path.resolve(arg("out-dir") || `runs/candidate-index/${searchId}`);

  const [search] = await db.select().from(hirelix_searches).where(eq(hirelix_searches.id, searchId)).limit(1);
  const [job] = await db.select().from(hirelix_search_jobs).where(eq(hirelix_search_jobs.search_id, searchId)).limit(1);
  if (!search || !job) throw new Error("Validation search or job not found");
  const candidates = await db.select().from(hirelix_candidates).where(eq(hirelix_candidates.search_id, searchId));
  const comparisons = await db.select().from(hirelix_candidate_comparisons).where(eq(hirelix_candidate_comparisons.search_id, searchId));
  const allUsage = await db.select().from(hirelix_llm_usage_events).where(eq(hirelix_llm_usage_events.search_id, searchId));
  const usage = runStartedAt
    ? allUsage.filter((item) => item.created_at && item.created_at >= new Date(runStartedAt))
    : allUsage;
  const parsed = search.parsed_requirements && typeof search.parsed_requirements === "object"
    ? search.parsed_requirements as Record<string, unknown>
    : {};
  const displayStats = parsed.display_stats && typeof parsed.display_stats === "object"
    ? parsed.display_stats as Record<string, unknown>
    : {};
  const indexMetrics = parsed.candidate_index_metrics && typeof parsed.candidate_index_metrics === "object"
    ? parsed.candidate_index_metrics as Record<string, unknown>
    : {};
  const top20 = candidates.filter((item) => (item.final_rank || Number.POSITIVE_INFINITY) <= 20)
    .sort((left, right) => (left.final_rank || 0) - (right.final_rank || 0));
  const swapRows = comparisons.filter((item) => item.is_order_swap);
  const stableSwapRows = swapRows.filter((item) => item.is_stable);
  const orderSwapConsistency = swapRows.length === 0 ? null : stableSwapRows.length / swapRows.length;
  const swapPairKeys = [...new Set(swapRows.map((item) => item.pair_key))];
  const effectiveSwapPairCount = swapPairKeys.filter((pairKey) => comparisons.some((item) => item.pair_key === pairKey && item.included_in_fit)).length;
  const effectiveOrderSwapConsistency = swapPairKeys.length === 0 ? null : effectiveSwapPairCount / swapPairKeys.length;
  const actualBrightCost = Number.isFinite(balanceBefore) && Number.isFinite(balanceAfter)
    ? Math.round((balanceBefore - balanceAfter) * 100) / 100
    : null;
  const usageByStage = Object.entries(countBy(usage, (item) => item.stage)).map(([stage, calls]) => {
    const rows = usage.filter((item) => item.stage === stage);
    return {
      stage,
      calls,
      success: rows.filter((item) => item.status === "success").length,
      errors: rows.filter((item) => item.status === "error").length,
      input_tokens: rows.reduce((sum, item) => sum + (item.input_tokens || 0), 0),
      output_tokens: rows.reduce((sum, item) => sum + (item.output_tokens || 0), 0),
      average_latency_ms: rows.length === 0 ? null : Math.round(rows.reduce((sum, item) => sum + (item.latency_ms || 0), 0) / rows.length),
    };
  });
  const systemTop20Decisions = countBy(top20, (item) => item.final_decision || "unknown");
  const top20Summary = top20.map((item) => ({
    final_rank: item.final_rank,
    name: item.name,
    headline: item.headline,
    location: item.location,
    qualification_decision: item.qualification_decision,
    final_decision: item.final_decision,
    rank_low: item.rank_low,
    rank_high: item.rank_high,
    retrieval_rank: item.retrieval_rank,
    profile_url: item.profile_url,
  }));
  const report = {
    generated_at: new Date().toISOString(),
    search_id: searchId,
    fixture: "zillow-p749437-2",
    status: { search: search.status, job: job.status, pipeline_step: search.pipeline_step },
    bright: {
      requested: displayStats.bright_profiles_requested ?? null,
      returned: displayStats.bright_profiles_returned ?? null,
      balance_before: Number.isFinite(balanceBefore) ? balanceBefore : null,
      balance_after: Number.isFinite(balanceAfter) ? balanceAfter : null,
      actual_cost_usd: actualBrightCost,
      hard_budget_usd: 1.25,
    },
    index: indexMetrics,
    results: {
      delivered: candidates.length,
      qualification_decisions: countBy(candidates, (item) => item.qualification_decision || "unknown"),
      top20_system_decisions: systemTop20Decisions,
      average_top20_rank_interval_width: top20.length === 0 ? null : Math.round(
        top20.reduce((sum, item) => sum + ((item.rank_high || 0) - (item.rank_low || 0)), 0) / top20.length * 100,
      ) / 100,
    },
    pairwise: {
      rows: comparisons.length,
      included_in_fit: comparisons.filter((item) => item.included_in_fit).length,
      unstable_rows: comparisons.filter((item) => !item.is_stable).length,
      order_swap_tests: swapRows.length,
      stable_order_swap_tests: stableSwapRows.length,
      order_swap_consistency: orderSwapConsistency,
      effective_order_swap_pairs: effectiveSwapPairCount,
      effective_order_swap_consistency: effectiveOrderSwapConsistency,
      arbiter_rows: comparisons.filter((item) => item.decisive_dimensions.includes("holistic_arbiter")).length,
      graph_connected: indexMetrics.comparison_graph_connected ?? null,
    },
    llm_usage: usageByStage,
    acceptance: {
      bright_budget: actualBrightCost != null ? actualBrightCost <= 1.25 : null,
      comparison_graph_connected: indexMetrics.comparison_graph_connected === true,
      raw_order_swap_consistency_at_least_85_percent: orderSwapConsistency != null ? orderSwapConsistency >= 0.85 : null,
      effective_order_swap_consistency_at_least_85_percent: effectiveOrderSwapConsistency != null ? effectiveOrderSwapConsistency >= 0.85 : null,
      system_top20_contact_count: systemTop20Decisions.contact || 0,
      codex_blind_precision_at_20: "pending",
      codex_low_rank_false_negative_audit: "pending",
      codex_ab_agreement: "pending",
      baseline_lift: "pending",
      deploy: false,
    },
    top20: top20Summary,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "validation.json"), `${JSON.stringify(report, null, 2)}\n`);
  const candidateCsv = [
    ["final_rank", "name", "headline", "location", "qualification", "decision", "rank_low", "rank_high", "linkedin_url"].map(csv).join(","),
    ...top20.map((item) => [
      item.final_rank,
      item.name,
      item.headline,
      item.location,
      item.qualification_decision,
      item.final_decision,
      item.rank_low,
      item.rank_high,
      item.profile_url,
    ].map(csv).join(",")),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "top20.csv"), `${candidateCsv}\n`);
  const markdown = `# Zillow Candidate Index Validation\n\n` +
    `- Search: \`${searchId}\`\n` +
    `- Status: \`${search.status}\` / \`${job.status}\`\n` +
    `- Bright: ${displayStats.bright_profiles_returned ?? "unknown"} returned, $${actualBrightCost ?? "unknown"} actual cost\n` +
    `- Results: ${candidates.length} delivered; Top 20 = ${systemTop20Decisions.contact || 0} contact / ${systemTop20Decisions.review || 0} review (diagnostic only)\n` +
    `- Pairwise: ${comparisons.filter((item) => item.included_in_fit).length} included; raw order-swap consistency ${orderSwapConsistency == null ? "unknown" : `${Math.round(orderSwapConsistency * 100)}%`}; effective after arbiter ${effectiveOrderSwapConsistency == null ? "unknown" : `${Math.round(effectiveOrderSwapConsistency * 100)}%`}; graph connected ${String(indexMetrics.comparison_graph_connected)}\n\n` +
    `## Decision\n\nDo not deploy yet. Human blind review and baseline lift remain pending. Raw judge consistency is diagnostic; effective comparisons include explicit holistic arbitration for order conflicts. Contact count is a diagnostic, not an automatic quality verdict.\n`;
  fs.writeFileSync(path.join(outDir, "validation.md"), markdown);
  console.log(JSON.stringify({ out_dir: outDir, acceptance: report.acceptance }, null, 2));
}

main().finally(() => closeDb()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
