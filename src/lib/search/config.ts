import { JD_SEARCH_INTENT_PROMPT } from "@/lib/prompts";
import type { SearchExecutionProfile } from "@/lib/search-execution";
import type { SearchExecutionRuntime } from "@/lib/search/types";

export const SEARCH_JOB_MAX_ATTEMPTS = 3;

export const REVIEWABLE_SEARCH_STATUSES = [
  "deep_scoring",
  "done",
  "degraded",
] as const;

function getConfiguredPositiveInt(
  envName: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(safeValue, min), max);
}

function getConfiguredNonNegativeInt(
  envName: string,
  fallback: number,
  options: { max?: number } = {},
) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(safeValue, 0), max);
}

function getConfiguredNumber(
  envName: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(safeValue, min), max);
}

function getConfiguredBoolean(envName: string, fallback: boolean) {
  const raw = process.env[envName];
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export const SEARCH_JOB_STALE_MINUTES = getConfiguredPositiveInt(
  "SEARCH_JOB_STALE_MINUTES",
  20,
  { min: 1, max: 1440 },
);

export const SEARCH_JOB_STARTUP_STALL_SECONDS = getConfiguredPositiveInt(
  "SEARCH_JOB_STARTUP_STALL_SECONDS",
  60,
  { min: 15, max: 900 },
);

export const GITHUB_ENRICH_LIMIT = getConfiguredPositiveInt(
  "SEARCH_GITHUB_ENRICH_LIMIT",
  20,
  { min: 1, max: 50 },
);

export const DEEP_SCORING_BATCH_SIZE = getConfiguredPositiveInt(
  "SEARCH_DEEP_SCORING_BATCH_SIZE",
  10,
  { max: 40 },
);

export const DEEP_SCORING_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_DEEP_SCORING_CONCURRENCY",
  6,
  { max: 200 },
);

export const FAST_JUDGE_BATCH_SIZE = getConfiguredPositiveInt(
  "SEARCH_FAST_JUDGE_BATCH_SIZE",
  20,
  { max: 40 },
);

export const FAST_JUDGE_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_FAST_JUDGE_CONCURRENCY",
  8,
  { max: 200 },
);

export const DEEP_REVIEW_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_DEEP_REVIEW_CONCURRENCY",
  6,
  { max: 100 },
);

export const DEEP_CACHE_PRIMER_COUNT = getConfiguredNonNegativeInt(
  "SEARCH_DEEP_CACHE_PRIMER_COUNT",
  0,
  { max: 10 },
);

export const SECOND_REVIEW_MIN_COUNT = getConfiguredNonNegativeInt(
  "SEARCH_SECOND_REVIEW_MIN",
  20,
  { max: 200 },
);

export const SECOND_REVIEW_MAX_COUNT = getConfiguredPositiveInt(
  "SEARCH_SECOND_REVIEW_MAX",
  40,
  { max: 200 },
);

export const JUDGE_SCORING_TIMEOUT_MS = getConfiguredPositiveInt(
  "SEARCH_JUDGE_SCORING_TIMEOUT_MS",
  300000,
  { min: 30000, max: 300000 },
);

export const ARBITER_SCORING_TIMEOUT_MS = getConfiguredPositiveInt(
  "SEARCH_ARBITER_SCORING_TIMEOUT_MS",
  300000,
  { min: 30000, max: 300000 },
);

export const OUTREACH_POOL_TARGET = getConfiguredPositiveInt(
  "SEARCH_OUTREACH_POOL_TARGET",
  25,
  { max: 100 },
);

export const HIGHLIGHT_CANDIDATE_COUNT = getConfiguredPositiveInt(
  "SEARCH_HIGHLIGHT_COUNT",
  5,
  { max: 25 },
);

export const DEEP_REVIEW_DEBUG_LOGS = getConfiguredBoolean(
  "SEARCH_DEBUG_DEEP_REVIEW_LOGS",
  false,
);

