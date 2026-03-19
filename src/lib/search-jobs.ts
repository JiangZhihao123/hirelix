import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import {
  CANDIDATE_SUITABILITY_PROMPT,
  JD_SEARCH_INTENT_PROMPT,
} from "@/lib/prompts";
import {
  serperSearch,
  buildLinkedInSearchPlan,
  parseSearchResults,
  serperCandidateToRichProfile,
  serperCandidateToDbCandidate,
  type LinkedInQueryTier,
  type SerperCandidate,
} from "@/lib/serper";
import {
  scrapeLinkedInProfiles,
  brightDataProfileToRichText,
  triggerDatasetFilter,
  getDatasetSnapshotMetadata,
  waitForDatasetSnapshot,
  type BrightDataFilterRule,
  type BrightDataDatasetFilterRequest,
  type BrightDataProfile,
} from "@/lib/brightdata";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import {
  getFullSearchExecutionProfile,
  getInitialSearchExecutionProfile,
  getSearchExecutionProfile,
  isProPlanCode,
  normalizeSearchPlanCode,
  type SearchExecutionProfile,
  type SearchPhase,
  type SearchPlanCode,
  type SearchResultStage,
} from "@/lib/search-execution";

export const SEARCH_JOB_MAX_ATTEMPTS = 3;

export const REVIEWABLE_SEARCH_STATUSES = [
  "deep_scoring",
  "done",
  "degraded",
];

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

function resolveStageConcurrency(configuredLimit: number, itemCount: number) {
  if (itemCount <= 0) return 0;
  if (FULL_STAGE_PARALLELISM) return itemCount;
  return Math.min(configuredLimit, itemCount);
}

const SERPER_QUERY_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_SERPER_QUERY_CONCURRENCY",
  24,
  { max: 100 },
);
const SERPER_RESULTS_PER_PAGE = getConfiguredPositiveInt(
  "SEARCH_SERPER_RESULTS_PER_PAGE",
  100,
  { max: 100 },
);
const SERPER_PAGES_PER_QUERY = getConfiguredPositiveInt(
  "SEARCH_SERPER_PAGES_PER_QUERY",
  4,
  { max: 10 },
);
const SERPER_PAGES_PER_QUERY_EXPANDED = getConfiguredPositiveInt(
  "SEARCH_SERPER_PAGES_PER_QUERY_EXPANDED",
  8,
  { max: 20 },
);
const PRE_SCREEN_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_PRE_SCREEN_CONCURRENCY",
  20,
  { max: 100 },
);
const BRIGHTDATA_BATCH_SIZE = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_BATCH_SIZE",
  30,
  { max: 100 },
);
const BRIGHTDATA_BATCH_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_BATCH_CONCURRENCY",
  20,
  { max: 50 },
);
const BRIGHTDATA_SCRAPE_MAX_ATTEMPTS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_SCRAPE_MAX_ATTEMPTS",
  90,
  { min: 6, max: 120 },
);
const BRIGHTDATA_SCRAPE_INTERVAL_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_SCRAPE_INTERVAL_MS",
  10000,
  { min: 2000, max: 60000 },
);
const DEEP_SCORING_BATCH_SIZE = getConfiguredPositiveInt(
  "SEARCH_DEEP_SCORING_BATCH_SIZE",
  1,
  { max: 10 },
);
const DEEP_SCORING_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_DEEP_SCORING_CONCURRENCY",
  64,
  { max: 200 },
);
const DEEP_REVIEW_CONCURRENCY = getConfiguredPositiveInt(
  "SEARCH_DEEP_REVIEW_CONCURRENCY",
  24,
  { max: 100 },
);
const JUDGE_SCORING_TIMEOUT_MS = getConfiguredPositiveInt(
  "SEARCH_JUDGE_SCORING_TIMEOUT_MS",
  120000,
  { min: 30000, max: 300000 },
);
const ARBITER_SCORING_TIMEOUT_MS = getConfiguredPositiveInt(
  "SEARCH_ARBITER_SCORING_TIMEOUT_MS",
  120000,
  { min: 30000, max: 300000 },
);
const OUTREACH_POOL_TARGET = getConfiguredPositiveInt(
  "SEARCH_OUTREACH_POOL_TARGET",
  25,
  { max: 100 },
);
const HIGHLIGHT_CANDIDATE_COUNT = getConfiguredPositiveInt(
  "SEARCH_HIGHLIGHT_COUNT",
  5,
  { max: 25 },
);
const PRE_SCREEN_TARGET = getConfiguredPositiveInt(
  "SEARCH_PRE_SCREEN_TARGET",
  200,
  { min: 25, max: 1000 },
);
const SOURCE_RULE_PASS_SCORE = getConfiguredPositiveInt(
  "SEARCH_SOURCE_RULE_PASS_SCORE",
  60,
  { min: 1, max: 100 },
);
const STRICT_LOCATION_REQUIRE_HIT = getConfiguredBoolean(
  "SEARCH_STRICT_LOCATION_REQUIRE_HIT",
  false,
);
const TARGET_SCRAPE_COUNT = getConfiguredPositiveInt(
  "SEARCH_TARGET_SCRAPE_COUNT",
  1000,
  { min: 1, max: 5000 },
);
const STOP_MIN_GAIN_RATIO = getConfiguredNumber(
  "SEARCH_STOP_MIN_GAIN_RATIO",
  0.08,
  { min: 0, max: 1 },
);
const FINAL_RESULT_CAP = getConfiguredPositiveInt(
  "SEARCH_FINAL_RESULT_CAP",
  25,
  { min: 1, max: 250 },
);
const DEEP_REVIEW_DEBUG_LOGS = getConfiguredBoolean(
  "SEARCH_DEBUG_DEEP_REVIEW_LOGS",
  false,
);
const BRIGHTDATA_FILTER_LIMIT = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_LIMIT",
  TARGET_SCRAPE_COUNT,
  { min: 100, max: 5000 },
);
const PARSE_MAX_ATTEMPTS = getConfiguredPositiveInt(
  "SEARCH_PARSE_MAX_ATTEMPTS",
  2,
  { min: 1, max: 4 },
);
const BRIGHTDATA_FILTER_TIMEOUT_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_TIMEOUT_MS",
  900000,
  { min: 10000, max: 900000 },
);
const BRIGHTDATA_FILTER_POLL_WINDOW_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_POLL_WINDOW_MS",
  900000,
  { min: 5000, max: 900000 },
);
const BRIGHTDATA_FILTER_POLL_INTERVAL_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_POLL_INTERVAL_MS",
  5000,
  { min: 1000, max: 60000 },
);
const FULL_STAGE_PARALLELISM = getConfiguredBoolean(
  "SEARCH_FULL_STAGE_PARALLELISM",
  true,
);
const SEARCH_LOW_COST_MODE = getConfiguredBoolean(
  "SEARCH_LOW_COST_MODE",
  false,
);
const SEARCH_SINGLE_JUDGE_MODE = getConfiguredBoolean(
  "SEARCH_SINGLE_JUDGE_MODE",
  SEARCH_LOW_COST_MODE,
);
const PARSE_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_PARSE_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 900 : 1800,
  { min: 200, max: 4000 },
);
const LIGHT_PRESCREEN_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_LIGHT_PRESCREEN_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 120 : 200,
  { min: 50, max: 800 },
);
const JUDGE_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_JUDGE_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 420 : 700,
  { min: 120, max: 2000 },
);
const ARBITER_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_ARBITER_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 320 : 500,
  { min: 120, max: 2000 },
);
const OUTREACH_MAX_OUTPUT_TOKENS = getConfiguredPositiveInt(
  "SEARCH_OUTREACH_MAX_OUTPUT_TOKENS",
  SEARCH_LOW_COST_MODE ? 450 : 700,
  { min: 120, max: 2000 },
);
const ESTIMATED_TOKENS_PER_CHAR = getConfiguredNumber(
  "SEARCH_ESTIMATED_TOKENS_PER_CHAR",
  0.25,
  { min: 0.05, max: 1 },
);
const ESTIMATED_DEEP_REVIEW_CONFLICT_RATE = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEP_REVIEW_CONFLICT_RATE",
  0.15,
  { min: 0, max: 1 },
);
const ESTIMATED_DEEPSEEK_INPUT_COST_PER_1M = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEPSEEK_INPUT_COST_PER_1M",
  0.28,
  { min: 0, max: 50 },
);
const ESTIMATED_DEEPSEEK_OUTPUT_COST_PER_1M = getConfiguredNumber(
  "SEARCH_ESTIMATED_DEEPSEEK_OUTPUT_COST_PER_1M",
  0.42,
  { min: 0, max: 50 },
);
function getExecutionRuntime(
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
    judgeMaxOutputTokens: 700,
    arbiterMaxOutputTokens: 500,
    outreachMaxOutputTokens: 700,
    judgeMaxAttempts: 2,
    arbiterMaxAttempts: 2,
    judgeMode: executionProfile.singleJudgeMode ? "single" : "dual",
  };
}

function roundCurrency(value: number) {
  return Math.round(value * 10000) / 10000;
}

function estimateTokensFromText(text: string | null | undefined, minimum = 0) {
  const normalized = typeof text === "string" ? text : "";
  return Math.max(minimum, Math.ceil(normalized.length * ESTIMATED_TOKENS_PER_CHAR));
}

