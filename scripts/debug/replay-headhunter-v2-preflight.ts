import fs from "node:fs";
import path from "node:path";

import { computeFilterHash } from "@/lib/brightdata";
import {
  buildRecallLocationFilter,
  buildStandardSkillFilter,
  isPlaceholderTitle,
  normalizeRecallSpec,
  sanitizeHiringBrief,
} from "@/lib/search-jobs";
import {
  applyLaneContractReviewToParsed,
  buildDeterministicLaneContractReview,
  evaluateCompiledFilterFidelity,
} from "@/lib/search/lane-contract-critic";
import {
  buildBrightDataRecallFilters,
} from "@/lib/search/recall";
import {
  applyProfileScanBudgetToExecutionProfile,
  getInitialSearchExecutionProfile,
  getSearchExecutionProfile,
  normalizeSearchExecutionProfileName,
  normalizeSearchPlanCode,
} from "@/lib/search-execution";
import type { SearchExecutionProfile } from "@/lib/search-execution";
import type { RecallSpec } from "@/lib/search/types";

process.env.BRIGHTDATA_DATASET_ID = process.env.BRIGHTDATA_DATASET_ID || "replay_dataset";

type ReplayInput = {
  parsed: Record<string, unknown>;
  candidateCount: number;
  sourceSearchId: string | null;
  sourceJobId: string | null;
};

function parseArgs(argv: string[]) {
  const input = argv[0];
  if (!input) {
    throw new Error(
      "Usage: npx tsx scripts/debug/replay-headhunter-v2-preflight.ts <search-row.json|parsed.json> [--out tmp/report.json]",
    );
  }
  let out: string | null = null;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      index += 1;
      out = argv[index] ?? null;
      continue;
    }
    if (arg?.startsWith("--out=")) {
      out = arg.slice("--out=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { input, out };
}

function recordFromJson(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function loadReplayInput(filePath: string): ReplayInput {
  const absolutePath = path.resolve(filePath);
  const root = recordFromJson(JSON.parse(fs.readFileSync(absolutePath, "utf8")), "input");
  const search = root.search && typeof root.search === "object"
    ? root.search as Record<string, unknown>
    : null;
  const parsed = search?.parsed_requirements && typeof search.parsed_requirements === "object"
    ? search.parsed_requirements as Record<string, unknown>
    : root;
  return {
    parsed: structuredClone(parsed),
    candidateCount:
      typeof parsed.candidate_count === "number" && Number.isFinite(parsed.candidate_count)
        ? Math.max(1, Math.round(parsed.candidate_count))
        : typeof root.candidate_count === "number" && Number.isFinite(root.candidate_count)
          ? Math.max(1, Math.round(root.candidate_count))
          : 250,
    sourceSearchId: typeof search?.id === "string" ? search.id : null,
    sourceJobId: typeof root.job_id === "string" ? root.job_id : null,
  };
}

function buildExecutionProfile(parsed: Record<string, unknown>): SearchExecutionProfile {
  const profileName = normalizeSearchExecutionProfileName(parsed.execution_profile);
  const planCode = normalizeSearchPlanCode(parsed.plan_code);
  const profile = profileName
    ? getSearchExecutionProfile(profileName)
    : getInitialSearchExecutionProfile(planCode);
  if (typeof parsed.profile_scan_budget === "number" && Number.isFinite(parsed.profile_scan_budget)) {
    return applyProfileScanBudgetToExecutionProfile(profile, parsed.profile_scan_budget);
  }
  return profile;
}

function forceReplayStrategy<T>(strategy: "headhunter_v1" | "headhunter_v2", fn: () => T): T {
  const previous = process.env.SEARCH_RECALL_STRATEGY;
  process.env.SEARCH_RECALL_STRATEGY = strategy;
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.SEARCH_RECALL_STRATEGY;
    } else {
      process.env.SEARCH_RECALL_STRATEGY = previous;
    }
  }
}

function toRoundSummary(rounds: ReturnType<typeof buildBrightDataRecallFilters>) {
  return rounds.map((round) => ({
    round: round.round,
    requested: round.request.recordsLimit,
    filter_hash: computeFilterHash(round.request),
    lane_kind: round.diagnostics.persona?.kind ?? null,
    diagnostic_title_terms: round.diagnostics.title_terms,
    diagnostic_skill_terms: round.diagnostics.persona?.skill_terms ?? [],
    request_filter: round.request.filter,
  }));
}

