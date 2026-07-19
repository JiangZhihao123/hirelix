import fs from "node:fs";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { closeDb, db } from "@/db/client";
import {
  hirelix_candidate_comparisons,
  hirelix_candidates,
  hirelix_search_jobs,
  hirelix_searches,
} from "@/db/schema";
import {
  auditCandidateOrderSwap,
  CANDIDATE_JUDGMENT_PROMPT_VERSION,
  loadCandidateBundles,
  qualifyCandidate,
} from "@/lib/candidate-index/judgment";
import { buildCandidateIndexSearchIntent } from "@/lib/candidate-index/workflow";
import { runWithConcurrency } from "@/lib/search/concurrency";
import { initializeGlobalOutboundProxy } from "@/lib/server-outbound-proxy";

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || null;
}

function object(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function main() {
  initializeGlobalOutboundProxy();
  const searchId = arg("search-id");
  if (!searchId) throw new Error("--search-id is required");
  const concurrency = Math.max(1, Math.min(24, Number(arg("concurrency") || "12")));
  const cardConcurrency = Math.max(1, Math.min(12, Number(arg("card-concurrency") || "8")));
  const outPath = path.resolve(arg("out") || `runs/candidate-index/${searchId}/order-swap-audit-v5.json`);

  const [search] = await db.select().from(hirelix_searches).where(eq(hirelix_searches.id, searchId)).limit(1);
  const [job] = await db.select().from(hirelix_search_jobs).where(eq(hirelix_search_jobs.search_id, searchId)).limit(1);
  if (!search || !job) throw new Error("Search or search job not found");

  const swapRows = await db.select().from(hirelix_candidate_comparisons).where(and(
    eq(hirelix_candidate_comparisons.search_id, searchId),
    eq(hirelix_candidate_comparisons.is_order_swap, true),
  ));
  const pairs = [...new Map(swapRows.map((row) => [row.pair_key, {
    pairKey: row.pair_key,
    firstId: row.candidate_a_profile_id,
    secondId: row.candidate_b_profile_id,
  }])).values()];
  if (pairs.length === 0) throw new Error("No historical order-swap pairs found for this search");

  const candidateRows = await db.select().from(hirelix_candidates).where(eq(hirelix_candidates.search_id, searchId));
  const evidenceByProfile = new Map(candidateRows.flatMap((candidate) => {
    if (!candidate.profile_id) return [];
    const evidencePack = object(candidate.evidence_pack);
    return [[candidate.profile_id, object(evidencePack.retrieval)] as const];
  }));
  const profileIds = [...new Set(pairs.flatMap((pair) => [pair.firstId, pair.secondId]))];
  const bundles = await loadCandidateBundles(profileIds, evidenceByProfile);
  const bundleById = new Map(bundles.map((bundle) => [bundle.profile.id, bundle]));
  const parsed = object(search.parsed_requirements);
  const { judgmentInput } = buildCandidateIndexSearchIntent(search.jd_text, parsed);
  const usage = { searchId, jobId: job.id, userId: search.user_id };
  const qualifications = await runWithConcurrency(bundles, cardConcurrency, (bundle) =>
    qualifyCandidate(judgmentInput, bundle, usage),
  );
  const comparisonCards = new Map(qualifications.map((item) => [item.profileId, item.comparisonCard]));

  const results = await runWithConcurrency(pairs, concurrency, async (pair) => {
    const first = bundleById.get(pair.firstId);
    const second = bundleById.get(pair.secondId);
    if (!first || !second) throw new Error(`Candidate bundle missing for ${pair.pairKey}`);
    const audit = await auditCandidateOrderSwap(judgmentInput, first, second, usage, comparisonCards);
    return {
      pair_key: pair.pairKey,
      candidate_1: { profile_id: first.profile.id, name: first.profile.name },
      candidate_2: { profile_id: second.profile.id, name: second.profile.name },
      stable: audit.rawStable,
      effective_stable: Boolean(audit.final),
      used_arbiter: audit.usedArbiter,
      first: {
        decision: audit.first.rawDecision,
        outcome: audit.first.outcome,
        reason: audit.first.reason,
      },
      swapped: {
        decision: audit.swapped.rawDecision,
        outcome: audit.swapped.outcome,
        reason: audit.swapped.reason,
      },
      final: audit.final ? {
        decision: audit.final.rawDecision,
        outcome: audit.final.outcome,
        reason: audit.final.reason,
      } : null,
    };
  });
  const stableCount = results.filter((result) => result.stable).length;
  const effectiveStableCount = results.filter((result) => result.effective_stable).length;
  const report = {
    generated_at: new Date().toISOString(),
    search_id: searchId,
    prompt_version: CANDIDATE_JUDGMENT_PROMPT_VERSION,
    model: process.env.SEARCH_JUDGE_MODEL || null,
    pair_count: results.length,
    stable_count: stableCount,
    order_swap_consistency: stableCount / results.length,
    passed_85_percent: stableCount / results.length >= 0.85,
    effective_stable_count: effectiveStableCount,
    effective_order_swap_consistency: results.length === 0 ? null : effectiveStableCount / results.length,
    comparison_cards: qualifications.map((item) => ({
      profile_id: item.profileId,
      decision: item.decision,
      card: item.comparisonCard,
    })),
    results,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ out: outPath, ...report, results: undefined }, null, 2));
}

main().finally(() => closeDb()).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