function getEstimatedModelPricing() {
  const provider = (process.env.AI_PROVIDER || "anthropic").trim().toLowerCase();
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

function estimateLlmCallCost(inputTokens: number, outputTokens: number) {
  const pricing = getEstimatedModelPricing();
  return roundCurrency(
    Math.max(0, inputTokens) * pricing.inputCostPerToken +
      Math.max(0, outputTokens) * pricing.outputCostPerToken,
  );
}

function estimateSearchIntentCost(jdText: string, outputText?: string | null) {
  const inputTokens =
    estimateTokensFromText(JD_SEARCH_INTENT_PROMPT, 400) +
    estimateTokensFromText(jdText, 250);
  const outputTokens = outputText
    ? estimateTokensFromText(outputText, 120)
    : Math.min(PARSE_MAX_OUTPUT_TOKENS, 600);
  return estimateLlmCallCost(inputTokens, outputTokens);
}

type SearchJobRow = {
  id: string;
  search_id: string;
  user_id: string;
  jd_text: string;
  candidate_count: number;
  status: string;
  attempt_count: number;
  last_error: string | null;
  available_at: string;
  started_at: string | null;
  locked_at: string | null;
};

type SearchRow = {
  id: string;
  user_id: string;
  jd_text: string;
  parsed_requirements: Record<string, unknown> | null;
  status: string;
  parse_completed_at?: string | null;
};

type CandidateRowInput = {
  name: string;
  headline: string | null;
  location: string | null;
  skills: string[];
  experience_years: number | null;
  match_score: number;
  match_reasons: string[];
  profile_url: string | null;
  github_url: string | null;
  email: string | null;
  outreach_draft: string | null;
  metadata: Record<string, unknown>;
};

type RecallSpec = {
  countries: string[];
  title_variants: string[];
  core_skill_terms: string[];
  location_terms: string[];
  record_limit: number;
};

type RecallProvider = "brightdata_dataset" | "serper";

type HiringBriefRoleCore = {
  title: string | null;
  seniority: string | null;
  function_focus: string | null;
  required_skills: string[];
  nice_to_have_skills: string[];
};

type HiringBrief = {
  role_core: HiringBriefRoleCore;
  work_model: "onsite" | "hybrid" | "remote" | "unknown";
  location_scope: string | null;
  location_flexibility: "strict" | "moderate" | "flexible";
  relocation_allowed: "yes" | "no" | "unknown";
  must_have_constraints: string[];
  soft_constraints: string[];
  screening_intent: string | null;
  candidate_count_strategy: "focused_shortlist" | "broader_shortlist";
  constraint_reasoning: string | null;
};

type ConstraintVerdict = {
  location_fit: "local" | "nearby" | "non_local" | "unknown";
  work_model_fit: "yes" | "no" | "unclear";
  must_have_coverage: "strong" | "partial" | "weak" | "unknown";
};

type CompanyProfile = {
  size: string | null;
  mission: string | null;
  benefits: string | null;
  tech_stack: string | null;
  selling_points: string | null;
};

type ScoringBreakdown = {
  capability_score: number;
  relevance_score: number;
  join_likelihood_score: number;
  join_likelihood_reasons: string[];
  quality_score: number;
  advance_score: number;
};

type AdvanceRecommendation = "advance" | "hold" | "reject";
type BlockingSeverity = "hard" | "soft" | "none";

type CandidateSuitability = {
  fit_decision: "strong_fit" | "viable_fit" | "risky_fit" | "reject";
  actionability: "ready_to_act" | "needs_review" | "not_actionable";
  match_score: number;
  quality_score: number;
  advance_score: number;
  advance_recommendation: AdvanceRecommendation;
  blocking_constraints: string[];
  blocking_severity: BlockingSeverity;
  scoring_breakdown: ScoringBreakdown;
  constraint_verdicts: ConstraintVerdict;
  constraint_risks: string[];
  risk_flags: string[];
  why_this_candidate: string[];
  why_not_higher: string[];
  evidence_quality: "high" | "medium" | "low";
};

type SerperPreScreenDecision = {
  keep: boolean;
  match_score: number;
  reason: string;
};

type SerperPreScreenedCandidate = {
  serperCandidate: SerperCandidate;
  preScreen: SerperPreScreenDecision;
};

type SerperSourceRuleDecision = {
  score: number;
  hard_reject: boolean;
  reasons: string[];
  title_hit: boolean;
  must_have_hits: number;
  must_have_total: number;
  location_hit: boolean | null;
  noise_penalty: number;
};

type SerperTierStats = {
  tier: LinkedInQueryTier;
  query_count: number;
  request_count: number;
  raw_result_count: number;
  unique_count: number;
  new_unique_count: number;
  duplicate_ratio: number;
  source_rule_pass_count: number;
  source_rule_pass_rate: number;
  llm_prescreen_pass_count: number;
  llm_prescreen_pass_rate: number;
  stop_reason: string | null;
};

type SerperSourceRuleContext = {
  titleTerms: string[];
  mustHaveTerms: string[];
  strictLocation: boolean;
  strictLocationRequireHit: boolean;
  locationPreference: "strict" | "preferred" | "none";
  locationTerms: string[];
};

type ScoredCandidateAssessment = {
  index: number;
  suitability: CandidateSuitability;
  skills: string[];
  experience_years: number | null;
  location: string | null;
  scoring_method?: "dual_review_auto" | "dual_review_arbitrated" | "single_judge_debug";
  judge_delta?: number;
  judge_conflict?: boolean;
};

type JudgeScoreResult = {
  index: number;
  capability_score: number;
  relevance_score: number;
  join_likelihood_score: number;
  join_likelihood_reasons: string[];
  short_reasons: string[];
  risk_flags: string[];
  blocking_constraints: string[];
  blocking_severity: BlockingSeverity;
  advance_recommendation: AdvanceRecommendation;
  constraint_verdicts: ConstraintVerdict;
  evidence_quality: "high" | "medium" | "low";
  skills: string[];
  experience_years: number | null;
  location: string | null;
};

type PipelineContext = {
  searchId: string;
  jobId: string;
  userId: string;
  jdText: string;
  createdAt: string | null;
  planCode: SearchPlanCode;
  candidateCount: number;
  highlightCount: number;
  outreachPoolTarget: number;
};

type SearchDisplayStats = {
  retrieval_count: number;
  deep_review_count: number;
  deep_review_requested_count: number;
  deep_review_completed_count: number;
  qualified_count: number;
  outreach_pool_count: number;
  shortlist_count: number;
  serper_query_tier_stats?: SerperTierStats[];
  source_rule_pass_rate?: number;
  llm_prescreen_pass_rate?: number;
  brightdata_scrape_count?: number;
  deep_qualified_rate?: number;
  hard_blocked_count?: number;
  soft_blocked_count?: number;
  advanceable_count?: number;
  top_quality_score?: number;
  top50_quality_cutoff?: number;
  bright_profile_budget?: number;
  bright_profiles_requested?: number;
  bright_profiles_returned?: number;
  bright_snapshot_cost?: number;
  estimated_llm_cost?: number;
  estimated_search_total_cost?: number;
  search_phase_count?: number;
  judge_mode?: "single" | "dual";
};

type SearchPipelineResult = {
  finalRows: CandidateRowInput[];
  displayStats: SearchDisplayStats;
  warningMessage?: string | null;
};

type SerperBuildResult = {
  preScreened: SerperPreScreenedCandidate[];
  fallbackRows: CandidateRowInput[];
  retrievalCount: number;
  tierStats: SerperTierStats[];
  sourceRulePassRate: number;
  llmPreScreenPassRate: number;
  stopReason: string | null;
};

type RecallMetadata = {
  provider: RecallProvider;
  snapshot_id: string;
  dataset_size?: number | null;
  recall_latency_ms?: number | null;
  cost?: number | null;
  bright_profile_budget?: number | null;
  bright_profiles_requested?: number | null;
  bright_profiles_returned?: number | null;
  judge_mode?: "single" | "dual" | null;
  requested_at?: string | null;
  completed_at?: string | null;
  status?: "submitted" | "polling" | "ready";
  filter_summary?: {
    title_terms: string[];
    country_codes: string[];
    location_terms?: string[];
  } | null;
};

type SearchExecutionRuntime = {
  lightPrescreenMaxOutputTokens: number;
  judgeMaxOutputTokens: number;
  arbiterMaxOutputTokens: number;
  outreachMaxOutputTokens: number;
  judgeMaxAttempts: number;
  arbiterMaxAttempts: number;
  judgeMode: "single" | "dual";
};

type SearchCostEstimate = {
  estimatedLlmCost: number;
  estimatedSearchTotalCost: number;
};

class DatasetRecallPendingError extends Error {
  retryImmediately: boolean;

  constructor(message: string) {
    super(message);
    this.name = "DatasetRecallPendingError";
    this.retryImmediately = true;
  }
}

import { supabaseAdmin } from "@/lib/supabase-server";

function nowIso() {
  return new Date().toISOString();
}

function logSearchEvent(eventName: string, payload: Record<string, unknown>) {
  console.log(`[search:${eventName}] ${JSON.stringify(payload)}`);
}

function extractJSON(text: string): string {
  // 策略 1: 尝试提取 markdown 代码块中的 JSON
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1].trim().length > 0) {
    let result = fenced[1].trim();
    // 修复不完整的数组
    if (result.startsWith("[") && !result.endsWith("]")) {
      const lastBrace = result.lastIndexOf("}");
      if (lastBrace > 0) {
        result = result.substring(0, lastBrace + 1) + "]";
      }
    }
    return result;
  }
  
  // 策略 2: 尝试查找第一个 { 或 [ 到最后一个 } 或 ]
  const firstBrace = Math.min(
    text.indexOf("{") >= 0 ? text.indexOf("{") : Infinity,
    text.indexOf("[") >= 0 ? text.indexOf("[") : Infinity
  );
  const lastBrace = Math.max(
    text.lastIndexOf("}"),
    text.lastIndexOf("]")
  );
  
  if (firstBrace < Infinity && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  
  // 策略 3: 返回原始文本（去除首尾空白）
  return text.trim();
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const item of value) {
    const normalized = normalizeNullableString(item);
    if (normalized) deduped.add(normalized);
    if (deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

function splitSkillTerms(rawSkills: string[]): string[] {
  const terms: string[] = [];
  for (const raw of rawSkills) {
    const base = raw.trim();
    if (!base) continue;
    const parts = base
      .split(/[\/,;]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 1);
    terms.push(...parts);
  }
  return Array.from(new Set(terms));
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^\w\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveLocationTerms(locationScope: string | null): string[] {
  if (!locationScope) return [];
  const normalized = normalizeText(locationScope).replace(/\b(remote|hybrid|onsite|on site)\b/g, "").trim();
  if (!normalized) return [];

  const terms = new Set<string>();
  terms.add(normalized);

  const commaParts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts[0]) terms.add(commaParts[0]);
  if (commaParts.length > 1) terms.add(commaParts.slice(-1)[0]);

  if (/new york/.test(normalized)) terms.add("new york");
  if (/san francisco/.test(normalized)) terms.add("san francisco");
  if (/los angeles/.test(normalized)) terms.add("los angeles");

  return Array.from(terms)
    .map((term) => term.replace(/\s+/g, " ").trim())
    .filter((term) => term.length >= 3)
    .slice(0, 5);
}

// ──────────────────── Deterministic Location Gate ────────────────────

type LocationPolicy = {
  mode: "strict" | "moderate" | "flexible";
  target_terms: string[];
  work_model: string;
  allows_relocation: boolean;
  requires_local_presence: boolean;
};

type LocationEvidence = {
  raw_location: string | null;
  normalized_terms: string[];
  country_code: string | null;
  has_relocation_signal: boolean;
  evidence_quality: "explicit" | "inferred" | "missing";
};

type LocationGateResult = {
  decision: "pass" | "review" | "block";
  location_fit: "local" | "nearby" | "non_local" | "unknown";
  reason: string;
  is_hard_block: boolean;
};

function normalizeLocationConstraint(hiringBrief: HiringBrief): LocationPolicy {
  const mode = hiringBrief.location_flexibility || "moderate";
  const target_terms = deriveLocationTerms(hiringBrief.location_scope);
  const work_model = hiringBrief.work_model || "unknown";
  const allows_relocation = hiringBrief.relocation_allowed === "yes";
  const requires_local_presence =
    (work_model === "onsite" || work_model === "hybrid") &&
    mode === "strict" &&
    target_terms.length > 0;

  return {
    mode,
    target_terms,
    work_model,
    allows_relocation,
    requires_local_presence,
  };
}

function extractCandidateLocationEvidence(
  location: string | null,
  country_code: string | null,
  headline: string | null,
  about: string | null,
): LocationEvidence {
  const raw_location = location || null;
  const normalized_terms: string[] = [];

  if (location) {
    const normalized = normalizeText(location);
    normalized_terms.push(normalized);

    const parts = normalized.split(/[,\/]/).map(p => p.trim()).filter(Boolean);
    normalized_terms.push(...parts);
  }

  const text = [headline, about].filter(Boolean).join(" ").toLowerCase();
  const has_relocation_signal =
    /\b(relocat|moving to|will move|open to move)\b/.test(text);

  const evidence_quality: "explicit" | "inferred" | "missing" =
    location && location.length > 3 ? "explicit" :
    country_code ? "inferred" :
    "missing";

  return {
    raw_location,
    normalized_terms,
    country_code,
    has_relocation_signal,
    evidence_quality,
  };
}

function evaluateCandidateLocationGate(
  policy: LocationPolicy,
  evidence: LocationEvidence,
): LocationGateResult {
  // flexible: 不做 hard gate
  if (policy.mode === "flexible") {
    const location_fit = evidence.evidence_quality === "missing" ? "unknown" : "local";
    return {
      decision: "pass",
      location_fit,
      reason: "Flexible location policy",
      is_hard_block: false,
    };
  }

  // 无地域证据
  if (evidence.evidence_quality === "missing") {
    if (policy.mode === "strict" && policy.requires_local_presence) {
      return {
        decision: "block",
        location_fit: "unknown",
        reason: "Strict location requirement but candidate location unknown",
        is_hard_block: true,
      };
    }
    return {
      decision: "review",
      location_fit: "unknown",
      reason: "Location evidence missing",
      is_hard_block: false,
    };
  }

  // 检查是否匹配目标地域
  const isLocalMatch = policy.target_terms.length === 0 ||
    policy.target_terms.some(target =>
      evidence.normalized_terms.some(term =>
        term.includes(target) || target.includes(term)
      )
    );

  if (isLocalMatch) {
    return {
      decision: "pass",
      location_fit: "local",
      reason: "Candidate location matches target",
      is_hard_block: false,
    };
  }

  // 明确不匹配
  const location_fit: "nearby" | "non_local" = "non_local"; // 简化版先不判断 nearby

  if (policy.mode === "strict" && policy.requires_local_presence) {
    // strict 下，即使允许 relocation，也需要候选人有明确搬迁信号
    if (policy.allows_relocation && evidence.has_relocation_signal) {
      return {
        decision: "review",
        location_fit,
        reason: "Non-local but has relocation signal",
        is_hard_block: false,
      };
    }
    return {
      decision: "block",
      location_fit,
      reason: `Strict ${policy.work_model} role requires local presence`,
      is_hard_block: true,
    };
  }

  // moderate
  return {
    decision: "review",
    location_fit,
    reason: "Non-local candidate for moderate location constraint",
    is_hard_block: false,
  };
}

function applyLocationGateToSuitability(
  suitability: CandidateSuitability,
  gateResult: LocationGateResult,
): CandidateSuitability {
  if (!gateResult.is_hard_block) {
    return suitability;
  }

  // 强制覆盖为 hard block
  return {
    ...suitability,
    constraint_verdicts: {
      ...suitability.constraint_verdicts,
      location_fit: gateResult.location_fit,
    },
    blocking_constraints: [
      ...suitability.blocking_constraints.filter(c => !c.toLowerCase().includes("location")),
      gateResult.reason,
    ],
    blocking_severity: "hard",
    advance_recommendation: "reject",
    advance_score: Math.min(suitability.advance_score || 0, 20),
  };
}

function normalizeRecallSpec(
  value: unknown,
  candidateCount: number,
  options?: { recordLimitOverride?: number | null },
): RecallSpec {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const countries = Array.isArray(item.countries)
    ? item.countries
      .map((country) => normalizeCountryCode(country))
      .filter((country): country is string => Boolean(country))
      .slice(0, 5)
    : [];
  const title_variants = normalizeStringArray(item.title_variants, 8);
  const core_skill_terms = normalizeStringArray(item.core_skill_terms, 12);
  const location_terms = normalizeStringArray(item.location_terms, 5);
  const requestedLimit =
    typeof options?.recordLimitOverride === "number" &&
    Number.isFinite(options.recordLimitOverride)
      ? Math.round(options.recordLimitOverride)
      : typeof item.record_limit === "number" && Number.isFinite(item.record_limit)
        ? Math.round(item.record_limit)
        : BRIGHTDATA_FILTER_LIMIT;

  return {
    countries,
    title_variants,
    core_skill_terms,
    location_terms,
    record_limit:
      typeof options?.recordLimitOverride === "number" &&
      Number.isFinite(options.recordLimitOverride)
        ? Math.max(1, requestedLimit)
        : Math.min(
          Math.max(requestedLimit, Math.max(candidateCount * 10, 25)),
          BRIGHTDATA_FILTER_LIMIT,
        ),
  };
}

function normalizeExperienceYears(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return null;
}

function extractLikelyTitleFromJdText(jdText: string) {
  const proseSource = jdText.replace(/\s+/g, " ").trim();
  const roleIntroPatterns = [
    /\b(?:we\s+are|we're)?\s*(?:hiring|looking\s+for|seeking)\s+(?:an?|our\s+next)\s+(.{4,80}?)\s+(?:to|who|for|with|based|located|in)\b/i,
    /^\s*(.{4,80}?)\s+(?:to|who|for|with|based|located|in)\b/i,
  ];
  const looksLikeRoleTitle = (value: string) =>
    /\b(engineer|developer|manager|designer|scientist|analyst|architect|specialist|recruiter|marketer|operator|director|lead|head)\b/i.test(value);
  const normalizeTitle = (value: string) =>
    value
      .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        if (/^(ai|ml|qa|ui|ux|sre|ios)$/i.test(word)) return word.toUpperCase();
        if (/^node\.js$/i.test(word)) return "Node.js";
        if (/^typescript$/i.test(word)) return "TypeScript";
        if (/^javascript$/i.test(word)) return "JavaScript";
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");

  for (const pattern of roleIntroPatterns) {
    const match = proseSource.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && looksLikeRoleTitle(candidate)) {
      return normalizeTitle(candidate);
    }
  }

  const lines = jdText
    .split("\n")
    .map((line) => line.replace(/[#*`>-]/g, " ").trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 12)) {
    if (line.length < 4 || line.length > 90) continue;
    if (/^(location|company|about|requirements|responsibilities|nice to have|compensation)\s*:/i.test(line)) {
      continue;
    }
    return normalizeTitle(line);
  }

  return null;
}

function isPlaceholderTitle(title: string | null | undefined) {
  if (!title) return true;
  return normalizeText(title) === "untitled role";
}

const FALLBACK_CORE_SKILL_TERMS = [
  "python",
  "typescript",
  "javascript",
  "node.js",
  "next.js",
  "react",
  "postgresql",
  "aws",
  "docker",
  "kubernetes",
  "llm",
  "ai agent",
];

function deriveCoreSkillsFromJdText(jdText: string, maxItems = 12) {
  const lower = jdText.toLowerCase();
  const deduped = new Set<string>();
  for (const term of FALLBACK_CORE_SKILL_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) {
      deduped.add(term);
      if (deduped.size >= maxItems) break;
    }
  }
  return Array.from(deduped);
}

function inferCountriesFromJdText(jdText: string) {
  const lower = jdText.toLowerCase();
  if (
    lower.includes("new york") ||
    lower.includes("nyc") ||
    lower.includes("united states") ||
    /\busa\b/.test(lower) ||
    /\bus\b/.test(lower)
  ) {
    return ["US"];
  }
  return [];
}

function enrichRecallSpecFromJd(
  parsed: Record<string, unknown>,
  jdText: string,
  candidateCount: number,
) {
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, candidateCount);
  const parsedTitle = normalizeNullableString(parsed.title);
  const title = !isPlaceholderTitle(parsedTitle)
    ? parsedTitle
    : extractLikelyTitleFromJdText(jdText);
  const titleVariants = recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : (title ? [title] : []);
  const coreSkillTerms = recallSpec.core_skill_terms.length > 0
    ? recallSpec.core_skill_terms
    : deriveCoreSkillsFromJdText(jdText, 12);
  const countries = recallSpec.countries.length > 0
    ? recallSpec.countries
    : inferCountriesFromJdText(jdText);
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const derivedLocationTerms = hiringBrief.location_scope
    ? deriveLocationTerms(hiringBrief.location_scope)
    : [];
  const locationTerms = recallSpec.location_terms.length > 0
    ? recallSpec.location_terms
    : derivedLocationTerms;

  return {
    ...recallSpec,
    title_variants: titleVariants.slice(0, 8),
    core_skill_terms: coreSkillTerms.slice(0, 12),
    countries: countries.slice(0, 5),
    location_terms: locationTerms.slice(0, 5),
  };
}

function isWeakParsedIntent(
  parsed: Record<string, unknown>,
  candidateCount: number,
) {
  const title = normalizeNullableString(parsed.title);
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, candidateCount);
  return (
    !title ||
    /^untitled role$/i.test(title) ||
    recallSpec.title_variants.length === 0 ||
    recallSpec.core_skill_terms.length === 0
  );
}

function buildSearchDisplayStats(
  overrides: Partial<SearchDisplayStats>,
): SearchDisplayStats {
  const deepReviewRequestedCount = Math.max(
    0,
    Math.round(overrides.deep_review_requested_count ?? overrides.deep_review_count ?? 0),
  );
  const deepReviewCompletedCount = Math.max(
    0,
    Math.round(
      overrides.deep_review_completed_count ??
        overrides.deep_review_count ??
        deepReviewRequestedCount,
    ),
  );
  return {
    retrieval_count: Math.max(0, Math.round(overrides.retrieval_count ?? 0)),
    deep_review_count: deepReviewCompletedCount,
    deep_review_requested_count: deepReviewRequestedCount,
    deep_review_completed_count: deepReviewCompletedCount,
    qualified_count: Math.max(0, Math.round(overrides.qualified_count ?? 0)),
    outreach_pool_count: Math.max(0, Math.round(overrides.outreach_pool_count ?? 0)),
    shortlist_count: Math.max(0, Math.round(overrides.shortlist_count ?? 0)),
    ...(Array.isArray(overrides.serper_query_tier_stats)
      ? { serper_query_tier_stats: overrides.serper_query_tier_stats }
      : {}),
    ...(typeof overrides.source_rule_pass_rate === "number"
      ? {
        source_rule_pass_rate: Math.max(
          0,
          Math.min(1, overrides.source_rule_pass_rate),
        ),
      }
      : {}),
    ...(typeof overrides.llm_prescreen_pass_rate === "number"
      ? {
        llm_prescreen_pass_rate: Math.max(
          0,
          Math.min(1, overrides.llm_prescreen_pass_rate),
        ),
      }
      : {}),
    ...(typeof overrides.brightdata_scrape_count === "number"
      ? { brightdata_scrape_count: Math.max(0, Math.round(overrides.brightdata_scrape_count)) }
      : {}),
    ...(typeof overrides.deep_qualified_rate === "number"
      ? { deep_qualified_rate: Math.max(0, Math.min(1, overrides.deep_qualified_rate)) }
      : {}),
    ...(typeof overrides.hard_blocked_count === "number"
      ? { hard_blocked_count: Math.max(0, Math.round(overrides.hard_blocked_count)) }
      : {}),
    ...(typeof overrides.soft_blocked_count === "number"
      ? { soft_blocked_count: Math.max(0, Math.round(overrides.soft_blocked_count)) }
      : {}),
    ...(typeof overrides.advanceable_count === "number"
      ? { advanceable_count: Math.max(0, Math.round(overrides.advanceable_count)) }
      : {}),
    ...(typeof overrides.top_quality_score === "number"
      ? { top_quality_score: Math.max(0, Math.min(100, Math.round(overrides.top_quality_score))) }
      : {}),
    ...(typeof overrides.top50_quality_cutoff === "number"
      ? {
        top50_quality_cutoff: Math.max(
          0,
          Math.min(100, Math.round(overrides.top50_quality_cutoff)),
        ),
      }
      : {}),
    ...(typeof overrides.bright_profile_budget === "number"
      ? { bright_profile_budget: Math.max(0, Math.round(overrides.bright_profile_budget)) }
      : {}),
    ...(typeof overrides.bright_profiles_requested === "number"
      ? { bright_profiles_requested: Math.max(0, Math.round(overrides.bright_profiles_requested)) }
      : {}),
    ...(typeof overrides.bright_profiles_returned === "number"
      ? { bright_profiles_returned: Math.max(0, Math.round(overrides.bright_profiles_returned)) }
      : {}),
    ...(typeof overrides.bright_snapshot_cost === "number"
      ? { bright_snapshot_cost: Math.max(0, overrides.bright_snapshot_cost) }
      : {}),
    ...(typeof overrides.estimated_llm_cost === "number"
      ? { estimated_llm_cost: Math.max(0, overrides.estimated_llm_cost) }
      : {}),
    ...(typeof overrides.estimated_search_total_cost === "number"
      ? { estimated_search_total_cost: Math.max(0, overrides.estimated_search_total_cost) }
      : {}),
    ...(typeof overrides.search_phase_count === "number"
      ? { search_phase_count: Math.max(1, Math.round(overrides.search_phase_count)) }
      : {}),
    ...(overrides.judge_mode === "single" || overrides.judge_mode === "dual"
      ? { judge_mode: overrides.judge_mode }
      : {}),
  };
}

function estimateBrightPipelineLlmCost(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  renderProfileEntries: string[];
  selectedCount: number;
  finalRows: CandidateRowInput[];
  runtime: SearchExecutionRuntime;
}): SearchCostEstimate {
  const parseCost =
    typeof params.parsed.estimated_parse_llm_cost === "number"
      ? Math.max(0, Number(params.parsed.estimated_parse_llm_cost))
      : estimateSearchIntentCost(params.context.jdText);
  const searchContextTokens = estimateTokensFromText(buildPromptSearchContext(params.parsed), 250);
  const truncatedJdTokens = estimateTokensFromText(
    truncateForPrompt(params.context.jdText, 3000),
    220,
  );
  const sampleSize = Math.min(5, params.renderProfileEntries.length);
  const avgProfileTokens =
    sampleSize > 0
      ? Math.ceil(
          params.renderProfileEntries
            .slice(0, sampleSize)
            .reduce((sum, entry) => sum + estimateTokensFromText(entry, 500), 0) / sampleSize,
        )
      : 500;

  const preScreenInputTokens = searchContextTokens + avgProfileTokens + 180;
  const preScreenOutputTokens = Math.min(params.runtime.lightPrescreenMaxOutputTokens, 60);
  const preScreenCost =
    params.renderProfileEntries.length *
    estimateLlmCallCost(preScreenInputTokens, preScreenOutputTokens);

  const judgeInputTokens = searchContextTokens + truncatedJdTokens + avgProfileTokens + 260;
  const judgeOutputTokens = Math.min(params.runtime.judgeMaxOutputTokens, 260);
  const judgeCallCount =
    params.runtime.judgeMode === "single"
      ? params.selectedCount
      : params.selectedCount * 2;
  const judgeCost =
    judgeCallCount * estimateLlmCallCost(judgeInputTokens, judgeOutputTokens);

  const arbiterCallCount =
    params.runtime.judgeMode === "dual"
      ? Math.round(params.selectedCount * ESTIMATED_DEEP_REVIEW_CONFLICT_RATE)
      : 0;
  const arbiterInputTokens = searchContextTokens + truncatedJdTokens + avgProfileTokens + 320;
  const arbiterOutputTokens = Math.min(params.runtime.arbiterMaxOutputTokens, 220);
  const arbiterCost =
    arbiterCallCount * estimateLlmCallCost(arbiterInputTokens, arbiterOutputTokens);

  const outreachPromptSample =
    params.finalRows.length > 0
      ? buildSearchOutreachPrompt(
          params.parsed,
          params.context.jdText,
          params.finalRows[0],
        )
      : null;
  const outreachInputTokens = estimateTokensFromText(outreachPromptSample, 220);
  const outreachOutputTokens = Math.min(params.runtime.outreachMaxOutputTokens, 180);
  const outreachCost =
    params.finalRows.length * estimateLlmCallCost(outreachInputTokens, outreachOutputTokens);

  const estimatedLlmCost = roundCurrency(
    parseCost + preScreenCost + judgeCost + arbiterCost + outreachCost,
  );

  return {
    estimatedLlmCost,
    estimatedSearchTotalCost: estimatedLlmCost,
  };
}

function mergeCostEstimates(
  current: SearchDisplayStats,
  previous?: SearchDisplayStats | null,
): SearchDisplayStats {
  const brightSnapshotCost = roundCurrency(
    (previous?.bright_snapshot_cost ?? 0) + (current.bright_snapshot_cost ?? 0),
  );
  const estimatedLlmCost = roundCurrency(
    (previous?.estimated_llm_cost ?? 0) + (current.estimated_llm_cost ?? 0),
  );
  const estimatedSearchTotalCost = roundCurrency(
    brightSnapshotCost + estimatedLlmCost,
  );

  return buildSearchDisplayStats({
    ...current,
    bright_snapshot_cost: brightSnapshotCost,
    estimated_llm_cost: estimatedLlmCost,
    estimated_search_total_cost: estimatedSearchTotalCost,
  });
}

function normalizeSearchPhase(value: unknown): SearchPhase {
  return value === "phase_2" ? "phase_2" : "phase_1";
}

function normalizeSearchResultStage(value: unknown): SearchResultStage {
  return value === "final" ? "final" : "provisional";
}

function normalizeSearchDisplayStats(value: unknown): SearchDisplayStats | null {
  return value && typeof value === "object"
    ? buildSearchDisplayStats(value as Partial<SearchDisplayStats>)
    : null;
}

function withExecutionState(
  parsed: Record<string, unknown>,
  executionProfile: SearchExecutionProfile,
  options: {
    planCode: SearchPlanCode;
    searchPhase: SearchPhase;
    resultStage: SearchResultStage;
    searchPhaseCount: number;
    displayCount?: number;
  },
): Record<string, unknown> {
  return {
    ...parsed,
    plan_code: options.planCode,
    execution_profile: executionProfile.name,
    search_phase: options.searchPhase,
    result_stage: options.resultStage,
    search_phase_count: options.searchPhaseCount,
    judge_mode: executionProfile.singleJudgeMode ? "single" : "dual",
    display_count: options.displayCount ?? executionProfile.finalResultCap,
  };
}

function shouldUpgradeToFullPass(
  hiringBrief: HiringBrief,
  displayStats: SearchDisplayStats,
) {
  const hasStrictLocalConstraint =
    (hiringBrief.work_model === "onsite" || hiringBrief.work_model === "hybrid") &&
    hiringBrief.location_flexibility === "strict";
  if (hasStrictLocalConstraint) return true;
  if ((displayStats.qualified_count ?? 0) < 10) return true;
  if ((displayStats.advanceable_count ?? 0) < 8) return true;
  if ((displayStats.top_quality_score ?? 0) < 70) return true;
  return false;
}

function normalizeRecallMetadata(value: unknown): RecallMetadata | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const provider = item.provider === "serper" ? "serper" : "brightdata_dataset";
  const snapshotId = normalizeNullableString(item.snapshot_id);
  if (!snapshotId) return null;

  const status = normalizeNullableString(item.status);
  const dataset_size =
    typeof item.dataset_size === "number" && Number.isFinite(item.dataset_size)
      ? Math.max(0, Math.round(item.dataset_size))
      : null;
  const recall_latency_ms =
    typeof item.recall_latency_ms === "number" && Number.isFinite(item.recall_latency_ms)
      ? Math.max(0, Math.round(item.recall_latency_ms))
      : null;
  const cost =
    typeof item.cost === "number" && Number.isFinite(item.cost)
      ? Math.max(0, item.cost)
      : null;
  const bright_profile_budget =
    typeof item.bright_profile_budget === "number" && Number.isFinite(item.bright_profile_budget)
      ? Math.max(0, Math.round(item.bright_profile_budget))
      : null;
  const bright_profiles_requested =
    typeof item.bright_profiles_requested === "number" &&
      Number.isFinite(item.bright_profiles_requested)
      ? Math.max(0, Math.round(item.bright_profiles_requested))
      : null;
  const bright_profiles_returned =
    typeof item.bright_profiles_returned === "number" &&
      Number.isFinite(item.bright_profiles_returned)
      ? Math.max(0, Math.round(item.bright_profiles_returned))
      : null;
  const requested_at = normalizeNullableString(item.requested_at);
  const completed_at = normalizeNullableString(item.completed_at);
  const rawFilterSummary =
    item.filter_summary && typeof item.filter_summary === "object"
      ? (item.filter_summary as Record<string, unknown>)
      : null;
  const filter_summary = rawFilterSummary
    ? {
      title_terms: normalizeStringArray(rawFilterSummary.title_terms, 12),
      country_codes: normalizeStringArray(rawFilterSummary.country_codes, 6),
      location_terms: normalizeStringArray(rawFilterSummary.location_terms, 10),
    }
    : null;
  const judge_mode =
    item.judge_mode === "single" || item.judge_mode === "dual"
      ? item.judge_mode
      : null;

  return {
    provider,
    snapshot_id: snapshotId,
    dataset_size,
    recall_latency_ms,
    cost,
    bright_profile_budget,
    bright_profiles_requested,
    bright_profiles_returned,
    judge_mode,
    requested_at,
    completed_at,
    status:
      status === "submitted" || status === "polling" || status === "ready"
        ? status
        : undefined,
    filter_summary,
  };
}