function buildRoundsForParsed(
  parsed: Record<string, unknown>,
  candidateCount: number,
  executionProfile: SearchExecutionProfile,
) {
  return buildBrightDataRecallFilters(parsed, candidateCount, executionProfile, {
    normalizeRecallSpec,
    sanitizeHiringBrief,
    buildStandardSkillFilter,
    buildRecallLocationFilter,
    isPlaceholderTitle,
    hiddenGemLimit: executionProfile.hiddenGemLimit,
    companyTargetLimit: executionProfile.companyTargetLimit,
  });
}

function runReplay(input: ReplayInput) {
  const executionProfile = buildExecutionProfile(input.parsed);

  const v1Parsed = {
    ...structuredClone(input.parsed),
    recall_strategy_mode: "headhunter_v1",
  };
  const v1Rounds = forceReplayStrategy("headhunter_v1", () =>
    buildRoundsForParsed(v1Parsed, input.candidateCount, executionProfile)
  );

  const rawV2Parsed = {
    ...structuredClone(input.parsed),
    recall_strategy_mode: "headhunter_v2",
  };
  delete rawV2Parsed.lane_contract_review;
  delete rawV2Parsed.approved_sourcing_lanes;
  const recallSpecBeforeReview = normalizeRecallSpec(
    rawV2Parsed.recall_spec,
    input.candidateCount,
    { recordLimitOverride: executionProfile.filterLimit },
  );
  const deterministicReview = buildDeterministicLaneContractReview({
    parsed: rawV2Parsed,
    recallSpec: recallSpecBeforeReview,
    reviewedAt: new Date().toISOString(),
  });
  const v2Parsed = applyLaneContractReviewToParsed(rawV2Parsed, deterministicReview);
  const recallSpecAfterReview = normalizeRecallSpec(
    v2Parsed.recall_spec,
    input.candidateCount,
    { recordLimitOverride: executionProfile.filterLimit },
  );
  const v2Rounds = forceReplayStrategy("headhunter_v2", () =>
    buildRoundsForParsed(v2Parsed, input.candidateCount, executionProfile)
  );
  const compiledFilterFidelity = evaluateCompiledFilterFidelity({
    parsed: v2Parsed,
    recallSpec: recallSpecAfterReview as RecallSpec,
    rounds: v2Rounds.map((round) => ({
      round: round.round,
      diagnostics: round.diagnostics,
      filterHash: computeFilterHash(round.request),
    })),
    checkedAt: new Date().toISOString(),
  });

  return {
    generated_at: new Date().toISOString(),
    source: {
      search_id: input.sourceSearchId,
      job_id: input.sourceJobId,
    },
    execution_profile: executionProfile,
    candidate_count: input.candidateCount,
    original_strategy_mode: input.parsed.recall_strategy_mode ?? null,
    original_role_identity: {
      role_family: (input.parsed.headhunter_brief as Record<string, unknown> | undefined)?.role_family ?? null,
      functional_core: (input.parsed.headhunter_brief as Record<string, unknown> | undefined)?.functional_core ?? null,
      must_not_drift_to: (input.parsed.headhunter_brief as Record<string, unknown> | undefined)?.must_not_drift_to ?? null,
    },
    v1_baseline: {
      round_count: v1Rounds.length,
      total_requested: v1Rounds.reduce((sum, round) => sum + round.request.recordsLimit, 0),
      rounds: toRoundSummary(v1Rounds),
    },
    v2_preflight: {
      lane_contract_review: deterministicReview,
      approved_lane_count: deterministicReview.approved_sourcing_lanes.length,
      round_count: v2Rounds.length,
      total_requested_if_submitted: v2Rounds.reduce((sum, round) => sum + round.request.recordsLimit, 0),
      rounds: toRoundSummary(v2Rounds),
      compiled_filter_fidelity: compiledFilterFidelity,
      blocked_rounds: compiledFilterFidelity.filter((item) => item.status === "blocked").map((item) => item.round),
      would_submit_bright:
        deterministicReview.approved_sourcing_lanes.some((lane) =>
          lane.lane_kind === "primary_exact" || lane.lane_kind === "primary_relaxed"
        ) && compiledFilterFidelity.every((item) => item.status !== "blocked"),
      bright_side_effects: "none: local preflight only; no Bright client or DB persistence is imported/called",
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = loadReplayInput(options.input);
  const report = runReplay(input);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const absoluteOut = path.resolve(options.out);
    fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
    fs.writeFileSync(absoluteOut, json);
  }
  process.stdout.write(json);
}

main();