export const LEGACY_BRIGHTDATA_FILTER_LIMIT = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_LIMIT",
  50,
  { min: 1, max: 5000 },
);

export const BRIGHTDATA_STANDARD_LIMIT = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_STANDARD_LIMIT",
  LEGACY_BRIGHTDATA_FILTER_LIMIT,
  { min: 1, max: 5000 },
);

export const BRIGHTDATA_HIDDEN_GEM_LIMIT = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_HIDDEN_GEM_LIMIT",
  25,
  { min: 1, max: 5000 },
);

export const BRIGHTDATA_COMPANY_TARGET_LIMIT = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_COMPANY_TARGET_LIMIT",
  25,
  { min: 1, max: 5000 },
);

export const SHORTLIST_MATCH_SCORE_MIN = getConfiguredPositiveInt(
  "SEARCH_SHORTLIST_MATCH_SCORE_MIN",
  60,
  { min: 1, max: 100 },
);

export const SHORTLIST_RELEVANCE_MIN = getConfiguredPositiveInt(
  "SEARCH_SHORTLIST_RELEVANCE_MIN",
  75,
  { min: 1, max: 100 },
);

export const SHORTLIST_CAPABILITY_MIN = getConfiguredPositiveInt(
  "SEARCH_SHORTLIST_CAPABILITY_MIN",
  70,
  { min: 1, max: 100 },
);

export const SHORTLIST_JOIN_LIKELIHOOD_MIN = getConfiguredPositiveInt(
  "SEARCH_SHORTLIST_JOIN_LIKELIHOOD_MIN",
  55,
  { min: 1, max: 100 },
);

export const PARSE_MAX_ATTEMPTS = getConfiguredPositiveInt(
  "SEARCH_PARSE_MAX_ATTEMPTS",
  2,
  { min: 1, max: 4 },
);

export const BRIGHTDATA_FILTER_TIMEOUT_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_TIMEOUT_MS",
  900000,
  { min: 10000, max: 900000 },
);

export const BRIGHTDATA_FILTER_POLL_INTERVAL_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_POLL_INTERVAL_MS",
  5000,
  { min: 1000, max: 60000 },
);

export const FULL_STAGE_PARALLELISM = getConfiguredBoolean(
  "SEARCH_FULL_STAGE_PARALLELISM",
  false,
);

export const SEARCH_LOW_COST_MODE = getConfiguredBoolean(
  "SEARCH_LOW_COST_MODE",
  false,
);

export const PARSE_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_PARSE_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 900 : 1800,
  { min: 200, max: 4000 },
);

export const JUDGE_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_JUDGE_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 900 : 2400,
  { min: 120, max: 20000 },
);

export const ARBITER_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_ARBITER_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 1200 : 4000,
  { min: 120, max: 6000 },
);

export const ESTIMATED_TOKENS_PER_CHAR = getConfiguredNumber(
  "SEARCH_ESTIMATED_TOKENS_PER_CHAR",
  0.25,
  { min: 0.05, max: 1 },
);

export const ESTIMATED_DEEP_REVIEW_CONFLICT_RATE = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEP_REVIEW_CONFLICT_RATE",
  0.15,
  { min: 0, max: 1 },
);

export const ESTIMATED_SECOND_REVIEW_RATE = getConfiguredNumber(
  "SEARCH_ESTIMATED_SECOND_REVIEW_RATE",
  0.3,
  { min: 0, max: 1 },
);

export const ESTIMATED_DEEPSEEK_INPUT_COST_PER_1M = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEPSEEK_INPUT_COST_PER_1M",
  0.14,
  { min: 0, max: 50 },
);

export const ESTIMATED_DEEPSEEK_OUTPUT_COST_PER_1M = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEPSEEK_OUTPUT_COST_PER_1M",
  0.28,
  { min: 0, max: 50 },
);