function normalizeSummaryTerms(values: string[] | undefined) {
  return [...(values || [])]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort();
}

function hasRecallSnapshotDrift(
  metadata: RecallMetadata | null,
  filterSummary: { title_terms: string[]; country_codes: string[]; location_terms: string[] },
  executionProfile: SearchExecutionProfile,
  runtime: SearchExecutionRuntime,
  requestedLimit: number,
) {
  if (!metadata || metadata.provider !== "brightdata_dataset") return false;
  if (!metadata.snapshot_id) return false;

  const sameTitleTerms =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.title_terms)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.title_terms));
  const sameCountryCodes =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.country_codes)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.country_codes));
  const sameLocationTerms =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.location_terms)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.location_terms));
  const sameBudget =
    metadata.bright_profile_budget == null ||
    metadata.bright_profile_budget === executionProfile.filterLimit;
  const sameRequested =
    metadata.bright_profiles_requested == null ||
    metadata.bright_profiles_requested === requestedLimit;
  const sameJudgeMode =
    metadata.judge_mode == null ||
    metadata.judge_mode === runtime.judgeMode;

  return !(
    sameTitleTerms &&
    sameCountryCodes &&
    sameLocationTerms &&
    sameBudget &&
    sameRequested &&
    sameJudgeMode
  );
}

function canReuseParsedRequirements(search: SearchRow) {
  const parsed = search.parsed_requirements;
  if (!parsed || typeof parsed !== "object") return false;
  const title = normalizeNullableString(parsed.title);
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, Number(parsed.candidate_count) || 5);
  return Boolean(search.parse_completed_at && title && recallSpec.title_variants.length > 0);
}

function withDisplayStats(
  parsed: Record<string, unknown>,
  stats: SearchDisplayStats,
): Record<string, unknown> {
  return {
    ...parsed,
    display_stats: stats,
  };
}

function truncateForPrompt(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Job description truncated for prompt length]`;
}


function normalizeEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function sanitizeHiringBrief(value: unknown, fallbackParsed: Record<string, unknown>): HiringBrief {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const roleCore =
    item.role_core && typeof item.role_core === "object"
      ? (item.role_core as Record<string, unknown>)
      : {};

  const fallbackRequired = normalizeStringArray(fallbackParsed.required_skills, 12);
  const fallbackNiceToHave = normalizeStringArray(fallbackParsed.nice_to_have_skills, 12);

  return {
    role_core: {
      title: normalizeNullableString(roleCore.title) || normalizeNullableString(fallbackParsed.title),
      seniority:
        normalizeNullableString(roleCore.seniority) ||
        normalizeNullableString(fallbackParsed.seniority),
      function_focus: normalizeNullableString(roleCore.function_focus),
      required_skills:
        normalizeStringArray(roleCore.required_skills, 12).length > 0
          ? normalizeStringArray(roleCore.required_skills, 12)
          : fallbackRequired,
      nice_to_have_skills:
        normalizeStringArray(roleCore.nice_to_have_skills, 12).length > 0
          ? normalizeStringArray(roleCore.nice_to_have_skills, 12)
          : fallbackNiceToHave,
    },
    work_model: normalizeEnumValue(
      item.work_model,
      ["onsite", "hybrid", "remote", "unknown"] as const,
      "unknown",
    ),
    location_scope:
      normalizeNullableString(item.location_scope) ||
      normalizeNullableString(fallbackParsed.location),
    location_flexibility: normalizeEnumValue(
      item.location_flexibility,
      ["strict", "moderate", "flexible"] as const,
      "moderate",
    ),
    relocation_allowed: normalizeEnumValue(
      item.relocation_allowed,
      ["yes", "no", "unknown"] as const,
      "unknown",
    ),
    must_have_constraints: normalizeStringArray(item.must_have_constraints, 10),
    soft_constraints: normalizeStringArray(item.soft_constraints, 10),
    screening_intent: normalizeNullableString(item.screening_intent),
    candidate_count_strategy: normalizeEnumValue(
      item.candidate_count_strategy,
      ["focused_shortlist", "broader_shortlist"] as const,
      "focused_shortlist",
    ),
    constraint_reasoning: normalizeNullableString(item.constraint_reasoning),
  };
}

function buildPromptSearchContext(parsed: Record<string, unknown>) {
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const lines = [
    `Title: ${normalizeNullableString(parsed.title) || "N/A"}`,
  ];

  if (hiringBrief.role_core.seniority) {
    lines.push(`Seniority: ${hiringBrief.role_core.seniority}`);
  }
  if (hiringBrief.work_model && hiringBrief.work_model !== "unknown") {
    lines.push(`Work Model: ${hiringBrief.work_model}`);
  }
  if (hiringBrief.location_scope) {
    lines.push(`Target Location: ${hiringBrief.location_scope}`);
  }
  lines.push(
    `Location Flexibility: ${hiringBrief.location_flexibility} | Relocation Allowed: ${hiringBrief.relocation_allowed}`,
  );
  if (hiringBrief.role_core.required_skills.length > 0) {
    lines.push(`Must-Have Skills: ${hiringBrief.role_core.required_skills.slice(0, 10).join(", ")}`);
  }
  if (hiringBrief.must_have_constraints.length > 0) {
    lines.push(`Must-Have Constraints: ${hiringBrief.must_have_constraints.slice(0, 6).join(" | ")}`);
  }

  const recallSpec = normalizeRecallSpec(parsed.recall_spec, Number(parsed.candidate_count) || 5);
  if (recallSpec.title_variants.length > 0) {
    lines.push(`Title Variants: ${recallSpec.title_variants.join(" || ")}`);
  }
  if (recallSpec.core_skill_terms.length > 0) {
    lines.push(`Core Skills: ${recallSpec.core_skill_terms.join(", ")}`);
  }
  if (recallSpec.countries.length > 0) {
    lines.push(`Countries: ${recallSpec.countries.join(", ")}`);
  }

  return lines.join("\n");
}

function sanitizeConstraintVerdicts(value: unknown): ConstraintVerdict {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    location_fit: normalizeEnumValue(
      item.location_fit,
      ["local", "nearby", "non_local", "unknown"] as const,
      "unknown",
    ),
    work_model_fit: normalizeEnumValue(
      item.work_model_fit,
      ["yes", "no", "unclear"] as const,
      "unclear",
    ),
    must_have_coverage: normalizeEnumValue(
      item.must_have_coverage,
      ["strong", "partial", "weak", "unknown"] as const,
      "unknown",
    ),
  };
}

function sanitizeCompanyProfile(value: unknown): CompanyProfile | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const profile: CompanyProfile = {
    size: normalizeNullableString(item.size),
    mission: normalizeNullableString(item.mission),
    benefits: normalizeNullableString(item.benefits),
    tech_stack: normalizeNullableString(item.tech_stack),
    selling_points: normalizeNullableString(item.selling_points),
  };
  const hasAnyValue = Object.values(profile).some(Boolean);
  return hasAnyValue ? profile : null;
}

function appendCompanyProfileContextLines(
  lines: string[],
  title: string,
  profile: CompanyProfile | null,
) {
  if (!profile) return;
  lines.push(title);
  if (profile.size) lines.push(`- Size: ${profile.size}`);
  if (profile.mission) lines.push(`- Mission: ${profile.mission}`);
  if (profile.tech_stack) lines.push(`- Tech stack: ${profile.tech_stack}`);
  if (profile.benefits) lines.push(`- Benefits: ${profile.benefits}`);
  if (profile.selling_points) lines.push(`- Why join: ${profile.selling_points}`);
}

function buildCompanyProfileContext(parsed: Record<string, unknown>) {
  const globalCompanyProfile = sanitizeCompanyProfile(parsed.company_profile);
  const jdCompanyProfile = sanitizeCompanyProfile(parsed.jd_company_profile);

  if (!globalCompanyProfile && !jdCompanyProfile) {
    return "Company context: Not provided. Infer join likelihood from JD scope, role level, work model, and public candidate signals only.";
  }

  const lines = ["Company Profile Context:"];
  appendCompanyProfileContextLines(
    lines,
    "Workspace Global Profile (supplemental):",
    globalCompanyProfile,
  );
  appendCompanyProfileContextLines(
    lines,
    "JD Company Website Profile (prefer this when conflict exists):",
    jdCompanyProfile,
  );
  return lines.join("\n");
}

function stripSpeculativeRelocation(texts: string[]) {
  return texts.filter((text) => {
    const normalized = text.toLowerCase();
    return !(
      normalized.includes("relocat") ||
      normalized.includes("move to") ||
      normalized.includes("willing to move") ||
      normalized.includes("willingness to move")
    );
  });
}

function normalizeScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}

function normalizeBlockingSeverity(value: unknown): BlockingSeverity {
  return normalizeEnumValue(
    value,
    ["hard", "soft", "none"] as const,
    "none",
  );
}

function normalizeAdvanceRecommendation(value: unknown): AdvanceRecommendation {
  return normalizeEnumValue(
    value,
    ["advance", "hold", "reject"] as const,
    "hold",
  );
}

function normalizeBlockingConstraints(value: unknown) {
  return normalizeStringArray(value, 8);
}

const UNCERTAIN_BLOCKING_TERMS = [
  "unknown",
  "unverifiable",
  "unverified",
  "unclear",
  "not enough",
  "insufficient",
  "sparse",
  "no evidence",
  "cannot confirm",
  "can't confirm",
];

function isUncertainBlockingConstraint(text: string) {
  const normalized = text.toLowerCase();
  return UNCERTAIN_BLOCKING_TERMS.some((term) => normalized.includes(term));
}

function calibrateBlockingSeverity(
  blockingSeverity: BlockingSeverity,
  blockingConstraints: string[],
  constraintVerdicts: ConstraintVerdict,
) {
  if (blockingSeverity !== "hard") return blockingSeverity;

  // Keep hard only when there is explicit incompatibility.
  const explicitHardConflict =
    constraintVerdicts.location_fit === "non_local" ||
    constraintVerdicts.work_model_fit === "no";
  if (explicitHardConflict) return "hard";

  const allConstraintsUncertain =
    blockingConstraints.length === 0 ||
    blockingConstraints.every(isUncertainBlockingConstraint);

  if (
    allConstraintsUncertain ||
    constraintVerdicts.location_fit === "unknown" ||
    constraintVerdicts.work_model_fit === "unclear"
  ) {
    return "soft";
  }

  return blockingSeverity;
}

function computeQualityScore(
  capabilityScore: number,
  relevanceScore: number,
) {
  return Math.round((capabilityScore + relevanceScore) / 2);
}

function computeAdvanceScore(
  qualityScore: number,
  joinLikelihoodScore: number,
  blockingSeverity: BlockingSeverity,
) {
  const baseScore = Math.round((qualityScore * 0.75) + (joinLikelihoodScore * 0.25));
  const penalty = blockingSeverity === "hard" ? 35 : blockingSeverity === "soft" ? 12 : 0;
  return Math.max(0, Math.min(100, baseScore - penalty));
}

function deriveAdvanceRecommendation(
  advanceScore: number,
  blockingSeverity: BlockingSeverity,
) {
  if (blockingSeverity === "hard") return "reject";
  if (advanceScore >= 72 && blockingSeverity === "none") return "advance";
  if (advanceScore >= 45) return "hold";
  return "reject";
}

function deriveFitDecisionFromScore(score: number): CandidateSuitability["fit_decision"] {
  if (score >= 85) return "strong_fit";
  if (score >= 65) return "viable_fit";
  if (score >= 40) return "risky_fit";
  return "reject";
}

function deriveActionabilityFromScores(
  qualityScore: number,
  advanceRecommendation: AdvanceRecommendation,
): CandidateSuitability["actionability"] {
  if (advanceRecommendation === "advance") return "ready_to_act";
  if (qualityScore >= 60 && advanceRecommendation === "hold") return "needs_review";
  return "not_actionable";
}

function sanitizeCandidateSuitability(value: unknown): CandidateSuitability | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const capabilityScore = normalizeScore(item.capability_score);
  const relevanceScore =
    item.relevance_score != null ? normalizeScore(item.relevance_score) : normalizeScore(item.match_score);
  const joinLikelihoodScore = normalizeScore(item.join_likelihood_score);
  const hasTriScores =
    item.capability_score != null ||
    item.relevance_score != null ||
    item.join_likelihood_score != null;
  const qualityScore = hasTriScores
    ? (
      item.quality_score != null
        ? normalizeScore(item.quality_score)
        : computeQualityScore(capabilityScore, relevanceScore)
    )
    : normalizeScore(item.match_score);
  const rawBlockingSeverity = normalizeBlockingSeverity(item.blocking_severity);
  const constraintVerdicts = sanitizeConstraintVerdicts(item.constraint_verdicts);
  const blockingConstraints = normalizeBlockingConstraints(
    item.blocking_constraints ?? item.constraint_risks ?? item.risk_flags,
  );
  const blockingSeverity = calibrateBlockingSeverity(
    rawBlockingSeverity,
    blockingConstraints,
    constraintVerdicts,
  );
  const useProvidedAdvanceScore =
    item.advance_score != null && blockingSeverity === rawBlockingSeverity;
  const advanceScore = useProvidedAdvanceScore
    ? normalizeScore(item.advance_score)
    : computeAdvanceScore(qualityScore, joinLikelihoodScore, blockingSeverity);
  const useProvidedAdvanceRecommendation =
    item.advance_recommendation != null && blockingSeverity === rawBlockingSeverity;
  const advanceRecommendation = normalizeAdvanceRecommendation(
    useProvidedAdvanceRecommendation
      ? item.advance_recommendation
      : deriveAdvanceRecommendation(advanceScore, blockingSeverity),
  );
  const fitDecision = deriveFitDecisionFromScore(qualityScore);
  let actionability = deriveActionabilityFromScores(qualityScore, advanceRecommendation);
  if (!hasTriScores && item.actionability != null) {
    actionability = normalizeEnumValue(
      item.actionability,
      ["ready_to_act", "needs_review", "not_actionable"] as const,
      actionability,
    );
  }

  return {
    fit_decision: fitDecision,
    actionability,
    match_score: qualityScore,
    quality_score: qualityScore,
    advance_score: advanceScore,
    advance_recommendation: advanceRecommendation,
    blocking_constraints: blockingConstraints,
    blocking_severity: blockingSeverity,
    scoring_breakdown: {
      capability_score: capabilityScore,
      relevance_score: relevanceScore,
      join_likelihood_score: joinLikelihoodScore,
      join_likelihood_reasons: stripSpeculativeRelocation(
        normalizeStringArray(item.join_likelihood_reasons, 6),
      ),
      quality_score: qualityScore,
      advance_score: advanceScore,
    },
    constraint_verdicts: constraintVerdicts,
    constraint_risks: stripSpeculativeRelocation(
      normalizeStringArray(item.constraint_risks ?? item.risk_flags, 6),
    ),
    risk_flags: stripSpeculativeRelocation(normalizeStringArray(item.risk_flags, 6)),
    why_this_candidate: stripSpeculativeRelocation(
      normalizeStringArray(item.why_this_candidate, 6),
    ),
    why_not_higher: stripSpeculativeRelocation(normalizeStringArray(item.why_not_higher, 6)),
    evidence_quality: normalizeEnumValue(
      item.evidence_quality,
      ["high", "medium", "low"] as const,
      "medium",
    ),
  };
}

function sanitizeSerperPreScreenDecision(value: unknown): SerperPreScreenDecision | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const keep = item.keep === true;
  let matchScore =
    typeof item.match_score === "number" && Number.isFinite(item.match_score)
      ? Math.max(0, Math.min(100, Math.round(item.match_score)))
      : 0;

  // Keep score range sane, but avoid forcing everything across pass threshold.
  if (keep && matchScore < 40) matchScore = 40;
  if (!keep && matchScore > 80) matchScore = 80;

  return {
    keep,
    match_score: matchScore,
    reason:
      normalizeNullableString(item.reason) ||
      "Potential fit based on title, snippet, and keyword overlap.",
  };
}

function sortCandidateAssessments(left: ScoredCandidateAssessment, right: ScoredCandidateAssessment) {
  const evidenceRank: Record<CandidateSuitability["evidence_quality"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return (
    right.suitability.quality_score - left.suitability.quality_score ||
    right.suitability.advance_score - left.suitability.advance_score ||
    right.suitability.scoring_breakdown.relevance_score - left.suitability.scoring_breakdown.relevance_score ||
    right.suitability.scoring_breakdown.capability_score - left.suitability.scoring_breakdown.capability_score ||
    evidenceRank[left.suitability.evidence_quality] - evidenceRank[right.suitability.evidence_quality]
  );
}

function trimBrightDataProfileForMetadata(profile: BrightDataProfile) {
  return {
    ...profile,
    avatar: null,
    about: profile.about ? profile.about.substring(0, 1000) : null,
    experience: (profile.experience || []).slice(0, 8).map((entry) => ({
      ...entry,
      description: entry.description ? entry.description.substring(0, 500) : null,
    })),
    education: (profile.education || []).slice(0, 5),
    skills: (profile.skills || []).slice(0, 20),
    certifications: (profile.certifications || []).slice(0, 10),
    languages: (profile.languages || []).slice(0, 10),
  };
}

function getAIModel() {
  const provider = (process.env.AI_PROVIDER || "anthropic").trim().toLowerCase();
  if (provider === "openrouter") {
    return process.env.AI_MODEL || "anthropic/claude-sonnet-4.6";
  }
  if (provider === "deepseek") {
    return process.env.AI_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat";
  }
  return process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || "claude-sonnet-4-20250514";
}

function getJudgeModel() {
  const provider = (process.env.AI_PROVIDER || "anthropic").trim().toLowerCase();
  if (provider === "openrouter") {
    return (
      process.env.SEARCH_JUDGE_MODEL ||
      process.env.OPENROUTER_JUDGE_MODEL ||
      process.env.AI_MODEL ||
      "anthropic/claude-sonnet-4.6"
    );
  }
  if (provider === "deepseek") {
    return (
      process.env.SEARCH_JUDGE_MODEL ||
      process.env.DEEPSEEK_JUDGE_MODEL ||
      process.env.AI_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      "deepseek-chat"
    );
  }
  return (
    process.env.SEARCH_JUDGE_MODEL ||
    process.env.ANTHROPIC_JUDGE_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-20250514"
  );
}

function getArbiterModel() {
  const provider = (process.env.AI_PROVIDER || "anthropic").trim().toLowerCase();
  if (provider === "openrouter") {
    return (
      process.env.SEARCH_ARBITER_MODEL ||
      process.env.OPENROUTER_ARBITER_MODEL ||
      getJudgeModel()
    );
  }
  if (provider === "deepseek") {
    return (
      process.env.SEARCH_ARBITER_MODEL ||
      process.env.DEEPSEEK_ARBITER_MODEL ||
      getJudgeModel()
    );
  }
  return (
    process.env.SEARCH_ARBITER_MODEL ||
    process.env.ANTHROPIC_ARBITER_MODEL ||
    getJudgeModel()
  );
}

function getHaikuModel() {
  const provider = (process.env.AI_PROVIDER || "anthropic").trim().toLowerCase();
  if (provider === "openrouter") {
    return (
      process.env.SEARCH_LIGHT_MODEL ||
      process.env.OPENROUTER_HAIKU_MODEL ||
      "claude-haiku-4-5-20251001"
    );
  }
  if (provider === "deepseek") {
    return (
      process.env.SEARCH_LIGHT_MODEL ||
      process.env.DEEPSEEK_LIGHT_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      process.env.AI_MODEL ||
      "deepseek-chat"
    );
  }
  return (
    process.env.SEARCH_LIGHT_MODEL ||
    process.env.ANTHROPIC_HAIKU_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    process.env.AI_MODEL ||
    "claude-sonnet-4-20250514"
  );
}

function createAIClient() {
  const provider = (process.env.AI_PROVIDER || "anthropic").trim().toLowerCase();
  
  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is missing");
    }

    const config: {
      apiKey: string;
      baseURL: string;
      fetch?: typeof fetch;
    } = {
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    };

    if (process.env.NODE_ENV === "development" && process.env.HTTP_PROXY) {
      const proxyAgent = new ProxyAgent(process.env.HTTP_PROXY);

      config.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const requestInit = (init ?? {}) as Record<string, unknown>;
        return undiciFetch(input as never, {
          ...requestInit,
          dispatcher: proxyAgent,
        } as never) as unknown as Promise<Response>;
      }) as typeof fetch;
    }

    return createOpenAI(config);
  }

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is missing");
    }

    const config: {
      apiKey: string;
      baseURL: string;
      fetch?: typeof fetch;
    } = {
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    };

    if (process.env.NODE_ENV === "development" && process.env.HTTP_PROXY) {
      const proxyAgent = new ProxyAgent(process.env.HTTP_PROXY);

      config.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const requestInit = (init ?? {}) as Record<string, unknown>;
        return undiciFetch(input as never, {
          ...requestInit,
          dispatcher: proxyAgent,
        } as never) as unknown as Promise<Response>;
      }) as typeof fetch;
    }

    const deepseekClient = createOpenAI(config);
    const chatPreferredClient = ((modelId: string) =>
      deepseekClient.chat(modelId)) as typeof deepseekClient;
    Object.assign(chatPreferredClient, deepseekClient);
    return chatPreferredClient;
  }
  
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }
  return createAnthropic({
    apiKey: anthropicApiKey,
    ...(process.env.ANTHROPIC_BASE_URL
      ? { baseURL: process.env.ANTHROPIC_BASE_URL }
      : {}),
  });
}

function buildSearchOutreachPrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  candidate: CandidateRowInput,
) {
  const firstName = candidate.name.split(/\s+/).filter(Boolean)[0] || "there";
  const roleTitle = normalizeNullableString(parsed.title) || "this role";
  const skills = candidate.skills.slice(0, 8).join(", ");
  const matchReasons = candidate.match_reasons.slice(0, 3).join("; ");

  return `Write tailored recruiting outreach drafts for this candidate.

## Job Description
${truncateForPrompt(jdText.trim(), 4000)}

## Role Summary
Title: ${roleTitle}

## Candidate
Name: ${candidate.name}
Headline: ${candidate.headline || "Professional"}
Location: ${candidate.location || "Unknown"}
Skills: ${skills || "Unknown"}
Match reasons: ${matchReasons || "Strong fit for the role"}

## Task
Return ONLY valid JSON with this exact shape:
{
  "subject": "string",
  "linkedin": "string",
  "email": "string"
}

Rules:
- Make both drafts specific to this person and this role.
- Keep the LinkedIn InMail under 80 words and casual.
- Keep the email body under 120 words and slightly more formal.
- Both drafts must start with "Hi ${firstName},"
- No markdown. No code fences. No extra keys.`;
}

async function generateOutreachDraftsForRows(
  context: PipelineContext,
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  rows: CandidateRowInput[],
) {
  if (rows.length === 0) return rows;

  const aiClient = createAIClient();
  const draftedRows = await Promise.all(
    rows.map(async (row) => {
      if (row.outreach_draft) return row;

      try {
        const { text } = await withTimeout(
          generateText({
            model: aiClient(getHaikuModel()),
            prompt: buildSearchOutreachPrompt(parsed, context.jdText, row),
            maxOutputTokens: runtime.outreachMaxOutputTokens,
          }),
          60000,
          `Outreach draft for ${row.name}`,
        );

        const parsedDraft = JSON.parse(extractJSON(text));
        return {
          ...row,
          outreach_draft: JSON.stringify({
            subject: normalizeNullableString(parsedDraft.subject) || `${normalizeNullableString(parsed.title) || "Opportunity"} opportunity`,
            linkedin:
              normalizeNullableString(parsedDraft.linkedin) ||
              `Hi ${row.name.split(/\s+/)[0] || "there"}, I came across your background and thought it looked highly relevant to our ${normalizeNullableString(parsed.title) || "open role"}. Would you be open to a quick chat?`,
            email:
              normalizeNullableString(parsedDraft.email) ||
              `Hi ${row.name.split(/\s+/)[0] || "there"}, I came across your background and thought it looked highly relevant to our ${normalizeNullableString(parsed.title) || "open role"}. Would you be open to a quick chat?\n\nBest regards`,
          }),
        };
      } catch (error) {
        logSearchEvent("search_outreach_draft_fallback", {
          search_id: context.searchId,
          candidate: row.name,
          error: error instanceof Error ? error.message : String(error),
        });
        const firstName = row.name.split(/\s+/).filter(Boolean)[0] || "there";
        return {
          ...row,
          outreach_draft: JSON.stringify({
            subject: `${normalizeNullableString(parsed.title) || "Opportunity"} opportunity`,
            linkedin: `Hi ${firstName}, I came across your profile and thought your background looked relevant for our ${normalizeNullableString(parsed.title) || "open role"}. Would you be open to a quick chat?`,
            email: `Hi ${firstName}, I came across your background and thought it looked relevant for our ${normalizeNullableString(parsed.title) || "open role"}. Would you be open to a quick chat?\n\nBest regards`,
          }),
        };
      }
    }),
  );

  return draftedRows;
}

export function kickSearchJobRunner(
  baseUrl: string,
  options?: { searchId?: string | null },
) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return;

  void fetch(new URL("/api/internal/search-jobs/run", baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      searchId: options?.searchId ?? null,
    }),
  }).catch((error) => {
    console.error("[search_jobs] Failed to kick runner:", error);
  });
}

export async function enqueueSearchJob(input: {
  searchId: string;
  userId: string;
  jdText: string;
  candidateCount: number;
}) {
  const timestamp = nowIso();
  const { data, error } = await supabaseAdmin
    .from("hirelix_search_jobs")
    .upsert(
      {
        search_id: input.searchId,
        user_id: input.userId,
        jd_text: input.jdText,
        candidate_count: input.candidateCount,
        status: "queued",
        attempt_count: 0,
        last_error: null,
        available_at: timestamp,
        locked_at: null,
        started_at: null,
        finished_at: null,
        updated_at: timestamp,
      },
      { onConflict: "search_id" },
    )
    .select("id, search_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to enqueue search job");
  }

  logSearchEvent("search_job_enqueued", {
    job_id: data.id,
    search_id: input.searchId,
    candidate_count: input.candidateCount,
  });

  return data;
}

function buildSerperSingleCandidatePrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  candidate: SerperCandidate,
) {
  return `You are doing the first-pass screen for a hiring pipeline.

## Original Job Description
${truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${buildPromptSearchContext(parsed)}

## Candidate
${serperCandidateToRichProfile(candidate, 0)}

## Task
Decide whether this single candidate should move to the next round for deeper review.

Return ONLY valid JSON with this exact shape:
{
  "keep": true,
  "match_score": 0,
  "reason": "one short sentence"
}

Rules:
- This is a snippet-level decision, but precision matters more than recall.
- Keep indicates whether this candidate looks worth scraping for richer LinkedIn data.
- match_score is used for ranking candidates against each other. Keep score granularity meaningful.
- Default to keep=false when evidence is sparse or ambiguous.
- Keep=true should require at least two clear positive signals (title alignment, stack signal, seniority fit, or location/work-model feasibility).
- For onsite/hybrid roles with a target location, unknown/non-local location should be strongly penalized.
- If the JD clearly requires a specific city/country for onsite or strict hybrid work, treat explicit out-of-region evidence as a hard conflict at this stage.
- For explicit out-of-region conflicts, set keep=false and use a low match_score (typically 0-20).
- If location evidence is missing for a strict location-constrained role, default to keep=false unless other profile evidence clearly indicates in-region feasibility.
- Non-engineering or obvious noise profiles should be rejected.
- Use this score rubric:
  - 90-100: explicit strong match on role + must-have stack + location/work-model feasibility.
  - 75-89: strong role and stack evidence with no major constraint conflict.
  - 60-74: moderate but credible fit, worth scraping when building a wider pool.
  - 40-59: weak evidence, major unknowns, or likely constraint risk.
  - 0-39: clear mismatch, noise role, or hard conflict.
- A deterministic programmatic location gate may also run in this pipeline; your job is to identify concrete location/work-model evidence accurately.
- For strict onsite/hybrid roles, apply location/work-model feasibility directly in keep/match_score and explain conflicts clearly.
- Keep reason under 20 words.
- Return raw JSON only. No markdown fences. Do not return extra fields.`;
}

function buildJudgeScorePrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  richProfiles: string,
  poolSize: number,
  judgeLabel: "Judge A" | "Judge B",
) {
  const styleHint =
    judgeLabel === "Judge A"
      ? "Lean slightly toward recruiter optimism, but do not violate hard constraints."
      : "Lean slightly toward recruiter skepticism, but do not over-penalize strong evidence.";
  const jsonShape = poolSize === 1
    ? `{
  "index": 0,
  "capability_score": 0,
  "relevance_score": 0,
  "join_likelihood_score": 0,
  "join_likelihood_reasons": ["string"],
  "constraint_verdicts": {
    "location_fit": "local | nearby | non_local | unknown",
    "work_model_fit": "yes | no | unclear",
    "must_have_coverage": "strong | partial | weak | unknown"
  },
  "blocking_constraints": ["string"],
  "blocking_severity": "hard | soft | none",
  "advance_recommendation": "advance | hold | reject",
  "short_reasons": ["string"],
  "risk_flags": ["string"],
  "evidence_quality": "high | medium | low",
  "skills": ["string"],
  "experience_years": 0,
  "location": "string | null"
}`
    : `[
  {
    "index": 0,
    "capability_score": 0,
    "relevance_score": 0,
    "join_likelihood_score": 0,
    "join_likelihood_reasons": ["string"],
    "constraint_verdicts": {
      "location_fit": "local | nearby | non_local | unknown",
      "work_model_fit": "yes | no | unclear",
      "must_have_coverage": "strong | partial | weak | unknown"
    },
    "blocking_constraints": ["string"],
    "blocking_severity": "hard | soft | none",
    "advance_recommendation": "advance | hold | reject",
    "short_reasons": ["string"],
    "risk_flags": ["string"],
    "evidence_quality": "high | medium | low",
    "skills": ["string"],
    "experience_years": 0,
    "location": "string | null"
  }
]`;
  const indexRule = poolSize === 1
    ? 'Return exactly one JSON object. Use the candidate index shown in the profile header (for example "[57] Name" means index 57).'
    : "Return one object per profile.";

  return `You are ${judgeLabel}, one of two independent hiring reviewers.

## Original Job Description
${truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${buildPromptSearchContext(parsed)}

## Candidate Profiles (${poolSize} candidates)
The profiles below are raw candidate profiles derived from LinkedIn data.

${richProfiles}

## Task
Review each candidate independently using this exact JSON shape:
${jsonShape}

Rules:
- ${styleHint}
- ${indexRule}
- capability_score measures how strong the person is overall in seniority, depth, and execution track record.
- relevance_score measures how directly their real background matches this JD's stack, responsibilities, and domain.
- join_likelihood_score measures how realistic it is that they would seriously consider this specific opportunity.
- Use blocking_constraints to explicitly call out real blockers such as location, work model, seniority, authorization, or company-stage mismatch.
- blocking_severity should be hard only for explicit incompatibilities.
- If evidence is missing, unclear, or unverifiable, use soft (not hard).
- For single-city onsite/hybrid roles, mark non-local candidates as hard unless profile has explicit relocation proof.
- For roles with explicit city/country hard constraints, treat explicit out-of-region evidence as a hard blocker and reflect it in blocking_constraints.
- For explicit out-of-region hard blockers, do not output advance_recommendation=advance.
- advance_recommendation should reflect whether this candidate is worth moving forward in the real world, independent of raw quality.
- Penalize overqualification, role-level mismatch, prestige mismatch, unrealistic company-stage mismatch, and hard location/work-model mismatch in join_likelihood_score.
- Do not collapse quality because of sparse evidence alone. Use evidence_quality + risk fields to express uncertainty.
- When title/about/current role strongly align but details are sparse, capability/relevance can still be moderate.
- Reserve very low capability/relevance for explicit mismatch, not just missing fields.
- Do not reward prestige alone.
- Keep short_reasons concrete and short. Max 3 items, each under 14 words.
- Keep join_likelihood_reasons concrete and evidence-based. Max 3 items, each under 16 words.
- Keep risk_flags concrete and short. Max 3 items, each under 10 words.
- Do not speculate about relocation or work authorization.
- Return ONLY valid JSON. Do NOT wrap the JSON in markdown code blocks (no \`\`\`json or \`\`\`). Return raw JSON directly.`;
}

function buildArbiterPrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  profileText: string,
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
) {
  return `${CANDIDATE_SUITABILITY_PROMPT}

You are the scoring arbiter. Two independent reviewers disagreed on this candidate. Your job is to resolve the conflict and return a single final decision.

## Original Job Description
${truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${buildPromptSearchContext(parsed)}

## Company Context
${buildCompanyProfileContext(parsed)}

## Candidate Profile
${profileText}

## Judge A
${JSON.stringify(judgeA, null, 2)}

## Judge B
${JSON.stringify(judgeB, null, 2)}

## Your Task
Return exactly one final assessment object for this candidate. Resolve the disagreement rather than averaging blindly.

Rules:
- Return tri-scores plus explicit quality/advance outputs.
- quality_score should reflect only candidate quality for this JD: capability + relevance.
- advance_score should reflect real-world advanceability: quality + join likelihood - blocker severity.
- join_likelihood_score can influence advance_score but must not directly drag down quality_score.
- Sparse or incomplete profile evidence should lower confidence tags first, not automatically collapse quality_score.
- Reserve very low quality_score for clear mismatch, not mere missing details.
- For single-city onsite/hybrid roles, non-local location_fit should normally be a hard blocker unless explicit relocation evidence exists.
- If location, work model, authorization, seniority, or company-stage mismatch is a real blocker, list it in blocking_constraints.
- For explicit city/country hard constraints in the JD, explicit out-of-region evidence should remain a hard blocker in the final arbitration.
- Use hard blocker only for explicit conflicts; unknown or sparse evidence must be soft.
- Keep text fields concise: max 3 bullets per array, each under 16 words.
- Return ONLY valid JSON array with one object using this exact shape:
[
  {
    "index": 0,
    "capability_score": 0,
    "relevance_score": 0,
    "join_likelihood_score": 0,
    "quality_score": 0,
    "advance_score": 0,
    "advance_recommendation": "advance | hold | reject",
    "blocking_constraints": ["string"],
    "blocking_severity": "hard | soft | none",
    "join_likelihood_reasons": ["string"],
    "constraint_verdicts": {
      "location_fit": "local | nearby | non_local | unknown",
      "work_model_fit": "yes | no | unclear",
      "must_have_coverage": "strong | partial | weak | unknown"
    },
    "risk_flags": ["string"],
    "why_this_candidate": ["string"],
    "why_not_higher": ["string"],
    "skills": ["string"],
    "experience_years": 0,
    "location": "string | null",
    "evidence_quality": "high | medium | low"
  }
]
- Return ONLY valid JSON array with one object.`;
}

function parseScoredAssessments(
  raw: unknown,
  poolSize: number,
): ScoredCandidateAssessment[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): ScoredCandidateAssessment | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const rawIndex = typeof item.index === "number" ? item.index : Number(item.index);
      if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= poolSize) return null;
      const suitability = sanitizeCandidateSuitability(item);
      if (!suitability) return null;
      return {
        index: rawIndex,
        suitability,
        skills: normalizeStringArray(item.skills, 10),
        experience_years: normalizeExperienceYears(item.experience_years),
        location: normalizeNullableString(item.location),
      };
    })
    .filter((entry): entry is ScoredCandidateAssessment => Boolean(entry))
    .sort(sortCandidateAssessments);
}