export const ESTIMATED_DEEPSEEK_PRO_INPUT_COST_PER_1M = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEPSEEK_PRO_INPUT_COST_PER_1M",
  1.74,
  { min: 0, max: 50 },
);

export const ESTIMATED_DEEPSEEK_PRO_OUTPUT_COST_PER_1M = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEPSEEK_PRO_OUTPUT_COST_PER_1M",
  3.48,
  { min: 0, max: 50 },
);

export function resolveStageConcurrency(configuredLimit: number, itemCount: number) {
  if (itemCount <= 0) return 0;
  if (FULL_STAGE_PARALLELISM) return itemCount;
  return Math.min(configuredLimit, itemCount);
}

export function getExecutionRuntime(
  executionProfile: SearchExecutionProfile,
): SearchExecutionRuntime {
  if (executionProfile.lowCostMode) {
    return {
      lightPrescreenMaxOutputTokens: 120,
      judgeMaxOutputTokens: 420,
      arbiterMaxOutputTokens: 320,
      outreachMaxOutputTokens: 450,
      judgeMaxAttempts: 1,
      arbiterMaxAttempts: 1,
      judgeMode: executionProfile.singleJudgeMode ? "single" : "dual",
    };
  }

  return {
    lightPrescreenMaxOutputTokens: 200,
    judgeMaxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS,
    arbiterMaxOutputTokens: ARBITER_MAX_OUTPUT_TOKENS,
    outreachMaxOutputTokens: 700,
    judgeMaxAttempts: 2,
    arbiterMaxAttempts: 2,
    judgeMode: executionProfile.singleJudgeMode ? "single" : "dual",
  };
}

export function roundCurrency(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function estimateTokensFromText(text: string | null | undefined, minimum = 0) {
  const normalized = typeof text === "string" ? text : "";
  return Math.max(minimum, Math.ceil(normalized.length * ESTIMATED_TOKENS_PER_CHAR));
}

function getEstimatedModelPricing() {
  const provider = (process.env.AI_PROVIDER || "deepseek").trim().toLowerCase();
  if (provider === "deepseek") {
    return {
      provider: "deepseek",
      inputCostPerToken: ESTIMATED_DEEPSEEK_INPUT_COST_PER_1M / 1_000_000,
      outputCostPerToken: ESTIMATED_DEEPSEEK_OUTPUT_COST_PER_1M / 1_000_000,
    };
  }

  return {
    provider,
    inputCostPerToken: ESTIMATED_DEEPSEEK_INPUT_COST_PER_1M / 1_000_000,
    outputCostPerToken: ESTIMATED_DEEPSEEK_OUTPUT_COST_PER_1M / 1_000_000,
  };
}

export function estimateLlmCallCost(inputTokens: number, outputTokens: number) {
  const pricing = getEstimatedModelPricing();
  return roundCurrency(
    Math.max(0, inputTokens) * pricing.inputCostPerToken +
      Math.max(0, outputTokens) * pricing.outputCostPerToken,
  );
}

export function estimateDeepSeekProLlmCallCost(inputTokens: number, outputTokens: number) {
  return roundCurrency(
    Math.max(0, inputTokens) * (ESTIMATED_DEEPSEEK_PRO_INPUT_COST_PER_1M / 1_000_000) +
      Math.max(0, outputTokens) * (ESTIMATED_DEEPSEEK_PRO_OUTPUT_COST_PER_1M / 1_000_000),
  );
}

export function estimateSearchIntentCost(jdText: string, outputText?: string | null) {
  const inputTokens =
    estimateTokensFromText(JD_SEARCH_INTENT_PROMPT, 400) +
    estimateTokensFromText(jdText, 250);
  const outputTokens = outputText
    ? estimateTokensFromText(outputText, 120)
    : Math.min(PARSE_MAX_OUTPUT_TOKENS, 600);
  return estimateLlmCallCost(inputTokens, outputTokens);
}