function parseJudgeScoreResults(
  raw: unknown,
  poolSize: number,
  expectedIndexes: number[] = [],
): JudgeScoreResult[] {
  const entries = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).assessments && Array.isArray((raw as Record<string, unknown>).assessments)
        ? (raw as Record<string, unknown>).assessments as unknown[]
        : [raw])
      : []);
  if (entries.length === 0) return [];
  const fallbackIndex = expectedIndexes.length === 1 ? expectedIndexes[0] : null;

  return entries
    .map((entry): JudgeScoreResult | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const rawIndexValue =
        typeof item.index === "number"
          ? item.index
          : item.index != null
            ? Number(item.index)
            : fallbackIndex;
      if (!Number.isFinite(rawIndexValue) || rawIndexValue == null) return null;
      const rawIndex = rawIndexValue;
      if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= poolSize) return null;
      const suitability = sanitizeCandidateSuitability(item);
      return {
        index: rawIndex,
        capability_score: normalizeScore(item.capability_score),
        relevance_score:
          item.relevance_score != null
            ? normalizeScore(item.relevance_score)
            : suitability?.match_score ?? normalizeScore(item.match_score),
        join_likelihood_score: normalizeScore(item.join_likelihood_score),
        join_likelihood_reasons: stripSpeculativeRelocation(
          normalizeStringArray(item.join_likelihood_reasons, 3),
        ),
        short_reasons: normalizeStringArray(item.short_reasons, 3),
        risk_flags: stripSpeculativeRelocation(
          normalizeStringArray(item.risk_flags ?? item.constraint_risks, 4),
        ),
        blocking_constraints: normalizeBlockingConstraints(item.blocking_constraints),
        blocking_severity: normalizeBlockingSeverity(item.blocking_severity),
        advance_recommendation: normalizeAdvanceRecommendation(item.advance_recommendation),
        constraint_verdicts: sanitizeConstraintVerdicts(item.constraint_verdicts),
        evidence_quality: normalizeEnumValue(
          item.evidence_quality,
          ["high", "medium", "low"] as const,
          "medium",
        ),
        skills: normalizeStringArray(item.skills, 10),
        experience_years: normalizeExperienceYears(item.experience_years),
        location: normalizeNullableString(item.location),
      };
    })
    .filter((entry): entry is JudgeScoreResult => Boolean(entry));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  fn: (item: TInput) => Promise<TOutput>,
) {
  const results: TOutput[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function setSearchStatus(
  searchId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const payload = {
    status,
    pipeline_step: status === "degraded" ? "done" : status,
    updated_at: nowIso(),
    ...extra,
  };

  await supabaseAdmin.from("hirelix_searches").update(payload).eq("id", searchId);
}

async function updateSearchParsedRequirements(
  searchId: string,
  parsed: Record<string, unknown>,
) {
  await supabaseAdmin
    .from("hirelix_searches")
    .update({
      parsed_requirements: parsed,
      updated_at: nowIso(),
    })
    .eq("id", searchId);
}

async function updateSearchUsageEventMetadata(
  searchId: string,
  metadataPatch: Record<string, unknown>,
) {
  const { data: event } = await supabaseAdmin
    .from("hirelix_usage_events")
    .select("id, metadata")
    .eq("related_id", searchId)
    .eq("event_type", "search_created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event?.id) return;

  const currentMetadata =
    event.metadata && typeof event.metadata === "object"
      ? (event.metadata as Record<string, unknown>)
      : {};

  await supabaseAdmin
    .from("hirelix_usage_events")
    .update({
      metadata: {
        ...currentMetadata,
        ...metadataPatch,
      },
    })
    .eq("id", event.id);
}

async function updateJobStatus(
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  await supabaseAdmin
    .from("hirelix_search_jobs")
    .update({
      status,
      updated_at: nowIso(),
      ...extra,
    })
    .eq("id", jobId);
}

async function claimSearchJob(
  preferredSearchId?: string | null,
): Promise<SearchJobRow | null> {
  const now = nowIso();
  const candidateRows: SearchJobRow[] = [];

  if (preferredSearchId) {
    const { data } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .select("*")
      .eq("search_id", preferredSearchId)
      .in("status", ["queued", "retryable_error"])
      .lte("available_at", now)
      .limit(1);
    if (data) candidateRows.push(...data);
  }

  if (candidateRows.length === 0) {
    const { data } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .select("*")
      .in("status", ["queued", "retryable_error"])
      .lte("available_at", now)
      .order("available_at", { ascending: true })
      .limit(10);
    if (data) candidateRows.push(...data);
  }

  for (const job of candidateRows) {
    const { data: claimed } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .update({
        status: "running",
        locked_at: nowIso(),
        started_at: job.started_at ?? nowIso(),
        attempt_count: (job.attempt_count || 0) + 1,
        updated_at: nowIso(),
        last_error: null,
      })
      .eq("id", job.id)
      .in("status", ["queued", "retryable_error"])
      .select("*")
      .single();

    if (claimed) {
      return claimed as SearchJobRow;
    }
  }

  return null;
}

async function hasRunnableSearchJobs() {
  const { count } = await supabaseAdmin
    .from("hirelix_search_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "retryable_error"])
    .lte("available_at", nowIso());

  return (count || 0) > 0;
}


function buildSerperCandidateRows(
  candidates: SerperPreScreenedCandidate[],
  limit: number,
) {
  return candidates.slice(0, limit).map((item) => {
    const candidate = serperCandidateToDbCandidate(item.serperCandidate);
    return {
      ...candidate,
      match_score: item.preScreen.match_score,
      match_reasons: [item.preScreen.reason],
      metadata: {
        source: "google",
        analysis_stage: "final",
        pre_screen: item.preScreen,
      },
    };
  });
}

function buildBrightDataCandidateRows(
  profiles: BrightDataProfile[],
  selected: ScoredCandidateAssessment[],
  limit: number,
  poolType: "top_pick" | "outreach_pool",
) {
  const rows: CandidateRowInput[] = [];

  for (const item of selected.slice(0, limit)) {
    const rawIndex = item.index;
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= profiles.length) continue;

    const profile = profiles[rawIndex];
    const derivedCompanyHeadline = profile.current_company
      ? `${profile.current_company.title || ""} at ${profile.current_company.name || ""}`.trim() || null
      : null;
    rows.push({
      name: profile.name || "Unknown",
      headline: profile.headline || derivedCompanyHeadline,
      location: item.location || [profile.city, profile.country_code].filter(Boolean).join(", ") || null,
      skills: item.skills.length > 0
        ? item.skills
        : (profile.skills || []).slice(0, 10),
      experience_years: item.experience_years,
      match_score: item.suitability.quality_score || item.suitability.match_score || 50,
      match_reasons:
        item.suitability.why_this_candidate.length > 0
          ? item.suitability.why_this_candidate
          : ["Profile matches search criteria"],
      profile_url: profile.url || profile.input?.url || null,
      github_url: null,
      email: null,
      outreach_draft: null,
      metadata: {
        source: "brightdata",
        analysis_stage: "final",
        preliminary: false,
        pool_type: poolType,
        scoring_method: item.scoring_method || "dual_review_auto",
        judge_delta: item.judge_delta ?? 0,
        judge_conflict: item.judge_conflict ?? false,
        quality_score: item.suitability.quality_score,
        advance_score: item.suitability.advance_score,
        advance_recommendation: item.suitability.advance_recommendation,
        blocking_constraints: item.suitability.blocking_constraints,
        blocking_severity: item.suitability.blocking_severity,
        quality_breakdown: {
          capability_score: item.suitability.scoring_breakdown.capability_score,
          relevance_score: item.suitability.scoring_breakdown.relevance_score,
        },
        suitability: item.suitability,
        scoring_breakdown: item.suitability.scoring_breakdown,
        constraint_verdicts: item.suitability.constraint_verdicts,
        constraint_risks: item.suitability.constraint_risks,
        risk_flags: item.suitability.risk_flags,
        join_likelihood_reasons: item.suitability.scoring_breakdown.join_likelihood_reasons,
        why_not_higher: item.suitability.why_not_higher,
        work_history: (profile.experience || [])
          .slice(0, 5)
          .map((entry) => ({
            title: normalizeNullableString(entry.title),
            company: normalizeNullableString(entry.company),
            start_date: normalizeNullableString(entry.duration),
            end_date: null,
            summary: normalizeNullableString(entry.description),
          }))
          .filter((entry) => entry.title || entry.company || entry.summary),
        education: (profile.education || [])
          .slice(0, 3)
          .map((entry) => ({
            school: normalizeNullableString(entry.subtitle),
            degree: normalizeNullableString(entry.degree),
            major: normalizeNullableString(entry.field_of_study),
            start_year: normalizeNullableString(entry.start_year),
            end_year: normalizeNullableString(entry.end_year),
          }))
          .filter((entry) => entry.school || entry.degree || entry.major),
        about: profile.about ? profile.about.substring(0, 500) : null,
        raw_profile: trimBrightDataProfileForMetadata(profile),
      },
    });
  }

  return rows;
}

function mergeCandidateRows(
  primary: CandidateRowInput[],
  supplement: CandidateRowInput[],
  limit: number,
) {
  const merged: CandidateRowInput[] = [];
  const seen = new Set<string>();

  for (const row of [...primary, ...supplement]) {
    const key = (row.profile_url || row.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= limit) break;
  }

  return merged;
}

function hasJudgeConflict(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
) {
  const judgeAQuality = computeQualityScore(judgeA.capability_score, judgeA.relevance_score);
  const judgeBQuality = computeQualityScore(judgeB.capability_score, judgeB.relevance_score);
  return (
    Math.abs(judgeA.capability_score - judgeB.capability_score) > 8 ||
    Math.abs(judgeA.relevance_score - judgeB.relevance_score) > 8 ||
    Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score) > 8 ||
    judgeA.blocking_severity !== judgeB.blocking_severity ||
    judgeA.advance_recommendation !== judgeB.advance_recommendation ||
    deriveFitDecisionFromScore(judgeAQuality) !== deriveFitDecisionFromScore(judgeBQuality) ||
    (judgeA.relevance_score >= 75 && judgeB.join_likelihood_score <= 35) ||
    (judgeB.relevance_score >= 75 && judgeA.join_likelihood_score <= 35)
  );
}

function mergeJudgeResults(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
): ScoredCandidateAssessment {
  const capabilityScore = Math.round((judgeA.capability_score + judgeB.capability_score) / 2);
  const relevanceScore = Math.round((judgeA.relevance_score + judgeB.relevance_score) / 2);
  const joinLikelihoodScore = Math.round(
    (judgeA.join_likelihood_score + judgeB.join_likelihood_score) / 2,
  );
  const blockingSeverity: BlockingSeverity =
    judgeA.blocking_severity === "hard" || judgeB.blocking_severity === "hard"
      ? "hard"
      : judgeA.blocking_severity === "soft" || judgeB.blocking_severity === "soft"
        ? "soft"
        : "none";
  const qualityScore = computeQualityScore(capabilityScore, relevanceScore);
  const advanceScore = computeAdvanceScore(
    qualityScore,
    joinLikelihoodScore,
    blockingSeverity,
  );
  const advanceRecommendation =
    judgeA.advance_recommendation === "reject" || judgeB.advance_recommendation === "reject"
      ? "reject"
      : judgeA.advance_recommendation === "hold" || judgeB.advance_recommendation === "hold"
        ? "hold"
        : deriveAdvanceRecommendation(advanceScore, blockingSeverity);
  const suitability = sanitizeCandidateSuitability({
    capability_score: capabilityScore,
    relevance_score: relevanceScore,
    join_likelihood_score: joinLikelihoodScore,
    quality_score: qualityScore,
    advance_score: advanceScore,
    advance_recommendation: advanceRecommendation,
    blocking_constraints: Array.from(
      new Set([...judgeA.blocking_constraints, ...judgeB.blocking_constraints]),
    ).slice(0, 8),
    blocking_severity: blockingSeverity,
    join_likelihood_reasons: Array.from(
      new Set([...judgeA.join_likelihood_reasons, ...judgeB.join_likelihood_reasons]),
    ).slice(0, 6),
    constraint_verdicts: judgeA.constraint_verdicts,
    risk_flags: [...judgeA.risk_flags, ...judgeB.risk_flags],
    constraint_risks: [...judgeA.risk_flags, ...judgeB.risk_flags],
    why_this_candidate: [...judgeA.short_reasons, ...judgeB.short_reasons],
    why_not_higher: [...judgeA.risk_flags, ...judgeB.risk_flags],
    evidence_quality:
      judgeA.evidence_quality === "high" || judgeB.evidence_quality === "high"
        ? "high"
        : judgeA.evidence_quality === "medium" || judgeB.evidence_quality === "medium"
          ? "medium"
          : "low",
  });

  return {
    index: judgeA.index,
    suitability: suitability || {
      fit_decision: "reject",
      actionability: "not_actionable",
      match_score: 0,
      quality_score: 0,
      advance_score: 0,
      advance_recommendation: "reject",
      blocking_constraints: [],
      blocking_severity: "none",
      scoring_breakdown: {
        capability_score: 0,
        relevance_score: 0,
        join_likelihood_score: 0,
        join_likelihood_reasons: [],
        quality_score: 0,
        advance_score: 0,
      },
      constraint_verdicts: {
        location_fit: "unknown",
        work_model_fit: "unclear",
        must_have_coverage: "unknown",
      },
      constraint_risks: [],
      risk_flags: [],
      why_this_candidate: [],
      why_not_higher: [],
      evidence_quality: "medium",
    },
    skills: Array.from(new Set([...judgeA.skills, ...judgeB.skills])).slice(0, 10),
    experience_years: judgeA.experience_years ?? judgeB.experience_years,
    location: judgeA.location ?? judgeB.location,
    scoring_method: "dual_review_auto",
    judge_delta: Math.max(
      Math.abs(judgeA.capability_score - judgeB.capability_score),
      Math.abs(judgeA.relevance_score - judgeB.relevance_score),
      Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
    ),
    judge_conflict: false,
  };
}

function tagPoolRows(
  primaryRows: CandidateRowInput[],
  supplementalRows: CandidateRowInput[],
  highlightCount: number,
  candidateLimit: number,
) {
  const finalRows = mergeCandidateRows(primaryRows, supplementalRows, candidateLimit).sort(
    (left, right) => {
      const rightPreliminary = right.metadata?.preliminary === true ? 1 : 0;
      const leftPreliminary = left.metadata?.preliminary === true ? 1 : 0;
      return (
        right.match_score - left.match_score ||
        leftPreliminary - rightPreliminary
      );
    },
  );
  return finalRows.map((row, index) => ({
    ...row,
    metadata: {
      ...row.metadata,
      pool_type: index < highlightCount ? "top_pick" : "outreach_pool",
    },
  }));
}

function buildBrightDataRecallFilter(
  parsed: Record<string, unknown>,
  candidateCount: number,
  executionProfile: SearchExecutionProfile,
): BrightDataDatasetFilterRequest | null {
  const datasetId =
    process.env.BRIGHTDATA_RECALL_DATASET_ID ||
    process.env.BRIGHTDATA_DATASET_ID;
  if (!datasetId) return null;

  const recallSpec = normalizeRecallSpec(parsed.recall_spec, candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  const titleTerms = (recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value)))
    .filter((term) => !isPlaceholderTitle(term));

  if (titleTerms.length === 0) return null;

  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);
  const locationTerms = recallSpec.location_terms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 3)
    .slice(0, 3);

  const rootFilters: BrightDataFilterRule[] = [
    {
      operator: "or",
      filters: titleTerms.map((term) => ({
        name: "position",
        operator: "includes",
        value: term,
      })),
    },
  ];

  if (countryCodes.length > 0) {
    rootFilters.push(
      countryCodes.length === 1
        ? {
          name: "country_code",
          operator: "=",
          value: countryCodes[0],
        }
        : {
          operator: "or",
          filters: countryCodes.map((country) => ({
            name: "country_code",
            operator: "=",
            value: country,
          })),
        },
    );
  }

  if (
    hiringBrief.location_flexibility === "strict" &&
    locationTerms.length > 0
  ) {
    rootFilters.push({
      operator: "or",
      filters: locationTerms.map((term) => ({
        name: "city",
        operator: "includes",
        value: term,
      })),
    });
  }

  return {
    datasetId,
    recordsLimit: executionProfile.filterLimit,
    filter:
      rootFilters.length === 1
        ? rootFilters[0]
        : {
          operator: "and",
          filters: rootFilters,
        },
  };
}

async function upsertCandidatesForSearch(
  searchId: string,
  rows: CandidateRowInput[],
  options?: { replaceMissing?: boolean },
) {
  const { data: existingRows } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, name, profile_url")
    .eq("search_id", searchId);

  const existing = existingRows || [];
  const matchedIds = new Set<string>();
  const inserts: Record<string, unknown>[] = [];

  for (const row of rows) {
    const existingMatch = existing.find((candidate) => {
      if (row.profile_url && candidate.profile_url) {
        return candidate.profile_url === row.profile_url;
      }
      return candidate.name.toLowerCase() === row.name.toLowerCase();
    });

    const payload = {
      search_id: searchId,
      name: row.name,
      headline: row.headline,
      location: row.location,
      skills: row.skills,
      experience_years: row.experience_years,
      match_score: row.match_score,
      match_reasons: row.match_reasons,
      profile_url: row.profile_url,
      github_url: row.github_url,
      email: row.email,
      outreach_draft: row.outreach_draft,
      metadata: row.metadata,
    };

    if (existingMatch) {
      matchedIds.add(existingMatch.id);
      await supabaseAdmin
        .from("hirelix_candidates")
        .update(payload)
        .eq("id", existingMatch.id);
    } else {
      inserts.push(payload);
    }
  }

  if (inserts.length > 0) {
    await supabaseAdmin.from("hirelix_candidates").insert(inserts);
  }

  if (options?.replaceMissing) {
    const idsToDelete = existing
      .filter((candidate) => !matchedIds.has(candidate.id))
      .map((candidate) => candidate.id);

    if (idsToDelete.length > 0) {
      await supabaseAdmin.from("hirelix_candidates").delete().in("id", idsToDelete);
    }
  }
}

async function parseJobDescription(
  context: PipelineContext,
  existingParsed?: Record<string, unknown> | null,
) {
  await setSearchStatus(context.searchId, "parsing");
  logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "parsing",
    job_id: context.jobId,
  });

  const aiClient = createAIClient();
  let parsed: Record<string, unknown> | null = null;
  let lastParseError: string | null = null;
  let estimatedParseCost = 0;

  for (let attempt = 1; attempt <= PARSE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { text } = await withTimeout(
        generateText({
          model: aiClient(getAIModel()),
          system: JD_SEARCH_INTENT_PROMPT,
          prompt: context.jdText,
          maxOutputTokens: PARSE_MAX_OUTPUT_TOKENS,
        }),
        60000,
        "Search intent generation",
      );
      estimatedParseCost += estimateSearchIntentCost(context.jdText, text);

      const candidate = JSON.parse(extractJSON(text)) as Record<string, unknown>;
      if (isWeakParsedIntent(candidate, context.candidateCount)) {
        lastParseError = "weak_parsed_intent";
        logSearchEvent("search_parse_retry", {
          search_id: context.searchId,
          attempt,
          reason: lastParseError,
          job_id: context.jobId,
        });
        if (attempt < PARSE_MAX_ATTEMPTS) continue;
      }
      parsed = candidate;
      break;
    } catch (error) {
      lastParseError = error instanceof Error ? error.message : String(error);
      logSearchEvent("search_parse_retry", {
        search_id: context.searchId,
        attempt,
        reason: lastParseError,
        job_id: context.jobId,
      });
      if (attempt >= PARSE_MAX_ATTEMPTS) break;
    }
  }

  if (!parsed) {
    parsed = {
      title: extractLikelyTitleFromJdText(context.jdText) || "Untitled Role",
      hiring_brief: {
        work_model: "unknown",
        location_scope: null,
        location_flexibility: "moderate",
        relocation_allowed: "unknown",
      },
      recall_spec: {
        countries: inferCountriesFromJdText(context.jdText),
        title_variants: [],
        core_skill_terms: deriveCoreSkillsFromJdText(context.jdText, 12),
        record_limit: BRIGHTDATA_FILTER_LIMIT,
      },
    };
  }

  parsed.title =
    normalizeNullableString(parsed.title) ||
    extractLikelyTitleFromJdText(context.jdText) ||
    "Untitled Role";
  parsed.hiring_brief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  parsed.candidate_count = context.candidateCount;
  parsed.display_count =
    Number(existingParsed?.display_count) || context.candidateCount;
  parsed.highlight_count =
    Number(existingParsed?.highlight_count) || context.highlightCount;
  parsed.outreach_pool_target =
    Number(existingParsed?.outreach_pool_target) || context.outreachPoolTarget;

  try {
    const { data: settings } = await supabaseAdmin
      .from("hirelix_user_settings")
      .select("company_profile")
      .eq("user_id", context.userId)
      .single();
    const companyProfile = sanitizeCompanyProfile(settings?.company_profile);
    if (companyProfile) {
      parsed.company_profile = companyProfile;
    } else if (existingParsed?.company_profile) {
      parsed.company_profile = sanitizeCompanyProfile(existingParsed.company_profile);
    }
  } catch {
    if (existingParsed?.company_profile) {
      parsed.company_profile = sanitizeCompanyProfile(existingParsed.company_profile);
    }
  }

  const existingJdCompanyProfile = sanitizeCompanyProfile(existingParsed?.jd_company_profile);
  const existingJdCompanyWebsite = normalizeNullableString(existingParsed?.jd_company_website);
  if (existingJdCompanyProfile) {
    parsed.jd_company_profile = existingJdCompanyProfile;
  }
  if (existingJdCompanyWebsite) {
    parsed.jd_company_website = existingJdCompanyWebsite;
  }

  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_spec = enrichRecallSpecFromJd(parsed, context.jdText, context.candidateCount);
  parsed.estimated_parse_llm_cost = roundCurrency(
    estimatedParseCost || estimateSearchIntentCost(context.jdText),
  );
  const existingRecallMetadata = normalizeRecallMetadata(existingParsed?.recall_metadata);
  if (existingRecallMetadata?.provider === "brightdata_dataset") {
    parsed.recall_metadata = existingRecallMetadata;
  }
  await supabaseAdmin
    .from("hirelix_searches")
    .update({
      title: parsed.title || "Untitled Role",
      parsed_requirements: parsed,
      parse_completed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", context.searchId);

  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "parsing",
    job_id: context.jobId,
  });

  return parsed;
}

const SOURCE_RULE_NOISE_TERMS = [
  "account executive",
  "sales manager",
  "business development",
  "recruiter",
  "talent acquisition",
  "human resources",
  "customer success",
  "marketing manager",
  "graphic designer",
  "loan officer",
  "real estate agent",
  "insurance agent",
];

const SOURCE_RULE_ENGINEERING_TERMS = [
  "software engineer",
  "backend engineer",
  "full stack",
  "full-stack",
  "frontend engineer",
  "platform engineer",
  "machine learning engineer",
  "data engineer",
  "sre",
  "devops",
];

function extractLocationFromJdText(jdText: string) {
  const line = jdText
    .split("\n")
    .map((entry) => entry.replace(/\*/g, "").trim())
    .find((entry) => /^location\s*:/i.test(entry));
  if (!line) return null;
  const raw = line.replace(/^location\s*:/i, "").trim();
  if (!raw) return null;
  return raw.split(/[|(]/)[0]?.trim() || null;
}

function buildSerperSourceRuleContext(
  parsed: Record<string, unknown>,
  jdText: string,
): SerperSourceRuleContext {
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, Number(parsed.candidate_count) || 5);

  const titleTerms = Array.from(
    new Set(
      [
        normalizeNullableString(parsed.title),
        hiringBrief.role_core.title,
        ...recallSpec.title_variants,
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  ).slice(0, 8);

  const mustHaveTerms = splitSkillTerms(
    [
      ...hiringBrief.role_core.required_skills,
      ...normalizeStringArray(parsed.required_skills, 12),
      ...recallSpec.core_skill_terms,
    ].slice(0, 16),
  )
    .map((term) => normalizeText(term))
    .filter(Boolean)
    .slice(0, 12);

  const locationFromJd = extractLocationFromJdText(jdText);
  const locationScope =
    hiringBrief.location_scope || normalizeNullableString(parsed.location) || locationFromJd;
  const locationTerms = deriveLocationTerms(
    locationScope,
  );
  const onsiteOrHybrid = hiringBrief.work_model === "onsite" || hiringBrief.work_model === "hybrid";
  const strictLocationFromBrief =
    onsiteOrHybrid &&
    (
      hiringBrief.location_flexibility === "strict" ||
      hiringBrief.relocation_allowed === "no"
    );
  const strictLocationRequireHit =
    strictLocationFromBrief &&
    (
      STRICT_LOCATION_REQUIRE_HIT ||
      hiringBrief.location_flexibility === "strict" ||
      hiringBrief.relocation_allowed === "no"
    );
  const locationPreference: "strict" | "preferred" | "none" =
    locationTerms.length === 0
      ? "none"
      : strictLocationFromBrief
        ? "strict"
        : (onsiteOrHybrid || hiringBrief.relocation_allowed === "no")
          ? "preferred"
          : "none";

  return {
    titleTerms,
    mustHaveTerms,
    strictLocation: locationPreference === "strict",
    strictLocationRequireHit,
    locationPreference,
    locationTerms,
  };
}

function evaluateSerperSourceRules(
  candidate: SerperCandidate,
  context: SerperSourceRuleContext,
): SerperSourceRuleDecision {
  const candidateText = normalizeText(
    [candidate.name, candidate.headline, candidate.snippet, candidate.linkedin_url]
      .filter(Boolean)
      .join(" "),
  );

  const title_hit = context.titleTerms.some((term) => candidateText.includes(term));
  const mustHaveHits = context.mustHaveTerms.filter((term) => candidateText.includes(term)).length;
  const mustHaveTotal = context.mustHaveTerms.length;
  const location_hit =
    context.locationTerms.length > 0
      ? context.locationTerms.some((term) => candidateText.includes(term))
      : null;
  const engineeringSignal = SOURCE_RULE_ENGINEERING_TERMS.some((term) =>
    candidateText.includes(term),
  );
  const noiseHits = SOURCE_RULE_NOISE_TERMS.filter((term) => candidateText.includes(term));
  const noise_penalty = Math.min(36, noiseHits.length * 12);

  let score = 0;
  const reasons: string[] = [];

  if (title_hit) {
    score += 40;
  } else {
    const partialTitleHit = context.titleTerms.some((term) =>
      term
        .split(" ")
        .filter((piece) => piece.length > 2)
        .every((piece) => candidateText.includes(piece)),
    );
    if (partialTitleHit) score += 24;
    else reasons.push("title_miss");
  }

  if (mustHaveTotal > 0) {
    score += Math.round((mustHaveHits / mustHaveTotal) * 35);
    if (mustHaveHits === 0) reasons.push("must_have_miss");
  } else {
    score += 20;
  }

  if (location_hit === true) {
    score +=
      context.locationPreference === "strict"
        ? 20
        : context.locationPreference === "preferred"
          ? 16
          : 12;
  } else if (location_hit === false) {
    if (context.locationPreference === "strict") {
      reasons.push("strict_location_miss");
    } else if (context.locationPreference === "preferred") {
      score -= 12;
      reasons.push("preferred_location_miss");
    }
  } else if (context.locationPreference === "strict") {
    reasons.push("strict_location_unknown");
  } else if (context.locationPreference === "preferred") {
    score -= 6;
    reasons.push("preferred_location_unknown");
  } else {
    score += 6;
  }

  if (engineeringSignal) score += 8;
  if (noise_penalty > 0) {
    score -= noise_penalty;
    reasons.push("noise_penalty");
  }

  // Only hard-reject explicit location mismatch. Unknown location should stay in play
  // and let AI light-screening decide with stronger penalties.
  const hard_reject =
    context.strictLocation &&
    location_hit === false;
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: hard_reject ? Math.min(clampedScore, SOURCE_RULE_PASS_SCORE - 1) : clampedScore,
    hard_reject,
    reasons,
    title_hit,
    must_have_hits: mustHaveHits,
    must_have_total: mustHaveTotal,
    location_hit,
    noise_penalty,
  };
}

function shouldStopSerperTierExpansion(
  uniqueCount: number,
  newUniqueCount: number,
) {
  if (uniqueCount < TARGET_SCRAPE_COUNT) return false;
  const gainRatio =
    uniqueCount <= 0 ? 0 : newUniqueCount / uniqueCount;
  return gainRatio < STOP_MIN_GAIN_RATIO;
}

function selectTopLightCandidates(
  preScreened: SerperPreScreenedCandidate[],
) {
  if (preScreened.length === 0) {
    return {
      selected: [] as SerperPreScreenedCandidate[],
      selectedCount: 0,
      selectedRate: 0,
      target: PRE_SCREEN_TARGET,
      cutoffScore: null as number | null,
    };
  }

  const sorted = [...preScreened].sort(
    (left, right) => right.preScreen.match_score - left.preScreen.match_score,
  );
  const selectedCount = Math.min(sorted.length, PRE_SCREEN_TARGET);
  const selected = sorted.slice(0, selectedCount);
  const selectedRate = selectedCount / sorted.length;
  return {
    selected,
    selectedCount,
    selectedRate,
    target: PRE_SCREEN_TARGET,
    cutoffScore:
      selected.length > 0 ? selected[selected.length - 1]?.preScreen.match_score ?? null : null,
  };
}

function selectTopDeepAssessments(
  assessments: ScoredCandidateAssessment[],
  finalResultCap: number,
) {
  // 过滤掉所有 hard blocked 且 rejected 的候选人
  // 这是最终保险丝：确保 strict location gate 的结果被执行
  const eligibleAssessments = assessments.filter(
    (assessment) => !(
      assessment.suitability.blocking_severity === "hard" &&
      assessment.suitability.advance_recommendation === "reject"
    ),
  );

  if (eligibleAssessments.length === 0) {
    return {
      selected: [] as ScoredCandidateAssessment[],
      selectedCount: 0,
      selectedRate: 0,
      target: finalResultCap,
    };
  }

  const sorted = [...eligibleAssessments].sort(sortCandidateAssessments);
  const selectedCount = Math.min(sorted.length, finalResultCap);
  const selected = sorted.slice(0, selectedCount);
  const selectedRate = selectedCount / sorted.length;

  return {
    selected,
    selectedCount,
    selectedRate,
    target: finalResultCap,
  };
}


async function preScreenSerperCandidate(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  candidate: SerperCandidate,
): Promise<SerperPreScreenedCandidate> {
  const prompt = buildSerperSingleCandidatePrompt(parsed, jdText, candidate);

  const lightModel = getHaikuModel();

  try {
    const { text } = await withTimeout(
      generateText({
        model: aiClient(lightModel),
        prompt,
        maxOutputTokens: LIGHT_PRESCREEN_MAX_OUTPUT_TOKENS,
      }),
      15000,
      "Serper candidate pre-screen",
    );

    const decision = sanitizeSerperPreScreenDecision(JSON.parse(extractJSON(text)));
    if (decision) {
      return {
        serperCandidate: candidate,
        preScreen: decision,
      };
    }
  } catch (error) {
    logSearchEvent("search_prescreen_failed", {
      provider: (process.env.AI_PROVIDER || "anthropic").trim().toLowerCase(),
      model: lightModel,
      candidate_url: candidate.linkedin_url,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fall through to conservative default.
  }

  return {
    serperCandidate: candidate,
    preScreen: {
      keep: false,
      match_score: 0,
      reason: "LLM prescreen failed; candidate held for manual fallback only.",
    },
  };
}

async function preScreenAllCandidates(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  candidates: SerperCandidate[],
): Promise<SerperPreScreenedCandidate[]> {
  if (!candidates.length) return [];

  // 先执行 deterministic location gate
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const locationPolicy = normalizeLocationConstraint(hiringBrief);

  const candidatesWithGate = candidates.map(candidate => {
    const evidence = extractCandidateLocationEvidence(
      null, // Serper 没有单独 location 字段
      null, // Serper 没有 country_code
      candidate.headline,
      candidate.snippet,
    );
    const gateResult = evaluateCandidateLocationGate(locationPolicy, evidence);
    return { candidate, gateResult };
  });

  // strict block 的候选人直接不进入 LLM prescreen
  // 注意：Serper 候选人没有结构化 location 字段，unknown 不能直接 block
  // 只拦截明确 non-local 的候选人，unknown 交给 LLM prescreen 判断
  const eligibleCandidates = candidatesWithGate.filter(
    ({ gateResult }) => !(gateResult.decision === "block" && gateResult.location_fit === "non_local")
  );

  const blockedCount = candidates.length - eligibleCandidates.length;
  if (blockedCount > 0) {
    logSearchEvent("search_location_gate_applied", {
      stage: "prescreen",
      blocked_count: blockedCount,
      total_count: candidates.length,
    });
  }

  const preScreened = await runWithConcurrency(
    eligibleCandidates.map(({ candidate }) => candidate),
    resolveStageConcurrency(PRE_SCREEN_CONCURRENCY, eligibleCandidates.length),
    async (candidate) => preScreenSerperCandidate(aiClient, parsed, jdText, candidate),
  );

  return preScreened.sort(
    (a, b) => b.preScreen.match_score - a.preScreen.match_score,
  );
}

async function buildBrightDataDatasetCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  executionProfile: SearchExecutionProfile,
): Promise<SearchPipelineResult | null> {
  const brightDataToken = process.env.BRIGHTDATA_API_TOKEN;
  const runtime = getExecutionRuntime(executionProfile);
  const isPhaseTwoRefinement =
    normalizeSearchPhase(parsed.search_phase) === "phase_2" &&
    normalizeSearchResultStage(parsed.result_stage) === "provisional";
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  const recallRequest = buildBrightDataRecallFilter(
    parsed,
    context.candidateCount,
    executionProfile,
  );
  if (!brightDataToken || !recallRequest) {
    return null;
  }

  await setSearchStatus(
    context.searchId,
    isPhaseTwoRefinement ? "deep_scoring" : "searching",
  );
  const existingRecallMetadata = normalizeRecallMetadata(parsed.recall_metadata);
  let snapshotId = existingRecallMetadata?.snapshot_id ?? null;
  let requestedAt = existingRecallMetadata?.requested_at
    ? Date.parse(existingRecallMetadata.requested_at)
    : Number.NaN;

  const filterSummary = {
    title_terms: recallSpec.title_variants.length > 0
      ? recallSpec.title_variants
      : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value)),
    country_codes: recallSpec.countries
      .map((country) => normalizeCountryCode(country))
      .filter((country): country is string => Boolean(country))
      .slice(0, 4),
    location_terms: recallSpec.location_terms
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 3),
  };

  if (
    hasRecallSnapshotDrift(
      existingRecallMetadata,
      filterSummary,
      executionProfile,
      runtime,
      recallRequest.recordsLimit,
    )
  ) {
    logSearchEvent("search_recall_snapshot_invalidated", {
      search_id: context.searchId,
      old_snapshot_id: existingRecallMetadata?.snapshot_id,
      execution_profile: executionProfile.name,
      previous_filter_summary: existingRecallMetadata?.filter_summary ?? null,
      next_filter_summary: filterSummary,
      previous_budget: existingRecallMetadata?.bright_profile_budget ?? null,
      next_budget: executionProfile.filterLimit,
      previous_judge_mode: existingRecallMetadata?.judge_mode ?? null,
      next_judge_mode: runtime.judgeMode,
      job_id: context.jobId,
    });
    snapshotId = null;
    requestedAt = Number.NaN;
    parsed.recall_metadata = undefined;
    await updateSearchParsedRequirements(context.searchId, parsed);
  }

  if (!snapshotId) {
    snapshotId = await triggerDatasetFilter(brightDataToken, recallRequest);
    requestedAt = Date.now();
    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      provider: "brightdata_dataset",
      snapshot_id: snapshotId,
      requested_at: new Date(requestedAt).toISOString(),
      status: "submitted",
      filter_summary: filterSummary,
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: recallRequest.recordsLimit,
      judge_mode: runtime.judgeMode,
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    logSearchEvent("search_step_started", {
      search_id: context.searchId,
      step: "searching",
      provider: "brightdata_dataset",
      execution_profile: executionProfile.name,
      record_limit: recallRequest.recordsLimit,
      snapshot_id: snapshotId,
      filter_summary: filterSummary,
      job_id: context.jobId,
    });
  } else {
    if (!Number.isFinite(requestedAt)) {
      requestedAt = Date.now();
    }
    logSearchEvent("search_step_started", {
      search_id: context.searchId,
      step: "searching",
      provider: "brightdata_dataset",
      execution_profile: executionProfile.name,
      record_limit: recallRequest.recordsLimit,
      snapshot_id: snapshotId,
      resumed: true,
      filter_summary: filterSummary,
      job_id: context.jobId,
    });
  }

  const totalElapsedMs = Math.max(0, Date.now() - requestedAt);
  let remainingTimeoutMs = Math.max(0, BRIGHTDATA_FILTER_TIMEOUT_MS - totalElapsedMs);
  if (remainingTimeoutMs <= 0) {
    // A resumed job may come back after the original wait budget has elapsed even though
    // the remote snapshot finished building in the meantime. In that case, prefer using
    // the ready snapshot instead of failing over to another provider.
    const latestMetadata = await getDatasetSnapshotMetadata(brightDataToken, snapshotId);
    if (latestMetadata.status !== "ready") {
      throw new Error(`Bright Data dataset recall timed out after ${BRIGHTDATA_FILTER_TIMEOUT_MS}ms`);
    }
    remainingTimeoutMs = BRIGHTDATA_FILTER_POLL_INTERVAL_MS;
  }

  const pollWindowMs = Math.min(BRIGHTDATA_FILTER_POLL_WINDOW_MS, remainingTimeoutMs);
  const { metadata, profiles } = await waitForDatasetSnapshot(brightDataToken, snapshotId, {
    timeoutMs: pollWindowMs,
    pollIntervalMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS,
  });

  if (!metadata || !profiles) {
    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      provider: "brightdata_dataset",
      snapshot_id: snapshotId,
      requested_at: new Date(requestedAt).toISOString(),
      status: "polling",
      filter_summary: filterSummary,
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: recallRequest.recordsLimit,
      judge_mode: runtime.judgeMode,
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    throw new DatasetRecallPendingError(
      `Bright Data dataset recall still processing for snapshot ${snapshotId}`,
    );
  }

  if (!profiles.length) {
    logSearchEvent("search_provider_failed", {
      search_id: context.searchId,
      provider: "brightdata_dataset",
      reason: "no_results",
      snapshot_id: snapshotId,
      job_id: context.jobId,
    });
    return null;
  }

  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_metadata = {
    provider: "brightdata_dataset",
    snapshot_id: snapshotId,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    cost: metadata.cost ?? null,
    bright_profile_budget: executionProfile.filterLimit,
    bright_profiles_requested: recallRequest.recordsLimit,
    bright_profiles_returned: profiles.length,
    judge_mode: runtime.judgeMode,
    requested_at: new Date(requestedAt).toISOString(),
    completed_at: nowIso(),
    status: "ready",
    filter_summary: filterSummary,
  };
  await updateSearchParsedRequirements(context.searchId, parsed);

  if (isPhaseTwoRefinement) {
    await setSearchStatus(context.searchId, "deep_scoring", {
      search_completed_at: nowIso(),
    });
  } else {
    await setSearchStatus(context.searchId, "screening", {
      search_completed_at: nowIso(),
    });
  }
  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "searching",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    snapshot_id: snapshotId,
    result_count: profiles.length,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    job_id: context.jobId,
  });

  await setSearchStatus(context.searchId, "deep_scoring");
  logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "deep_scoring",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    deep_scoring_batch_size: DEEP_SCORING_BATCH_SIZE,
    deep_scoring_concurrency: resolveStageConcurrency(
      DEEP_SCORING_CONCURRENCY,
      Math.ceil(profiles.length / DEEP_SCORING_BATCH_SIZE),
    ),
    low_cost_mode: executionProfile.lowCostMode,
    single_judge_mode: executionProfile.singleJudgeMode,
    light_prescreen_max_output_tokens: runtime.lightPrescreenMaxOutputTokens,
    judge_max_output_tokens: runtime.judgeMaxOutputTokens,
    arbiter_max_output_tokens: runtime.arbiterMaxOutputTokens,
    outreach_max_output_tokens: runtime.outreachMaxOutputTokens,
    final_result_cap: executionProfile.finalResultCap,
    job_id: context.jobId,
  });

  const scored = await scoreBrightDataProfiles(
    context,
    parsed,
    profiles,
    profiles.length,
    executionProfile,
  );
  scored.displayStats = buildSearchDisplayStats({
    ...scored.displayStats,
    bright_snapshot_cost: metadata.cost ?? undefined,
    bright_profile_budget: executionProfile.filterLimit,
    bright_profiles_requested: recallRequest.recordsLimit,
    bright_profiles_returned: profiles.length,
    search_phase_count: Number(parsed.search_phase_count) || 1,
    judge_mode: runtime.judgeMode,
  });
  scored.displayStats = mergeCostEstimates(scored.displayStats);

  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "deep_scoring",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    result_count: scored.finalRows.length,
    retrieved_count: profiles.length,
    shortlist_count: scored.displayStats.shortlist_count,
    job_id: context.jobId,
  });

  return scored;
}

// Retained for offline comparison experiments outside the production Bright-only path.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function buildSerperCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
): Promise<SerperBuildResult | null> {
  const serperApiKey = process.env.SERPER_API_KEY;
  if (!serperApiKey) {
    return null;
  }

  const aiClient = createAIClient();
  await setSearchStatus(context.searchId, "searching");
  const searchPlan = buildLinkedInSearchPlan(parsed);
  const sourceRuleContext = buildSerperSourceRuleContext(parsed, context.jdText);
  const tierPlans =
    searchPlan.tiers.length > 0
      ? searchPlan.tiers
      : [{ tier: "P0" as const, queries: searchPlan.queries }];

  logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "searching",
    provider: "serper",
    query_tier_count: tierPlans.length,
    query_concurrency: SERPER_QUERY_CONCURRENCY,
    query_count: searchPlan.queries.length,
    pages_per_query: SERPER_PAGES_PER_QUERY,
    expanded_pages_per_query: SERPER_PAGES_PER_QUERY_EXPANDED,
    results_per_page: SERPER_RESULTS_PER_PAGE,
    source_rule_pass_score: SOURCE_RULE_PASS_SCORE,
    target_scrape_count: TARGET_SCRAPE_COUNT,
    stop_min_gain_ratio: STOP_MIN_GAIN_RATIO,
    job_id: context.jobId,
  });

  const deduped = new Map<string, SerperCandidate>();
  const preScreenedByUrl = new Map<string, SerperPreScreenedCandidate>();
  const tierStats: SerperTierStats[] = [];

  let sourceRuleEvaluatedCount = 0;
  let sourceRulePassCount = 0;
  let llmPrescreenEvaluatedCount = 0;
  let llmPrescreenPassCount = 0;
  let stopReason: string | null = null;

  for (const tierPlan of tierPlans) {
    const pagesForTier =
      tierPlan.tier === "P3"
        ? Math.max(SERPER_PAGES_PER_QUERY, SERPER_PAGES_PER_QUERY_EXPANDED)
        : SERPER_PAGES_PER_QUERY;
    const queryTasks: Array<{ query: string; page: number }> = [];
    for (const query of tierPlan.queries) {
      for (let page = 1; page <= pagesForTier; page++) {
        queryTasks.push({ query, page });
      }
    }
    if (queryTasks.length === 0) continue;

    const tierConcurrency = Math.min(SERPER_QUERY_CONCURRENCY, queryTasks.length);
    const searchResults = await runWithConcurrency(
      queryTasks,
      tierConcurrency,
      async ({ query, page }) => {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const results = await withTimeout(
              serperSearch(serperApiKey, query, SERPER_RESULTS_PER_PAGE, page),
              25000,
              `Serper query "${query}" page ${page}`,
            );
            return parseSearchResults(results);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const retryable =
              attempt < maxAttempts &&
              (
                message.includes("fetch failed") ||
                message.includes("timed out") ||
                message.includes("429")
              );
            logSearchEvent("search_serper_query_attempt_failed", {
              search_id: context.searchId,
              tier: tierPlan.tier,
              query,
              page,
              attempt,
              retryable,
              error: message,
              job_id: context.jobId,
            });
            if (!retryable) break;
            await sleep(Math.min(4000, 400 * 2 ** (attempt - 1)));
          }
        }

        logSearchEvent("search_serper_query_skipped", {
          search_id: context.searchId,
          tier: tierPlan.tier,
          query,
          page,
          job_id: context.jobId,
        });
        return [] as SerperCandidate[];
      },
    );

    let rawResultCount = 0;
    let duplicateCount = 0;
    const newTierCandidates: SerperCandidate[] = [];
    let retrievalCapReached = false;

    for (const batch of searchResults) {
      rawResultCount += batch.length;
      for (const candidate of batch) {
        if (deduped.size >= TARGET_SCRAPE_COUNT) {
          retrievalCapReached = true;
          break;
        }
        const key = candidate.linkedin_url.toLowerCase();
        if (deduped.has(key)) {
          duplicateCount += 1;
          continue;
        }
        deduped.set(key, candidate);
        newTierCandidates.push(candidate);
      }
      if (retrievalCapReached) break;
    }

    const sourceRuleEvaluations = newTierCandidates.map((candidate) => ({
      candidate,
      sourceRule: evaluateSerperSourceRules(candidate, sourceRuleContext),
    }));
    sourceRuleEvaluatedCount += sourceRuleEvaluations.length;

    const sourceRuleEligible = sourceRuleEvaluations.filter(
      ({ sourceRule }) => !sourceRule.hard_reject,
    );
    const sourceRulePassed = sourceRuleEligible.filter(
      ({ sourceRule }) => sourceRule.score >= SOURCE_RULE_PASS_SCORE,
    );
    sourceRulePassCount += sourceRulePassed.length;

    // Keep source rules as quality diagnostics; light-screening still evaluates all
    // retrieved candidates so ranking can happen over the full source pool.
    const sourceRulePassedCandidates = newTierCandidates;
    const tierPreScreened = await preScreenAllCandidates(
      aiClient,
      parsed,
      context.jdText,
      sourceRulePassedCandidates,
    );
    llmPrescreenEvaluatedCount += tierPreScreened.length;

    const tierLlmPass = tierPreScreened.filter(
      (item) => item.preScreen.keep,
    );
    llmPrescreenPassCount += tierLlmPass.length;

    for (const item of tierPreScreened) {
      const key = item.serperCandidate.linkedin_url.toLowerCase();
      const existing = preScreenedByUrl.get(key);
      if (!existing || item.preScreen.match_score > existing.preScreen.match_score) {
        preScreenedByUrl.set(key, item);
      }
    }

    const tierStopReason = shouldStopSerperTierExpansion(
      deduped.size,
      newTierCandidates.length,
    )
      ? `retrieval_target_reached(unique_count=${deduped.size}, gain_ratio=${deduped.size <= 0 ? 0 : (newTierCandidates.length / deduped.size).toFixed(4)})`
      : retrievalCapReached
        ? `retrieval_cap_reached(unique_count=${deduped.size}, cap=${TARGET_SCRAPE_COUNT})`
        : null;

    const tierStat: SerperTierStats = {
      tier: tierPlan.tier,
      query_count: tierPlan.queries.length,
      request_count: queryTasks.length,
      raw_result_count: rawResultCount,
      unique_count: deduped.size,
      new_unique_count: newTierCandidates.length,
      duplicate_ratio: rawResultCount > 0 ? duplicateCount / rawResultCount : 0,
      source_rule_pass_count: sourceRulePassed.length,
      source_rule_pass_rate:
        sourceRuleEvaluations.length > 0
          ? sourceRulePassed.length / sourceRuleEvaluations.length
          : 0,
      llm_prescreen_pass_count: tierLlmPass.length,
      llm_prescreen_pass_rate:
        tierPreScreened.length > 0 ? tierLlmPass.length / tierPreScreened.length : 0,
      stop_reason: tierStopReason,
    };
    tierStats.push(tierStat);

    logSearchEvent("search_step_completed", {
      search_id: context.searchId,
      step: "searching",
      provider: "serper",
      tier: tierPlan.tier,
      query_count: tierPlan.queries.length,
      request_count: queryTasks.length,
      new_unique_count: tierStat.new_unique_count,
      source_rule_pass_count: tierStat.source_rule_pass_count,
      duplicate_ratio: Number(tierStat.duplicate_ratio.toFixed(4)),
      llm_prescreen_pass_count: tierStat.llm_prescreen_pass_count,
      stop_reason: tierStopReason,
      cumulative_unique_count: deduped.size,
      cumulative_light_keep_count: llmPrescreenPassCount,
      job_id: context.jobId,
    });

    if (tierStopReason) {
      stopReason = tierStopReason;
      break;
    }
  }

  const allCandidates = Array.from(deduped.values());

  if (!allCandidates.length) {
    logSearchEvent("search_provider_failed", {
      search_id: context.searchId,
      provider: "serper",
      reason: "no_results",
      job_id: context.jobId,
    });
    return null;
  }

  await setSearchStatus(context.searchId, "screening");
  const sourceRulePassRate =
    sourceRuleEvaluatedCount > 0 ? sourceRulePassCount / sourceRuleEvaluatedCount : 0;
  const llmPreScreenPassRate =
    llmPrescreenEvaluatedCount > 0 ? llmPrescreenPassCount / llmPrescreenEvaluatedCount : 0;
  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "searching",
    provider: "serper",
    result_count: allCandidates.length,
    tier_count: tierStats.length,
    serper_query_tier_stats: tierStats,
    source_rule_pass_rate: Number(sourceRulePassRate.toFixed(4)),
    llm_prescreen_pass_rate: Number(llmPreScreenPassRate.toFixed(4)),
    stop_reason: stopReason,
    query_count: searchPlan.queries.length,
    job_id: context.jobId,
  });

  const preScreened = Array.from(preScreenedByUrl.values()).sort(
    (a, b) => b.preScreen.match_score - a.preScreen.match_score,
  );
  if (!preScreened.length) {
    return null;
  }

  const lightSelection = selectTopLightCandidates(preScreened);
  const lightPassed = lightSelection.selected;
  const preScreenKeptCount = preScreened.filter((candidate) => candidate.preScreen.keep).length;
  const scrapeCandidates = lightPassed;
  const fallbackSeed =
    lightPassed.length > 0
      ? lightPassed
      : preScreened;
  const fallbackRows = buildSerperCandidateRows(
    fallbackSeed,
    Math.max(context.candidateCount, FINAL_RESULT_CAP),
  );

  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "screening",
    provider: "serper",
    tier: tierStats.length > 0 ? tierStats[tierStats.length - 1]?.tier : "P0",
    retrieval_count: allCandidates.length,
    source_rule_pass_count: sourceRulePassCount,
    source_rule_pass_rate: Number(sourceRulePassRate.toFixed(4)),
    pre_screen_evaluated_count: preScreened.length,
    pre_screen_kept_count: preScreenKeptCount,
    llm_prescreen_pass_rate: Number(llmPreScreenPassRate.toFixed(4)),
    light_selected_count: lightPassed.length,
    light_selected_rate: Number(lightSelection.selectedRate.toFixed(4)),
    light_selection_mode: "top_fixed",
    light_selection_target: lightSelection.target,
    light_selection_cutoff_score: lightSelection.cutoffScore,
    light_total_evaluated_count: preScreened.length,
    target_scrape_count: TARGET_SCRAPE_COUNT,
    scrape_count: scrapeCandidates.length,
    stop_reason: stopReason,
    job_id: context.jobId,
  });

  return {
    preScreened: scrapeCandidates,
    fallbackRows,
    retrievalCount: allCandidates.length,
    tierStats,
    sourceRulePassRate,
    llmPreScreenPassRate,
    stopReason,
  };
}

async function judgeScoreBatch(
  aiClient: ReturnType<typeof createAIClient>,
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  batchIndexes: number[],
  totalPoolSize: number,
  judgeLabel: "Judge A" | "Judge B",
): Promise<JudgeScoreResult[]> {
  const profilesText = batchIndexes
    .map((idx) => truncateForPrompt(profileTexts[idx], 2800))
    .join("\n\n");
  const prompt = buildJudgeScorePrompt(
    parsed,
    jdText,
    profilesText,
    batchIndexes.length,
    judgeLabel,
  );
  const judgeModel = getJudgeModel();
  const maxAttempts = runtime.judgeMaxAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { text } = await withTimeout(
        generateText({
          model: aiClient(judgeModel),
          prompt,
          maxOutputTokens: runtime.judgeMaxOutputTokens,
        }),
        JUDGE_SCORING_TIMEOUT_MS,
        `${judgeLabel} scoring (attempt ${attempt})`,
      );

      let judgeResult;
      try {
        const extracted = extractJSON(text);
        judgeResult = JSON.parse(extracted);
      } catch (error) {
        console.error(`[search:judge_json_parse_error] Failed to parse JSON from ${judgeLabel}:`, {
          attempt,
          error: error instanceof Error ? error.message : String(error),
          raw_text: text.substring(0, 500),
          extracted_attempt: (() => {
            try {
              return extractJSON(text).substring(0, 500);
            } catch {
              return null;
            }
          })(),
        });
        throw new Error(`${judgeLabel} returned invalid JSON`);
      }

      const parsed = parseJudgeScoreResults(
        judgeResult,
        totalPoolSize,
        batchIndexes,
      ).filter((assessment) => batchIndexes.includes(assessment.index));

      if (parsed.length > 0) return parsed;
      throw new Error(`${judgeLabel} returned no valid scores`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = attempt < maxAttempts && (
        message.includes("invalid JSON") ||
        message.includes("timed out") ||
        message.includes("429")
      );
      lastError = error instanceof Error ? error : new Error(message);

      logSearchEvent("judge_scoring_attempt_failed", {
        judge: judgeLabel,
        attempt,
        retrying: shouldRetry,
        error: message,
      });

      if (!shouldRetry) break;
      await sleep(300 * attempt);
    }
  }

  throw lastError || new Error(`${judgeLabel} scoring failed`);
}

async function arbitrateCandidateScore(
  aiClient: ReturnType<typeof createAIClient>,
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileText: string,
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  totalPoolSize: number,
): Promise<ScoredCandidateAssessment | null> {
  const prompt = buildArbiterPrompt(
    parsed,
    jdText,
    truncateForPrompt(profileText, 3000),
    judgeA,
    judgeB,
  );
  const maxAttempts = runtime.arbiterMaxAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { text } = await withTimeout(
        generateText({
          model: aiClient(getArbiterModel()),
          prompt,
          maxOutputTokens: runtime.arbiterMaxOutputTokens,
        }),
        ARBITER_SCORING_TIMEOUT_MS,
        `Arbiter scoring (attempt ${attempt})`,
      );

      const assessment = parseScoredAssessments(
        JSON.parse(extractJSON(text)),
        totalPoolSize,
      )[0];
      if (!assessment) {
        throw new Error("Arbiter returned no valid assessment");
      }
      return {
        ...assessment,
        scoring_method: "dual_review_arbitrated",
        judge_delta: Math.max(
          Math.abs(judgeA.capability_score - judgeB.capability_score),
          Math.abs(judgeA.relevance_score - judgeB.relevance_score),
          Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
        ),
        judge_conflict: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = attempt < maxAttempts && (
        message.includes("timed out") ||
        message.includes("invalid JSON") ||
        message.includes("Expected")
      );
      lastError = error instanceof Error ? error : new Error(message);
      logSearchEvent("arbiter_attempt_failed", {
        attempt,
        retrying: shouldRetry,
        error: message,
      });
      if (!shouldRetry) break;
      await sleep(400 * attempt);
    }
  }

  throw lastError || new Error("Arbiter scoring failed");
}

async function deepScoreSelectedProfiles(
  aiClient: ReturnType<typeof createAIClient>,
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndexes: number[],
  totalPoolSize: number,
): Promise<ScoredCandidateAssessment[]> {
  if (!selectedIndexes.length) return [];

  // Each candidate spawns two judge calls and occasionally an arbiter call.
  // Hard cap concurrency to avoid judge/arbiter API saturation.
  const workerCount = Math.min(DEEP_REVIEW_CONCURRENCY, selectedIndexes.length);
  const assessments = await runWithConcurrency(
    selectedIndexes,
    workerCount,
    async (selectedIndex) => {
      if (runtime.judgeMode === "single") {
        try {
          const judgeResults = await judgeScoreBatch(
            aiClient,
            runtime,
            parsed,
            jdText,
            profileTexts,
            [selectedIndex],
            totalPoolSize,
            "Judge A",
          );
          const judge = judgeResults[0];
          if (!judge) return null;
          return {
            ...mergeJudgeResults(judge, judge),
            scoring_method: "single_judge_debug",
            judge_delta: 0,
            judge_conflict: false,
          };
        } catch (error) {
          logSearchEvent("single_judge_scoring_failed", {
            index: selectedIndex,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }

      const judgeBatch = [selectedIndex];
      const [judgeAResults, judgeBResults] = await Promise.allSettled([
        judgeScoreBatch(aiClient, runtime, parsed, jdText, profileTexts, judgeBatch, totalPoolSize, "Judge A"),
        judgeScoreBatch(aiClient, runtime, parsed, jdText, profileTexts, judgeBatch, totalPoolSize, "Judge B"),
      ]);

      const judgeA = judgeAResults.status === "fulfilled" ? judgeAResults.value[0] : null;
      const judgeB = judgeBResults.status === "fulfilled" ? judgeBResults.value[0] : null;

      if (judgeAResults.status === "rejected" || judgeBResults.status === "rejected") {
        logSearchEvent("dual_review_judge_failure", {
          index: selectedIndex,
          judge_a_error:
            judgeAResults.status === "rejected"
              ? judgeAResults.reason instanceof Error
                ? judgeAResults.reason.message
                : String(judgeAResults.reason)
              : null,
          judge_b_error:
            judgeBResults.status === "rejected"
              ? judgeBResults.reason instanceof Error
                ? judgeBResults.reason.message
                : String(judgeBResults.reason)
              : null,
        });
      }

      if (!judgeA && !judgeB) return null;
      if (judgeA && !judgeB) {
        return {
          ...mergeJudgeResults(judgeA, judgeA),
          judge_delta: 0,
        };
      }
      if (judgeB && !judgeA) {
        return {
          ...mergeJudgeResults(judgeB, judgeB),
          judge_delta: 0,
        };
      }

      if (!judgeA || !judgeB) return null;
      if (!hasJudgeConflict(judgeA, judgeB)) {
        return {
          ...mergeJudgeResults(judgeA, judgeB),
          judge_conflict: false,
        };
      }

      try {
        const arbitrated = await arbitrateCandidateScore(
          aiClient,
          runtime,
          parsed,
          jdText,
          profileTexts[selectedIndex],
          judgeA,
          judgeB,
          totalPoolSize,
        );
        return arbitrated;
      } catch (error) {
        logSearchEvent("dual_review_arbiter_failure", {
          index: selectedIndex,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ...mergeJudgeResults(judgeA, judgeB),
          scoring_method: "dual_review_auto",
          judge_delta: Math.max(
            Math.abs(judgeA.capability_score - judgeB.capability_score),
            Math.abs(judgeA.relevance_score - judgeB.relevance_score),
            Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
          ),
          judge_conflict: true,
        };
      }
    },
  );

  return assessments
    .filter((assessment): assessment is ScoredCandidateAssessment => Boolean(assessment))
    .sort(sortCandidateAssessments);
}

async function scoreBrightDataProfiles(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  brightProfiles: BrightDataProfile[],
  retrievalCount: number,
  executionProfile: SearchExecutionProfile,
): Promise<SearchPipelineResult> {
  const aiClient = createAIClient();
  const runtime = getExecutionRuntime(executionProfile);
  const renderProfileEntries = brightProfiles.map((profile, index) =>
    brightDataProfileToRichText(profile, index),
  );

  // LLM 预筛：过滤掉明显不可能入职的人，再进入双 Judge 深评
  const lightModel = getHaikuModel();
  const prescreenResults = await runWithConcurrency(
    brightProfiles.map((profile, index) => ({ profile, index })),
    resolveStageConcurrency(PRE_SCREEN_CONCURRENCY, brightProfiles.length),
    async ({ index }) => {
      const profileText = renderProfileEntries[index];
      const prompt = `You are doing a first-pass screen for a hiring pipeline.

## Search Intent
${buildPromptSearchContext(parsed)}

## Candidate Profile
${profileText}

## Task
Decide if this candidate is worth deep review. Return ONLY valid JSON:
{"keep": true, "match_score": 0, "reason": "one short sentence"}

Rules:
- keep=false for: wrong industry (e.g. nuclear/medical/finance engineer for a software role), clearly wrong location for strict onsite, obvious seniority mismatch (e.g. C-suite for IC role).
- keep=true if there is reasonable evidence of fit.
- match_score 0-100 for ranking.
- A deterministic location gate also runs; focus on role/industry/seniority fit here.
- Keep reason under 20 words. Raw JSON only.`;

      try {
        const { text } = await withTimeout(
          generateText({
            model: aiClient(lightModel),
            prompt,
            maxOutputTokens: runtime.lightPrescreenMaxOutputTokens,
          }),
          15000,
          "Bright profile pre-screen",
        );
        const decision = sanitizeSerperPreScreenDecision(JSON.parse(extractJSON(text)));
        return { index, keep: decision?.keep ?? true, score: decision?.match_score ?? 50 };
      } catch {
        return { index, keep: true, score: 50 }; // 失败时保守保留
      }
    },
  );

  const keptIndexes = prescreenResults
    .filter(r => r.keep)
    .sort((a, b) => b.score - a.score)
    .map(r => r.index);

  const prescreenBlockedCount = brightProfiles.length - keptIndexes.length;
  if (prescreenBlockedCount > 0) {
    logSearchEvent("search_location_gate_applied", {
      stage: "bright_prescreen",
      blocked_count: prescreenBlockedCount,
      total_count: brightProfiles.length,
    });
  }

  const selectedIndexes = keptIndexes.length > 0
    ? keptIndexes
    : Array.from({ length: brightProfiles.length }, (_, i) => i); // 全挂时兜底

  const deepAssessments = await deepScoreSelectedProfiles(
    aiClient,
    runtime,
    parsed,
    context.jdText,
    renderProfileEntries,
    selectedIndexes,
    brightProfiles.length,
  );

  // 应用 deterministic location gate 到 deep scoring 结果
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const locationPolicy = normalizeLocationConstraint(hiringBrief);

  const assessmentsWithGate = deepAssessments.map(assessment => {
    const profile = brightProfiles[assessment.index];
    const evidence = extractCandidateLocationEvidence(
      profile.city,
      profile.country_code,
      profile.headline,
      profile.about,
    );
    const gateResult = evaluateCandidateLocationGate(locationPolicy, evidence);

    // 如果是 hard block，强制覆盖 suitability
    const finalSuitability = applyLocationGateToSuitability(
      assessment.suitability,
      gateResult,
    );

    return {
      ...assessment,
      suitability: finalSuitability,
    };
  });

  if (DEEP_REVIEW_DEBUG_LOGS) {
    logSearchEvent("deep_review_distribution", {
      search_id: context.searchId,
      requested_count: selectedIndexes.length,
      completed_count: assessmentsWithGate.length,
      selected_indexes: selectedIndexes,
      scores: assessmentsWithGate.map((assessment) => ({
        index: assessment.index,
        match_score: assessment.suitability.match_score,
        quality_score: assessment.suitability.quality_score,
        advance_score: assessment.suitability.advance_score,
        capability_score: assessment.suitability.scoring_breakdown.capability_score,
        relevance_score: assessment.suitability.scoring_breakdown.relevance_score,
        join_likelihood_score: assessment.suitability.scoring_breakdown.join_likelihood_score,
        fit_decision: assessment.suitability.fit_decision,
        actionability: assessment.suitability.actionability,
        advance_recommendation: assessment.suitability.advance_recommendation,
        blocking_severity: assessment.suitability.blocking_severity,
        blocking_constraints: assessment.suitability.blocking_constraints,
      })),
    });
  }
  const fullDetailIncomplete = assessmentsWithGate.length < selectedIndexes.length;
  const hardBlockedCount = assessmentsWithGate.filter(
    (assessment) => assessment.suitability.blocking_severity === "hard",
  ).length;
  const softBlockedCount = assessmentsWithGate.filter(
    (assessment) => assessment.suitability.blocking_severity === "soft",
  ).length;
  const advanceableCount = assessmentsWithGate.filter(
    (assessment) => assessment.suitability.advance_recommendation === "advance",
  ).length;
  const deepSelection = selectTopDeepAssessments(
    assessmentsWithGate,
    executionProfile.finalResultCap,
  );
  const deepSelected = deepSelection.selected;
  const deepRows = buildBrightDataCandidateRows(
    brightProfiles,
    deepSelected,
    deepSelected.length,
    "outreach_pool",
  );

  const finalTargetCount = executionProfile.finalResultCap;
  const highlightTarget = Math.min(context.highlightCount, finalTargetCount);
  const finalRows = tagPoolRows(
    deepRows,
    [],
    highlightTarget,
    finalTargetCount,
  );
  const shortlistedCount = finalRows.filter(
    (row) => row.metadata?.pool_type === "top_pick",
  ).length;
  const topQualityScore = deepAssessments.reduce(
    (best, assessment) => Math.max(best, assessment.suitability.quality_score),
    0,
  );
  const top50QualityCutoff =
    finalRows.length > 0
      ? finalRows[finalRows.length - 1]?.match_score ?? 0
      : 0;

  let warningMessage: string | null = null;
  if (finalRows.length === 0) {
    warningMessage = "No candidates were ranked into the final result set.";
  } else if (fullDetailIncomplete) {
    warningMessage = "Some deep reviews timed out, and only completed deep scores were ranked.";
  } else if (shortlistedCount < highlightTarget) {
    warningMessage = `Only ${shortlistedCount} highlighted candidate${shortlistedCount === 1 ? "" : "s"} are available in the final ranking.`;
  }
  const estimatedCosts = estimateBrightPipelineLlmCost({
    context,
    parsed,
    renderProfileEntries,
    selectedCount: selectedIndexes.length,
    finalRows,
    runtime,
  });

  return {
    finalRows,
    warningMessage,
    displayStats: buildSearchDisplayStats({
      retrieval_count: retrievalCount,
      deep_review_requested_count: selectedIndexes.length,
      deep_review_completed_count: deepAssessments.length,
      qualified_count: finalRows.length,
      outreach_pool_count: finalRows.length,
      shortlist_count: finalRows.length,
      brightdata_scrape_count: brightProfiles.length,
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: executionProfile.filterLimit,
      bright_profiles_returned: brightProfiles.length,
      estimated_llm_cost: estimatedCosts.estimatedLlmCost,
      estimated_search_total_cost: estimatedCosts.estimatedSearchTotalCost,
      search_phase_count: Number(parsed.search_phase_count) || 1,
      judge_mode: runtime.judgeMode,
      deep_qualified_rate:
        deepAssessments.length > 0
          ? deepSelected.length / deepAssessments.length
          : 0,
      hard_blocked_count: hardBlockedCount,
      soft_blocked_count: softBlockedCount,
      advanceable_count: advanceableCount,
      top_quality_score: topQualityScore,
      top50_quality_cutoff: top50QualityCutoff,
    }),
  };
}

// Retained for offline comparison experiments outside the production Bright-only path.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function refineSerperCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  preScreened: SerperPreScreenedCandidate[],
  fallbackRows: CandidateRowInput[],
  retrievalCount: number,
  serperStats: Pick<
    SerperBuildResult,
    "tierStats" | "sourceRulePassRate" | "llmPreScreenPassRate"
  >,
) {
  const brightDataToken = process.env.BRIGHTDATA_API_TOKEN;
  const brightDataDatasetId = process.env.BRIGHTDATA_DATASET_ID;
  const urlsToScrape = preScreened.map((candidate) => candidate.serperCandidate.linkedin_url);

  if (!brightDataToken || !brightDataDatasetId) {
    return {
      finalRows: fallbackRows,
      warningMessage: null,
      displayStats: buildSearchDisplayStats({
        retrieval_count: retrievalCount,
        deep_review_requested_count: 0,
        deep_review_completed_count: 0,
        qualified_count: fallbackRows.length,
        outreach_pool_count: fallbackRows.length,
        shortlist_count: fallbackRows.length,
        serper_query_tier_stats: serperStats.tierStats,
        source_rule_pass_rate: serperStats.sourceRulePassRate,
        llm_prescreen_pass_rate: serperStats.llmPreScreenPassRate,
        brightdata_scrape_count: 0,
        deep_qualified_rate: 0,
      }),
    };
  }

  await setSearchStatus(context.searchId, "deep_scoring");
  const brightDataBatchCount = Math.ceil(preScreened.length / BRIGHTDATA_BATCH_SIZE);
  const scrapeBatchConcurrency = Math.min(BRIGHTDATA_BATCH_CONCURRENCY, brightDataBatchCount);
  const deepScoringBatchCount = Math.ceil(preScreened.length / DEEP_SCORING_BATCH_SIZE);
  const deepScoringConcurrency = Math.min(DEEP_SCORING_CONCURRENCY, deepScoringBatchCount);
  const deepReviewConcurrency = Math.min(DEEP_REVIEW_CONCURRENCY, urlsToScrape.length);

  logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "deep_scoring",
    provider: "brightdata",
    batch_size: BRIGHTDATA_BATCH_SIZE,
    batch_concurrency: scrapeBatchConcurrency,
    deep_scoring_batch_size: DEEP_SCORING_BATCH_SIZE,
    deep_scoring_concurrency: deepScoringConcurrency,
    deep_review_concurrency: deepReviewConcurrency,
    low_cost_mode: SEARCH_LOW_COST_MODE,
    single_judge_mode: SEARCH_SINGLE_JUDGE_MODE,
    parse_max_output_tokens: PARSE_MAX_OUTPUT_TOKENS,
    light_prescreen_max_output_tokens: LIGHT_PRESCREEN_MAX_OUTPUT_TOKENS,
    judge_max_output_tokens: JUDGE_MAX_OUTPUT_TOKENS,
    arbiter_max_output_tokens: ARBITER_MAX_OUTPUT_TOKENS,
    outreach_max_output_tokens: OUTREACH_MAX_OUTPUT_TOKENS,
    scrape_request_count: urlsToScrape.length,
    final_result_cap: FINAL_RESULT_CAP,
    light_stage_target_count: PRE_SCREEN_TARGET,
    deep_stage_target_count: FINAL_RESULT_CAP,
    job_id: context.jobId,
  });

  try {
    const brightProfiles = await scrapeLinkedInProfiles(
      brightDataToken,
      brightDataDatasetId,
      urlsToScrape,
      {
        batchSize: BRIGHTDATA_BATCH_SIZE,
        concurrency: scrapeBatchConcurrency,
        maxAttempts: BRIGHTDATA_SCRAPE_MAX_ATTEMPTS,
        intervalMs: BRIGHTDATA_SCRAPE_INTERVAL_MS,
        allowPartial: true,
      },
    );
    if (!brightProfiles.length) {
      throw new Error("Bright Data returned no profiles");
    }

    const scored = await scoreBrightDataProfiles(
      context,
      parsed,
      brightProfiles,
      retrievalCount,
      getSearchExecutionProfile("bright_full_pro"),
    );
    scored.displayStats = buildSearchDisplayStats({
      ...scored.displayStats,
      serper_query_tier_stats: serperStats.tierStats,
      source_rule_pass_rate: serperStats.sourceRulePassRate,
      llm_prescreen_pass_rate: serperStats.llmPreScreenPassRate,
      brightdata_scrape_count: brightProfiles.length,
    });

    logSearchEvent("search_step_completed", {
      search_id: context.searchId,
      step: "deep_scoring",
      provider: "brightdata",
      result_count: scored.finalRows.length,
      scraped_count: brightProfiles.length,
      shortlist_count: scored.displayStats.shortlist_count,
      deep_review_requested_count: scored.displayStats.deep_review_requested_count,
      deep_review_completed_count: scored.displayStats.deep_review_completed_count,
      final_result_cap: FINAL_RESULT_CAP,
      job_id: context.jobId,
    });

    return scored;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deep scoring failed";
    logSearchEvent("search_degraded", {
      search_id: context.searchId,
      provider: "brightdata",
      reason: message,
      job_id: context.jobId,
    });
    return {
      finalRows: fallbackRows,
      warningMessage:
        "Advanced profile enrichment did not finish, but your shortlist is ready to review.",
      displayStats: buildSearchDisplayStats({
        retrieval_count: retrievalCount,
        deep_review_requested_count: urlsToScrape.length,
        deep_review_completed_count: 0,
        qualified_count: fallbackRows.length,
        outreach_pool_count: fallbackRows.length,
        shortlist_count: fallbackRows.length,
        serper_query_tier_stats: serperStats.tierStats,
        source_rule_pass_rate: serperStats.sourceRulePassRate,
        llm_prescreen_pass_rate: serperStats.llmPreScreenPassRate,
        brightdata_scrape_count: 0,
        deep_qualified_rate: 0,
      }),
    };
  }
}

async function completeSearch(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  finalRows: CandidateRowInput[],
  displayStats: SearchDisplayStats,
  warningMessage?: string | null,
  options?: { generateOutreachDrafts?: boolean; runtime?: SearchExecutionRuntime },
) {
  const draftedRows =
    finalRows.length > 0 && options?.generateOutreachDrafts !== false
      ? await generateOutreachDraftsForRows(
        context,
        options?.runtime ?? getExecutionRuntime(getSearchExecutionProfile("bright_full_pro")),
        parsed,
        finalRows,
      )
      : finalRows;

  if (draftedRows.length > 0) {
    await upsertCandidatesForSearch(context.searchId, draftedRows, {
      replaceMissing: true,
    });
  }

  const finalParsed = withDisplayStats(parsed, displayStats);
  const createdAtMs = context.createdAt ? Date.parse(context.createdAt) : Number.NaN;
  const finalReadyLatencyMs = Number.isFinite(createdAtMs)
    ? Math.max(0, Date.now() - createdAtMs)
    : null;
  await setSearchStatus(context.searchId, warningMessage ? "degraded" : "done", {
    done_at: nowIso(),
    error_message: null,
    warning_message: warningMessage ?? null,
    parsed_requirements: finalParsed,
  });

  await updateSearchUsageEventMetadata(context.searchId, {
    execution_profile: finalParsed.execution_profile ?? null,
    search_phase: finalParsed.search_phase ?? null,
    result_stage: finalParsed.result_stage ?? null,
    search_phase_count: displayStats.search_phase_count ?? finalParsed.search_phase_count ?? 1,
    bright_profile_budget: displayStats.bright_profile_budget ?? null,
    bright_profiles_requested: displayStats.bright_profiles_requested ?? null,
    bright_profiles_returned: displayStats.bright_profiles_returned ?? null,
    bright_snapshot_cost: displayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: displayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: displayStats.estimated_search_total_cost ?? null,
    final_ready_latency_ms: finalReadyLatencyMs,
    judge_mode: displayStats.judge_mode ?? finalParsed.judge_mode ?? null,
  });

  logSearchEvent(warningMessage ? "search_degraded" : "search_done", {
    search_id: context.searchId,
    candidate_count: draftedRows.length,
    warning_message: warningMessage ?? null,
    final_ready_latency_ms: finalReadyLatencyMs,
    bright_snapshot_cost: displayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: displayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: displayStats.estimated_search_total_cost ?? null,
    job_id: context.jobId,
  });
}

async function persistProvisionalSearch(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  finalRows: CandidateRowInput[],
  displayStats: SearchDisplayStats,
) {
  if (finalRows.length > 0) {
    await upsertCandidatesForSearch(context.searchId, finalRows, {
      replaceMissing: true,
    });
  }

  const provisionalParsed = withDisplayStats(parsed, displayStats);
  const createdAtMs = context.createdAt ? Date.parse(context.createdAt) : Number.NaN;
  const provisionalReadyLatencyMs = Number.isFinite(createdAtMs)
    ? Math.max(0, Date.now() - createdAtMs)
    : null;
  await setSearchStatus(context.searchId, "deep_scoring", {
    partial_ready_at: nowIso(),
    error_message: null,
    warning_message: null,
    parsed_requirements: provisionalParsed,
  });

  await updateSearchUsageEventMetadata(context.searchId, {
    execution_profile: provisionalParsed.execution_profile ?? null,
    search_phase: provisionalParsed.search_phase ?? null,
    result_stage: provisionalParsed.result_stage ?? null,
    search_phase_count: displayStats.search_phase_count ?? provisionalParsed.search_phase_count ?? 1,
    bright_profile_budget: displayStats.bright_profile_budget ?? null,
    bright_profiles_requested: displayStats.bright_profiles_requested ?? null,
    bright_profiles_returned: displayStats.bright_profiles_returned ?? null,
    bright_snapshot_cost: displayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: displayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: displayStats.estimated_search_total_cost ?? null,
    provisional_ready_latency_ms: provisionalReadyLatencyMs,
    judge_mode: displayStats.judge_mode ?? provisionalParsed.judge_mode ?? null,
  });

  logSearchEvent("search_provisional_ready", {
    search_id: context.searchId,
    candidate_count: finalRows.length,
    execution_profile: provisionalParsed.execution_profile ?? null,
    search_phase: provisionalParsed.search_phase ?? null,
    provisional_ready_latency_ms: provisionalReadyLatencyMs,
    bright_snapshot_cost: displayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: displayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: displayStats.estimated_search_total_cost ?? null,
    job_id: context.jobId,
  });
}

async function markSearchDegraded(searchId: string, warningMessage: string) {
  await setSearchStatus(searchId, "degraded", {
    done_at: nowIso(),
    warning_message: warningMessage,
    error_message: null,
  });
}

async function failSearch(searchId: string, message: string) {
  await setSearchStatus(searchId, "error", {
    error_message: message,
    warning_message: null,
  });
}

async function runSearchPipeline(job: SearchJobRow) {
  const { data: search } = await supabaseAdmin
    .from("hirelix_searches")
    .select("id, user_id, jd_text, parsed_requirements, status, parse_completed_at, created_at")
    .eq("id", job.search_id)
    .single();

  if (!search) {
    throw new Error("Search not found");
  }

  const existingParsed =
    (search as SearchRow).parsed_requirements &&
    typeof (search as SearchRow).parsed_requirements === "object"
      ? ((search as SearchRow).parsed_requirements as Record<string, unknown>)
      : null;
  let planCode = normalizeSearchPlanCode(existingParsed?.plan_code);
  if (!existingParsed?.plan_code) {
    const billing = await getBillingSummaryForUser(supabaseAdmin, job.user_id);
    planCode = normalizeSearchPlanCode(billing.plan.code);
  }
  const initialExecutionProfile = getInitialSearchExecutionProfile(planCode);

  const context: PipelineContext = {
    searchId: job.search_id,
    jobId: job.id,
    userId: job.user_id,
    jdText: job.jd_text || (search as SearchRow).jd_text,
    createdAt:
      typeof (search as SearchRow & { created_at?: string | null }).created_at === "string"
        ? (search as SearchRow & { created_at?: string | null }).created_at ?? null
        : null,
    planCode,
    candidateCount: job.candidate_count || Number((search as SearchRow).parsed_requirements?.candidate_count) || 5,
    highlightCount:
      Number((search as SearchRow).parsed_requirements?.highlight_count) ||
      HIGHLIGHT_CANDIDATE_COUNT,
    outreachPoolTarget:
      Number((search as SearchRow).parsed_requirements?.outreach_pool_target) ||
      OUTREACH_POOL_TARGET,
  };

  const parsed = canReuseParsedRequirements(search as SearchRow)
    ? {
      ...((search as SearchRow).parsed_requirements || {}),
      candidate_count: context.candidateCount,
      display_count:
        Number((search as SearchRow).parsed_requirements?.display_count) ||
        initialExecutionProfile.finalResultCap,
      highlight_count:
        Number((search as SearchRow).parsed_requirements?.highlight_count) ||
        context.highlightCount,
      outreach_pool_target:
        Number((search as SearchRow).parsed_requirements?.outreach_pool_target) ||
        context.outreachPoolTarget,
      plan_code: planCode,
      recall_provider: "brightdata_dataset",
      recall_spec: normalizeRecallSpec(
        (search as SearchRow).parsed_requirements?.recall_spec,
        context.candidateCount,
      ),
    }
    : await parseJobDescription(context, (search as SearchRow).parsed_requirements);

  let activePhase = normalizeSearchPhase(parsed.search_phase);
  if (activePhase === "phase_1") {
    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_spec = normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
      recordLimitOverride: initialExecutionProfile.filterLimit,
    });
    const phase1Parsed = withExecutionState(parsed, initialExecutionProfile, {
      planCode,
      searchPhase: "phase_1",
      resultStage: isProPlanCode(planCode) ? "provisional" : "final",
      searchPhaseCount: 1,
      displayCount: initialExecutionProfile.finalResultCap,
    });

    const phase1Result = await buildBrightDataDatasetCandidates(
      context,
      phase1Parsed,
      initialExecutionProfile,
    );
    if (!phase1Result?.finalRows.length) {
      throw new Error("Bright Data recall returned no candidates.");
    }

    if (!initialExecutionProfile.allowPhaseTwo) {
      const finalPhase1Parsed = withExecutionState(phase1Parsed, initialExecutionProfile, {
        planCode,
        searchPhase: "phase_1",
        resultStage: "final",
        searchPhaseCount: 1,
        displayCount: initialExecutionProfile.finalResultCap,
      });
      await completeSearch(
        context,
        finalPhase1Parsed,
        phase1Result.finalRows,
        buildSearchDisplayStats({
          ...phase1Result.displayStats,
          search_phase_count: 1,
        }),
        phase1Result.warningMessage,
        {
          runtime: getExecutionRuntime(initialExecutionProfile),
        },
      );
      return;
    }

    const hiringBrief = sanitizeHiringBrief(phase1Parsed.hiring_brief, phase1Parsed);
    if (!shouldUpgradeToFullPass(hiringBrief, phase1Result.displayStats)) {
      const fastFinalParsed = withExecutionState(phase1Parsed, initialExecutionProfile, {
        planCode,
        searchPhase: "phase_1",
        resultStage: "final",
        searchPhaseCount: 1,
        displayCount: initialExecutionProfile.finalResultCap,
      });
      await completeSearch(
        context,
        fastFinalParsed,
        phase1Result.finalRows,
        buildSearchDisplayStats({
          ...phase1Result.displayStats,
          search_phase_count: 1,
        }),
        phase1Result.warningMessage,
        {
          runtime: getExecutionRuntime(initialExecutionProfile),
        },
      );
      return;
    }

    const fullExecutionProfile = getFullSearchExecutionProfile(planCode);
    if (!fullExecutionProfile) {
      throw new Error("Full Bright profile is unavailable for this plan.");
    }

    const phase2Parsed = withExecutionState(
      {
        ...phase1Parsed,
        phase_1_display_stats: phase1Result.displayStats,
        phase_1_recall_metadata: phase1Parsed.recall_metadata ?? null,
        phase_1_execution_profile: initialExecutionProfile.name,
      },
      fullExecutionProfile,
      {
        planCode,
        searchPhase: "phase_2",
        resultStage: "provisional",
        searchPhaseCount: 2,
        displayCount: initialExecutionProfile.finalResultCap,
      },
    );
    delete phase2Parsed.recall_metadata;

    await persistProvisionalSearch(
      context,
      phase2Parsed,
      phase1Result.finalRows,
      buildSearchDisplayStats({
        ...phase1Result.displayStats,
        search_phase_count: 2,
      }),
    );

    parsed.recall_metadata = null;
    Object.assign(parsed, phase2Parsed);
    activePhase = "phase_2";
  }

  if (activePhase !== "phase_2") {
    return;
  }

  const fullExecutionProfile = getFullSearchExecutionProfile(planCode);
  if (!fullExecutionProfile) {
    throw new Error("Full Bright profile is unavailable for this plan.");
  }

  const phase2Parsed = withExecutionState(
    {
      ...parsed,
      display_count:
        Number(parsed.display_count) || initialExecutionProfile.finalResultCap,
    },
    fullExecutionProfile,
    {
      planCode,
      searchPhase: "phase_2",
      resultStage: "provisional",
      searchPhaseCount: 2,
      displayCount:
        Number(parsed.display_count) || initialExecutionProfile.finalResultCap,
    },
  );

  try {
    const phase2Result = await buildBrightDataDatasetCandidates(
      context,
      phase2Parsed,
      fullExecutionProfile,
    );
    if (!phase2Result?.finalRows.length) {
      throw new Error("Full Bright pass returned no candidates.");
    }

    const finalPhase2Parsed = withExecutionState(
      phase2Parsed,
      fullExecutionProfile,
      {
        planCode,
        searchPhase: "phase_2",
        resultStage: "final",
        searchPhaseCount: 2,
        displayCount: fullExecutionProfile.finalResultCap,
      },
    );

    await completeSearch(
      context,
      finalPhase2Parsed,
      phase2Result.finalRows,
      mergeCostEstimates(
        buildSearchDisplayStats({
          ...phase2Result.displayStats,
          search_phase_count: 2,
        }),
        normalizeSearchDisplayStats(parsed.phase_1_display_stats),
      ),
      phase2Result.warningMessage,
      {
        runtime: getExecutionRuntime(fullExecutionProfile),
      },
    );
    return;
  } catch (error) {
    if (error instanceof DatasetRecallPendingError) {
      throw error;
    }

    const phase1DisplayStats = normalizeSearchDisplayStats(parsed.phase_1_display_stats);
    const degradedParsed = withExecutionState(
      phase2Parsed,
      fullExecutionProfile,
      {
        planCode,
        searchPhase: "phase_2",
        resultStage: "provisional",
        searchPhaseCount: 2,
        displayCount:
          Number(parsed.display_count) || initialExecutionProfile.finalResultCap,
      },
    );
    await setSearchStatus(context.searchId, "degraded", {
      done_at: nowIso(),
      warning_message:
        "Deeper Bright refinement did not finish. Showing the fast-pass shortlist.",
      error_message: null,
      parsed_requirements: phase1DisplayStats
        ? withDisplayStats(degradedParsed, buildSearchDisplayStats({
          ...phase1DisplayStats,
          search_phase_count: 2,
        }))
        : degradedParsed,
    });

    await updateSearchUsageEventMetadata(context.searchId, {
      execution_profile: fullExecutionProfile.name,
      search_phase: "phase_2",
      result_stage: "provisional",
      search_phase_count: 2,
      bright_snapshot_cost: phase1DisplayStats?.bright_snapshot_cost ?? null,
      estimated_llm_cost: phase1DisplayStats?.estimated_llm_cost ?? null,
      estimated_search_total_cost: phase1DisplayStats?.estimated_search_total_cost ?? null,
      judge_mode: "dual",
    });

    logSearchEvent("search_degraded", {
      search_id: context.searchId,
      provider: "brightdata_dataset",
      reason: error instanceof Error ? error.message : String(error),
      job_id: context.jobId,
    });
  }
}

export async function processNextSearchJob(preferredSearchId?: string | null) {
  const job = await claimSearchJob(preferredSearchId);
  if (!job) {
    return { processed: false, hasMore: false };
  }

  try {
    await runSearchPipeline(job);
    await updateJobStatus(job.id, "done", {
      finished_at: nowIso(),
      locked_at: null,
      last_error: null,
    });
  } catch (error) {
    if (error instanceof DatasetRecallPendingError) {
      await updateJobStatus(job.id, "queued", {
        available_at: nowIso(),
        last_error: null,
        locked_at: null,
        attempt_count: Math.max((job.attempt_count || 1) - 1, 0),
      });

      logSearchEvent("search_job_requeued", {
        search_id: job.search_id,
        reason: error.message,
        job_id: job.id,
      });

      return {
        processed: true,
        hasMore: await hasRunnableSearchJobs(),
      };
    }

    const message = error instanceof Error ? error.message : "Search job failed";
    const retryable = job.attempt_count < SEARCH_JOB_MAX_ATTEMPTS;
    await updateJobStatus(job.id, retryable ? "retryable_error" : "fatal_error", {
      available_at: retryable ? nowIso() : null,
      last_error: message,
      locked_at: null,
      finished_at: retryable ? null : nowIso(),
    });

    const { count } = await supabaseAdmin
      .from("hirelix_candidates")
      .select("id", { count: "exact", head: true })
      .eq("search_id", job.search_id);

    if (!retryable) {
      if ((count || 0) > 0) {
        await markSearchDegraded(
          job.search_id,
          "The shortlist is still usable, but the final refinement pass did not finish.",
        );
      } else {
        await failSearch(job.search_id, message);
      }
    }

    logSearchEvent("search_provider_failed", {
      search_id: job.search_id,
      reason: message,
      retryable,
      attempt_count: job.attempt_count,
      job_id: job.id,
    });
  }

  return {
    processed: true,
    hasMore: await hasRunnableSearchJobs(),
  };
}
