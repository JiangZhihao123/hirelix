import { createClient } from "@supabase/supabase-js";
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
  type SerperCandidate,
} from "@/lib/serper";
import {
  streamLinkedInProfiles,
  brightDataProfileToRichText,
  filterDatasetProfiles,
  triggerDatasetFilter,
  waitForDatasetSnapshot,
  type BrightDataDatasetFilterRequest,
  type BrightDataFilterRule,
  type BrightDataProfile,
} from "@/lib/brightdata";

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
const PRE_SCREEN_BATCH_SIZE = getConfiguredPositiveInt(
  "SEARCH_PRE_SCREEN_BATCH_SIZE",
  1,
  { max: 200 },
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
const DEEP_REVIEW_TARGET = getConfiguredPositiveInt(
  "SEARCH_DEEP_REVIEW_TARGET",
  40,
  { max: 100 },
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
const SHORTLIST_MIN_SCORE = getConfiguredPositiveInt(
  "SEARCH_SHORTLIST_MIN_SCORE",
  60,
  { min: 1, max: 100 },
);
const PRE_SCREEN_TARGET = getConfiguredPositiveInt(
  "SEARCH_PRE_SCREEN_TARGET",
  250,
  { min: 25, max: 1000 },
);
const DEEP_REVIEW_DEBUG_LOGS = getConfiguredBoolean(
  "SEARCH_DEBUG_DEEP_REVIEW_LOGS",
  false,
);
const SEARCH_RECALL_PROVIDER = (
  process.env.SEARCH_RECALL_PROVIDER ||
  "serper"
).trim().toLowerCase();
const SEARCH_RECALL_FALLBACK_PROVIDER = (
  process.env.SEARCH_RECALL_FALLBACK_PROVIDER ||
  "serper"
).trim().toLowerCase();
const BRIGHTDATA_FILTER_LIMIT = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_LIMIT",
  250,
  { max: 500 },
);
const BRIGHTDATA_FILTER_TIMEOUT_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_TIMEOUT_MS",
  300000,
  { min: 10000, max: 900000 },
);
const BRIGHTDATA_FILTER_POLL_WINDOW_MS = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_FILTER_POLL_WINDOW_MS",
  20000,
  { min: 5000, max: 120000 },
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
};

type CandidateSuitability = {
  fit_decision: "strong_fit" | "viable_fit" | "risky_fit" | "reject";
  actionability: "ready_to_act" | "needs_review" | "not_actionable";
  match_score: number;
  scoring_breakdown: ScoringBreakdown;
  constraint_verdicts: ConstraintVerdict;
  constraint_risks: string[];
  risk_flags: string[];
  why_this_candidate: string[];
  why_not_higher: string[];
  evidence_quality: "high" | "medium" | "low";
};

type CanonicalWorkHistoryItem = {
  title: string | null;
  company: string | null;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
};

type CanonicalEducationItem = {
  school: string | null;
  degree: string | null;
  major: string | null;
  start_year: string | null;
  end_year: string | null;
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

type ScoredCandidateAssessment = {
  index: number;
  suitability: CandidateSuitability;
  skills: string[];
  experience_years: number | null;
  location: string | null;
  scoring_method?: "dual_review_auto" | "dual_review_arbitrated";
  judge_delta?: number;
  judge_conflict?: boolean;
};

type LightCandidateAssessment = {
  index: number;
  match_score: number;
  reason: string;
};

type JudgeScoreResult = {
  index: number;
  capability_score: number;
  relevance_score: number;
  join_likelihood_score: number;
  join_likelihood_reasons: string[];
  short_reasons: string[];
  risk_flags: string[];
  skills: string[];
  experience_years: number | null;
  location: string | null;
};

type PipelineContext = {
  searchId: string;
  jobId: string;
  userId: string;
  jdText: string;
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
};

type SearchPipelineResult = {
  finalRows: CandidateRowInput[];
  displayStats: SearchDisplayStats;
  warningMessage?: string | null;
};

type RecallMetadata = {
  provider: RecallProvider;
  snapshot_id: string;
  dataset_size?: number | null;
  recall_latency_ms?: number | null;
  requested_at?: string | null;
  completed_at?: string | null;
  status?: "submitted" | "polling" | "ready";
};

class DatasetRecallPendingError extends Error {
  retryImmediately: boolean;

  constructor(message: string) {
    super(message);
    this.name = "DatasetRecallPendingError";
    this.retryImmediately = true;
  }
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

function normalizeSearchQueries(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];

  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;

    const cleaned = item.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;

    const withLinkedInScope = /site:linkedin\.com\/in/i.test(cleaned)
      ? cleaned
      : `site:linkedin.com/in ${cleaned}`;

    deduped.add(withLinkedInScope);
    if (deduped.size >= maxItems) break;
  }

  return Array.from(deduped);
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeRecallSpec(value: unknown, candidateCount: number): RecallSpec {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const countries = Array.isArray(item.countries)
    ? item.countries
      .map((country) => normalizeCountryCode(country))
      .filter((country): country is string => Boolean(country))
      .slice(0, 5)
    : [];
  const title_variants = normalizeStringArray(item.title_variants, 8);
  const core_skill_terms = normalizeStringArray(item.core_skill_terms, 12);
  const requestedLimit =
    typeof item.record_limit === "number" && Number.isFinite(item.record_limit)
      ? Math.round(item.record_limit)
      : BRIGHTDATA_FILTER_LIMIT;

  return {
    countries,
    title_variants,
    core_skill_terms,
    record_limit: Math.min(
      Math.max(requestedLimit, BRIGHTDATA_FILTER_LIMIT, Math.max(candidateCount * 10, 25)),
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
  };
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
  const requested_at = normalizeNullableString(item.requested_at);
  const completed_at = normalizeNullableString(item.completed_at);

  return {
    provider,
    snapshot_id: snapshotId,
    dataset_size,
    recall_latency_ms,
    requested_at,
    completed_at,
    status:
      status === "submitted" || status === "polling" || status === "ready"
        ? status
        : undefined,
  };
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
) {
  return {
    ...parsed,
    display_stats: stats,
  };
}

function truncateForPrompt(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Job description truncated for prompt length]`;
}


function normalizeCanonicalWorkHistory(value: unknown): CanonicalWorkHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const title = normalizeNullableString(item.title);
      const company = normalizeNullableString(item.company);
      const start_date = normalizeNullableString(item.start_date);
      const end_date = normalizeNullableString(item.end_date);
      const summary = normalizeNullableString(item.summary);
      if (!title && !company && !summary) return null;
      return {
        title,
        company,
        start_date,
        end_date,
        summary,
      };
    })
    .filter((entry): entry is CanonicalWorkHistoryItem => Boolean(entry))
    .slice(0, 5);
}

function normalizeCanonicalEducation(value: unknown): CanonicalEducationItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const school = normalizeNullableString(item.school);
      const degree = normalizeNullableString(item.degree);
      const major = normalizeNullableString(item.major);
      const start_year = normalizeNullableString(item.start_year);
      const end_year = normalizeNullableString(item.end_year);
      if (!school && !degree && !major) return null;
      return {
        school,
        degree,
        major,
        start_year,
        end_year,
      };
    })
    .filter((entry): entry is CanonicalEducationItem => Boolean(entry))
    .slice(0, 3);
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
  const lines = [
    `Title: ${normalizeNullableString(parsed.title) || "N/A"}`,
  ];

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

function buildCompanyProfileContext(parsed: Record<string, unknown>) {
  const companyProfile = sanitizeCompanyProfile(parsed.company_profile);
  if (!companyProfile) {
    return "Company context: Not provided. Infer join likelihood from JD scope, role level, work model, and public candidate signals only.";
  }

  const lines = ["Company Profile Context:"];
  if (companyProfile.size) lines.push(`- Size: ${companyProfile.size}`);
  if (companyProfile.mission) lines.push(`- Mission: ${companyProfile.mission}`);
  if (companyProfile.tech_stack) lines.push(`- Tech stack: ${companyProfile.tech_stack}`);
  if (companyProfile.benefits) lines.push(`- Benefits: ${companyProfile.benefits}`);
  if (companyProfile.selling_points) lines.push(`- Why join: ${companyProfile.selling_points}`);
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

function deriveFitDecisionFromScore(score: number): CandidateSuitability["fit_decision"] {
  if (score >= 85) return "strong_fit";
  if (score >= 65) return "viable_fit";
  if (score >= 40) return "risky_fit";
  return "reject";
}

function deriveActionabilityFromScores(
  overallScore: number,
  joinLikelihoodScore: number,
): CandidateSuitability["actionability"] {
  if (overallScore >= 80 && joinLikelihoodScore >= 60) return "ready_to_act";
  if (overallScore >= 65) return "needs_review";
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
  const rawMatchScore = hasTriScores
    ? Math.round((capabilityScore + relevanceScore + joinLikelihoodScore) / 3)
    : normalizeScore(item.match_score);
  const fitDecision = deriveFitDecisionFromScore(rawMatchScore);
  let actionability = deriveActionabilityFromScores(rawMatchScore, joinLikelihoodScore);
  if (!hasTriScores) {
    actionability = normalizeEnumValue(
      item.actionability,
      ["ready_to_act", "needs_review", "not_actionable"] as const,
      rawMatchScore >= 80 ? "ready_to_act" : rawMatchScore >= 65 ? "needs_review" : "not_actionable",
    );
  }

  return {
    fit_decision: fitDecision,
    actionability,
    match_score: rawMatchScore,
    scoring_breakdown: {
      capability_score: capabilityScore,
      relevance_score: relevanceScore,
      join_likelihood_score: joinLikelihoodScore,
      join_likelihood_reasons: stripSpeculativeRelocation(
        normalizeStringArray(item.join_likelihood_reasons, 6),
      ),
    },
    constraint_verdicts: sanitizeConstraintVerdicts(item.constraint_verdicts),
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
  return {
    keep: item.keep === true,
    match_score:
      typeof item.match_score === "number" && Number.isFinite(item.match_score)
        ? Math.max(0, Math.min(100, Math.round(item.match_score)))
        : 0,
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
    right.suitability.match_score - left.suitability.match_score ||
    right.suitability.scoring_breakdown.relevance_score - left.suitability.scoring_breakdown.relevance_score ||
    right.suitability.scoring_breakdown.join_likelihood_score - left.suitability.scoring_breakdown.join_likelihood_score ||
    right.suitability.scoring_breakdown.capability_score - left.suitability.scoring_breakdown.capability_score ||
    evidenceRank[left.suitability.evidence_quality] - evidenceRank[right.suitability.evidence_quality]
  );
}

function fallbackHeadlineFromBrightData(profile: BrightDataProfile) {
  if (profile.current_company) {
    const headline = `${profile.current_company.title || ""} at ${profile.current_company.name || ""}`.trim();
    return headline || null;
  }
  return null;
}

function fallbackLocationFromBrightData(profile: BrightDataProfile) {
  return [profile.city, profile.country_code].filter(Boolean).join(", ") || null;
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
  const provider = process.env.AI_PROVIDER || "anthropic";
  if (provider === "openrouter") {
    return process.env.AI_MODEL || "anthropic/claude-sonnet-4.6";
  }
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
}

function getJudgeModel() {
  const provider = process.env.AI_PROVIDER || "anthropic";
  if (provider === "openrouter") {
    return (
      process.env.SEARCH_JUDGE_MODEL ||
      process.env.OPENROUTER_JUDGE_MODEL ||
      process.env.AI_MODEL ||
      "anthropic/claude-sonnet-4.6"
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
  const provider = process.env.AI_PROVIDER || "anthropic";
  if (provider === "openrouter") {
    return (
      process.env.SEARCH_ARBITER_MODEL ||
      process.env.OPENROUTER_ARBITER_MODEL ||
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
  const provider = process.env.AI_PROVIDER || "anthropic";
  if (provider === "openrouter") {
    return process.env.AI_MODEL || "anthropic/claude-sonnet-4.6";
  }
  return process.env.ANTHROPIC_HAIKU_MODEL || "claude-haiku-4-5-20251001";
}

function createAIClient() {
  const provider = process.env.AI_PROVIDER || "anthropic";
  
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
            maxOutputTokens: 700,
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

function buildFilterPrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  richProfiles: string,
  poolSize: number,
  candidateCount: number,
) {
  return `You are an expert AI recruiter. Your job is to deeply analyze candidate profiles and select the BEST matches for a role.

## Original Job Description
${truncateForPrompt(jdText.trim(), 4000)}

## Search Intent
${buildPromptSearchContext(parsed)}

## Candidate Pool (${poolSize} people)
${richProfiles}

## Your Task
Select the TOP ${candidateCount} candidates. For each, return:
- index: number (the [N] index from the profile)
- match_score: 0-100
- match_reasons: string[] (3-4 SPECIFIC reasons referencing their actual experience)
- skills: string[] (inferred technical skills based on their profile, max 8)

Return a JSON array of exactly ${candidateCount} objects, sorted by match_score descending. Return ONLY valid JSON, no markdown.`;
}

function buildSerperFilterPrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  richProfiles: string,
  poolSize: number,
  candidateCount: number,
) {
  return `${CANDIDATE_SUITABILITY_PROMPT}

## Original Job Description
${truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${buildPromptSearchContext(parsed)}

## Candidate Pool (${poolSize} candidates)
Review the following LinkedIn search results and assess each candidate for real-world shortlist actionability.

${richProfiles}

## Your Task
Return exactly ${candidateCount} candidate assessments for the best people. Prioritize realistic viability over raw resume strength.

For location-sensitive roles:
- Candidates outside the practical target geography should not become strong_fit unless the profile explicitly proves they can work in the target location.
- Do not speculate about relocation.
`;
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
- "keep" should be true only if this candidate is plausibly worth a deeper look.
- Use match_score as a coarse ranking score, not a final evaluation.
- Keep reason under 20 words.
- Do not return any extra fields.`;
}

function buildDeepScorePrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  richProfiles: string,
  poolSize: number,
) {
  return `${CANDIDATE_SUITABILITY_PROMPT}

## Original Job Description
${truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${buildPromptSearchContext(parsed)}

## Company Context
${buildCompanyProfileContext(parsed)}

## Candidate Profiles (${poolSize} candidates)
The profiles below are raw candidate profiles derived from LinkedIn data.

${richProfiles}

## Your Task
Assess every candidate for shortlist suitability. Return one object per candidate profile.

Additional rules:
- "strong_fit" means worth advancing now and must map to 85-100.
- "viable_fit" means usable for the shortlist but with something to verify and must map to 65-84.
- "risky_fit" means maybe worth keeping as a broader alternative, not a primary recommendation, and must map to 40-64.
- "reject" means not shortlist-worthy and must map to 0-39.
- "ready_to_act" is only valid for strong_fit or the strongest viable_fit candidates with clear evidence.
- "not_actionable" is only valid for rejects or low-confidence low-score candidates.
- Keep "why_this_candidate" concrete and evidence-based.
- Put any missing hard constraints into "constraint_risks" and "why_not_higher".
- Never speculate about relocation or work authorization.
`;
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
  "short_reasons": ["string"],
  "risk_flags": ["string"],
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
    "short_reasons": ["string"],
    "risk_flags": ["string"],
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
- Strongly penalize obvious overqualification, role-level mismatch, prestige mismatch, unrealistic company-stage mismatch, and hard location/work-model mismatch in join_likelihood_score.
- Do not reward prestige alone.
- Keep short_reasons concrete and short. Max 3 items.
- Keep join_likelihood_reasons concrete and evidence-based. Max 3 items.
- Keep risk_flags concrete and short. Max 4 items.
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
- Return tri-scores, not a free-form final verdict.
- The final result must be conservative on join likelihood when evidence is weak.
- Explain the candidate's strengths, join-likelihood evidence, and what still needs verification.
- Return ONLY valid JSON array with one object using this exact shape:
[
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

function buildLightDeepScorePrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  richProfiles: string,
  poolSize: number,
) {
  return `You are ranking candidate profiles for a hiring workflow.

## Original Job Description
${truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${buildPromptSearchContext(parsed)}

## Candidate Profiles (${poolSize} candidates)
The profiles below are raw candidate profiles derived from LinkedIn data.

${richProfiles}

## Your Task
Return one lightweight ranking object per candidate profile.

Return ONLY valid JSON with this exact shape:
[
  {
    "index": 0,
    "match_score": 0,
    "reason": "one short sentence"
  }
]

Rules:
- Keep the reason under 18 words.
- Do not return any extra fields.
- This is only a coarse ranking pass, not the final suitability output.`;
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
        skills: normalizeStringArray(item.skills, 10),
        experience_years: normalizeExperienceYears(item.experience_years),
        location: normalizeNullableString(item.location),
      };
    })
    .filter((entry): entry is JudgeScoreResult => Boolean(entry));
}

function parseLightCandidateAssessments(
  raw: unknown,
  poolSize: number,
): LightCandidateAssessment[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): LightCandidateAssessment | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const rawIndex = typeof item.index === "number" ? item.index : Number(item.index);
      if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= poolSize) return null;
      const match_score =
        typeof item.match_score === "number" && Number.isFinite(item.match_score)
          ? Math.max(0, Math.min(100, Math.round(item.match_score)))
          : 0;
      const reason =
        normalizeNullableString(item.reason) ||
        "Potentially strong fit based on backend stack and role alignment.";

      return {
        index: rawIndex,
        match_score,
        reason,
      };
    })
    .filter((entry): entry is LightCandidateAssessment => Boolean(entry))
    .sort((left, right) => right.match_score - left.match_score);
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
    rows.push({
      name: profile.name || "Unknown",
      headline: profile.current_company
        ? `${profile.current_company.title || ""} at ${profile.current_company.name || ""}`.trim() || null
        : null,
      location: item.location || [profile.city, profile.country_code].filter(Boolean).join(", ") || null,
      skills: item.skills.length > 0
        ? item.skills
        : (profile.skills || []).slice(0, 10),
      experience_years: item.experience_years,
      match_score: item.suitability.match_score || 50,
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

function buildBrightDataLightCandidateRows(
  profiles: BrightDataProfile[],
  selected: LightCandidateAssessment[],
  limit: number,
  poolType: "top_pick" | "outreach_pool",
) {
  return selected.slice(0, limit).flatMap((item) => {
    const rawIndex = item.index;
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= profiles.length) return [];

    const profile = profiles[rawIndex];
    return [{
      name: profile.name || "Unknown",
      headline:
        fallbackHeadlineFromBrightData(profile) ||
        normalizeNullableString((profile as unknown as Record<string, unknown>).position),
      location: fallbackLocationFromBrightData(profile),
      skills: (profile.skills || []).slice(0, 10),
      experience_years: null,
      match_score: item.match_score,
      match_reasons: [item.reason],
      profile_url: profile.url || profile.input?.url || null,
      github_url: null,
      email: null,
      outreach_draft: null,
      metadata: {
        source: "brightdata",
        analysis_stage: "final",
        preliminary: true,
        pool_type: poolType,
        light_score: item,
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
    }];
  });
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

function selectQualifiedAssessments(
  assessments: ScoredCandidateAssessment[],
  hiringBrief: HiringBrief,
) {
  const strictLocationGate =
    (hiringBrief.work_model === "hybrid" || hiringBrief.work_model === "onsite") &&
    hiringBrief.location_flexibility === "strict";

  return assessments.filter((assessment) => {
    if (assessment.suitability.match_score < 60) return false;
    if (assessment.suitability.scoring_breakdown.relevance_score < 60) return false;
    if (assessment.suitability.scoring_breakdown.join_likelihood_score < 40) return false;
    if (assessment.suitability.actionability === "not_actionable") return false;
    if (!strictLocationGate) return true;
    return (
      assessment.suitability.constraint_verdicts.location_fit !== "non_local" &&
      assessment.suitability.constraint_verdicts.work_model_fit !== "no"
    );
  });
}

function selectQualifiedLightAssessments(assessments: LightCandidateAssessment[]) {
  return assessments.filter((assessment) => assessment.match_score >= 60);
}

function getActionabilityRank(value: CandidateSuitability["actionability"]) {
  switch (value) {
    case "ready_to_act":
      return 0;
    case "needs_review":
      return 1;
    default:
      return 2;
  }
}

function getMoreConservativeActionability(
  left: CandidateSuitability["actionability"],
  right: CandidateSuitability["actionability"],
): CandidateSuitability["actionability"] {
  return getActionabilityRank(left) >= getActionabilityRank(right) ? left : right;
}

function hasJudgeConflict(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
) {
  const judgeAOverall = Math.round(
    (judgeA.capability_score + judgeA.relevance_score + judgeA.join_likelihood_score) / 3,
  );
  const judgeBOverall = Math.round(
    (judgeB.capability_score + judgeB.relevance_score + judgeB.join_likelihood_score) / 3,
  );
  return (
    Math.abs(judgeA.capability_score - judgeB.capability_score) > 8 ||
    Math.abs(judgeA.relevance_score - judgeB.relevance_score) > 8 ||
    Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score) > 8 ||
    deriveFitDecisionFromScore(judgeAOverall) !== deriveFitDecisionFromScore(judgeBOverall) ||
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
  const suitability = sanitizeCandidateSuitability({
    capability_score: capabilityScore,
    relevance_score: relevanceScore,
    join_likelihood_score: joinLikelihoodScore,
    join_likelihood_reasons: Array.from(
      new Set([...judgeA.join_likelihood_reasons, ...judgeB.join_likelihood_reasons]),
    ).slice(0, 6),
    constraint_verdicts: {
      location_fit: "unknown",
      work_model_fit: "unclear",
      must_have_coverage: "unknown",
    },
    risk_flags: [...judgeA.risk_flags, ...judgeB.risk_flags],
    constraint_risks: [...judgeA.risk_flags, ...judgeB.risk_flags],
    why_this_candidate: [...judgeA.short_reasons, ...judgeB.short_reasons],
    why_not_higher: [...judgeA.risk_flags, ...judgeB.risk_flags],
    evidence_quality: "medium",
  });

  return {
    index: judgeA.index,
    suitability: suitability || {
      fit_decision: "reject",
      actionability: "not_actionable",
      match_score: 0,
      scoring_breakdown: {
        capability_score: 0,
        relevance_score: 0,
        join_likelihood_score: 0,
        join_likelihood_reasons: [],
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
): BrightDataDatasetFilterRequest | null {
  const datasetId = process.env.BRIGHTDATA_RECALL_DATASET_ID;
  if (!datasetId) return null;

  const recallSpec = normalizeRecallSpec(parsed.recall_spec, candidateCount);
  const titleTerms = recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value));

  if (titleTerms.length === 0) return null;

  return {
    datasetId,
    recordsLimit: recallSpec.record_limit,
    filter: {
      operator: "or",
      filters: titleTerms.map((term) => ({
        name: "position",
        operator: "includes",
        value: term,
      })),
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
  const { text } = await withTimeout(
    generateText({
      model: aiClient(getAIModel()),
      system: JD_SEARCH_INTENT_PROMPT,
      prompt: context.jdText,
      maxOutputTokens: 1800,
    }),
    60000,
    "Search intent generation",
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJSON(text));
  } catch {
    parsed = {
      title: "Untitled Role",
      recall_spec: {
        countries: [],
        title_variants: [],
        core_skill_terms: [],
        record_limit: BRIGHTDATA_FILTER_LIMIT,
      },
    };
  }

  parsed.title = normalizeNullableString(parsed.title) || "Untitled Role";
  parsed.candidate_count = context.candidateCount;
  parsed.display_count = context.candidateCount;
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
  parsed.recall_provider = SEARCH_RECALL_PROVIDER;
  parsed.recall_spec = normalizeRecallSpec(parsed.recall_spec, context.candidateCount);
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


async function preScreenSerperCandidate(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  candidate: SerperCandidate,
): Promise<SerperPreScreenedCandidate> {
  const prompt = buildSerperSingleCandidatePrompt(parsed, jdText, candidate);

  try {
    const { text } = await withTimeout(
      generateText({
        model: aiClient(getHaikuModel()),
        prompt,
        maxOutputTokens: 200,
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
  } catch {
    // Fall through to conservative default.
  }

  return {
    serperCandidate: candidate,
    preScreen: {
      keep: true,
      match_score: 50,
      reason: "Possible fit based on LinkedIn headline and snippet.",
    },
  };
}

async function preScreenAllCandidates(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  candidates: SerperCandidate[],
  targetCount: number,
): Promise<SerperPreScreenedCandidate[]> {
  if (!candidates.length) return [];

  const preScreened = await runWithConcurrency(
    candidates,
    resolveStageConcurrency(PRE_SCREEN_CONCURRENCY, candidates.length),
    async (candidate) => preScreenSerperCandidate(aiClient, parsed, jdText, candidate),
  );

  const kept = preScreened.filter((candidate) => candidate.preScreen.keep);
  const sorted = (kept.length > 0 ? kept : preScreened).sort(
    (a, b) => b.preScreen.match_score - a.preScreen.match_score,
  );
  return sorted.slice(0, targetCount);
}

async function buildBrightDataDatasetCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
): Promise<SearchPipelineResult | null> {
  const brightDataToken = process.env.BRIGHTDATA_API_TOKEN;
  const recallRequest = buildBrightDataRecallFilter(parsed, context.candidateCount);
  if (!brightDataToken || !recallRequest) {
    return null;
  }

  await setSearchStatus(context.searchId, "searching");
  const existingRecallMetadata = normalizeRecallMetadata(parsed.recall_metadata);
  let snapshotId = existingRecallMetadata?.snapshot_id ?? null;
  let requestedAt = existingRecallMetadata?.requested_at
    ? Date.parse(existingRecallMetadata.requested_at)
    : Number.NaN;

  if (!snapshotId) {
    snapshotId = await triggerDatasetFilter(brightDataToken, recallRequest);
    requestedAt = Date.now();
    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      provider: "brightdata_dataset",
      snapshot_id: snapshotId,
      requested_at: new Date(requestedAt).toISOString(),
      status: "submitted",
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    logSearchEvent("search_step_started", {
      search_id: context.searchId,
      step: "searching",
      provider: "brightdata_dataset",
      record_limit: recallRequest.recordsLimit,
      snapshot_id: snapshotId,
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
      record_limit: recallRequest.recordsLimit,
      snapshot_id: snapshotId,
      resumed: true,
      job_id: context.jobId,
    });
  }

  const totalElapsedMs = Math.max(0, Date.now() - requestedAt);
  const remainingTimeoutMs = Math.max(0, BRIGHTDATA_FILTER_TIMEOUT_MS - totalElapsedMs);
  if (remainingTimeoutMs <= 0) {
    throw new Error(`Bright Data dataset recall timed out after ${BRIGHTDATA_FILTER_TIMEOUT_MS}ms`);
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
    requested_at: new Date(requestedAt).toISOString(),
    completed_at: nowIso(),
    status: "ready",
  };
  await updateSearchParsedRequirements(context.searchId, parsed);

  await setSearchStatus(context.searchId, "screening", {
    search_completed_at: nowIso(),
  });
  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "searching",
    provider: "brightdata_dataset",
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
    deep_scoring_batch_size: DEEP_SCORING_BATCH_SIZE,
    deep_scoring_concurrency: resolveStageConcurrency(
      DEEP_SCORING_CONCURRENCY,
      Math.ceil(profiles.length / DEEP_SCORING_BATCH_SIZE),
    ),
    job_id: context.jobId,
  });

  const scored = await scoreBrightDataProfiles(
    context,
    parsed,
    profiles,
    profiles.length,
  );

  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "deep_scoring",
    provider: "brightdata_dataset",
    result_count: scored.finalRows.length,
    retrieved_count: profiles.length,
    shortlist_count: scored.displayStats.shortlist_count,
    job_id: context.jobId,
  });

  return scored;
}

async function buildSerperCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
) {
  const serperApiKey = process.env.SERPER_API_KEY;
  if (!serperApiKey) {
    return null;
  }

  const aiClient = createAIClient();
  await setSearchStatus(context.searchId, "searching");
  const searchPlan = buildLinkedInSearchPlan(parsed);
  const queryTasks: Array<{ query: string; page: number }> = [];
  for (const query of searchPlan.queries) {
    for (let page = 1; page <= SERPER_PAGES_PER_QUERY; page++) {
      queryTasks.push({ query, page });
    }
  }
  const serperStageConcurrency = Math.min(SERPER_QUERY_CONCURRENCY, queryTasks.length);

  logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "searching",
    provider: "serper",
    query_concurrency: serperStageConcurrency,
    query_count: searchPlan.queries.length,
    pages_per_query: SERPER_PAGES_PER_QUERY,
    results_per_page: SERPER_RESULTS_PER_PAGE,
    job_id: context.jobId,
  });

  const searchResults = await runWithConcurrency(
    queryTasks,
    serperStageConcurrency,
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
        query,
        page,
        job_id: context.jobId,
      });
      return [] as SerperCandidate[];
    },
  );

  const deduped = new Map<string, SerperCandidate>();
  for (const batch of searchResults) {
    for (const candidate of batch) {
      const key = candidate.linkedin_url.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, candidate);
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
  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "searching",
    provider: "serper",
    result_count: allCandidates.length,
    query_count: searchPlan.queries.length,
    job_id: context.jobId,
  });

  const preScreened = await preScreenAllCandidates(
    aiClient,
    parsed,
    context.jdText,
    allCandidates,
    Math.min(allCandidates.length, PRE_SCREEN_TARGET),
  );

  if (!preScreened.length) {
    return null;
  }

  const fallbackRows = buildSerperCandidateRows(preScreened, context.candidateCount);

  return {
    preScreened,
    fallbackRows,
    retrievalCount: allCandidates.length,
  };
}

async function deepScoreBatch(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  batchIndexes: number[],
  totalPoolSize: number,
): Promise<ScoredCandidateAssessment[]> {
  const profilesText = batchIndexes
    .map((idx) => profileTexts[idx])
    .join("\n\n");

  const deepPrompt = buildDeepScorePrompt(
    parsed,
    jdText,
    profilesText,
    batchIndexes.length,
  );
  const { text: deepText } = await withTimeout(
    generateText({
      model: aiClient(getAIModel()),
      prompt: deepPrompt,
      maxOutputTokens: 2000,
    }),
    60000,
    "Deep scoring detail",
  );

  return parseScoredAssessments(
    JSON.parse(extractJSON(deepText)),
    totalPoolSize,
  ).filter((assessment) => batchIndexes.includes(assessment.index));
}

async function lightScoreBatch(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  batchIndexes: number[],
  totalPoolSize: number,
): Promise<LightCandidateAssessment[]> {
  const profilesText = batchIndexes
    .map((idx) => profileTexts[idx])
    .join("\n\n");

  const rankingPrompt = buildLightDeepScorePrompt(
    parsed,
    jdText,
    profilesText,
    batchIndexes.length,
  );
  const { text } = await withTimeout(
    generateText({
      model: aiClient(getAIModel()),
      prompt: rankingPrompt,
      maxOutputTokens: 600,
    }),
    60000,
    "Deep scoring rank",
  );

  const parsedAssessments = parseLightCandidateAssessments(
    JSON.parse(extractJSON(text)),
    totalPoolSize,
  ).filter((assessment) => batchIndexes.includes(assessment.index));
  const byIndex = new Map(parsedAssessments.map((assessment) => [assessment.index, assessment]));

  return batchIndexes.map((index) => (
    byIndex.get(index) || {
      index,
      match_score: 0,
      reason: "Ranking pass returned no result for this profile.",
    }
  ));
}

async function judgeScoreBatch(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  batchIndexes: number[],
  totalPoolSize: number,
  judgeLabel: "Judge A" | "Judge B",
): Promise<JudgeScoreResult[]> {
  const profilesText = batchIndexes
    .map((idx) => profileTexts[idx])
    .join("\n\n");
  const prompt = buildJudgeScorePrompt(
    parsed,
    jdText,
    profilesText,
    batchIndexes.length,
    judgeLabel,
  );
  const judgeModel = getJudgeModel();
  const { text } = await withTimeout(
    generateText({
      model: aiClient(judgeModel),
      prompt,
      maxOutputTokens: 1400,
    }),
    JUDGE_SCORING_TIMEOUT_MS,
    `${judgeLabel} scoring`,
  );

  let judgeResult;
  try {
    const extracted = extractJSON(text);
    judgeResult = JSON.parse(extracted);
  } catch (error) {
    console.error(`[search:judge_json_parse_error] Failed to parse JSON from ${judgeLabel}:`, {
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
  
  return parseJudgeScoreResults(
    judgeResult,
    totalPoolSize,
    batchIndexes,
  ).filter((assessment) => batchIndexes.includes(assessment.index));
}

async function lightScoreAllProfiles(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  totalPoolSize: number,
): Promise<LightCandidateAssessment[]> {
  const allIndexes = Array.from({ length: profileTexts.length }, (_, i) => i);

  if (allIndexes.length <= DEEP_SCORING_BATCH_SIZE) {
    return lightScoreBatch(aiClient, parsed, jdText, profileTexts, allIndexes, totalPoolSize);
  }

  const batches: number[][] = [];
  for (let i = 0; i < allIndexes.length; i += DEEP_SCORING_BATCH_SIZE) {
    batches.push(allIndexes.slice(i, i + DEEP_SCORING_BATCH_SIZE));
  }

  const batchResults = await runWithConcurrency(
    batches,
    Math.min(DEEP_SCORING_CONCURRENCY, batches.length),
    async (batchIdxs) => {
      try {
        return await lightScoreBatch(aiClient, parsed, jdText, profileTexts, batchIdxs, totalPoolSize);
      } catch {
        return batchIdxs.map((index) => ({
          index,
          match_score: 0,
          reason: "Ranking pass timed out.",
        }));
      }
    },
  );

  return batchResults.flat().sort((left, right) => right.match_score - left.match_score);
}

async function arbitrateCandidateScore(
  aiClient: ReturnType<typeof createAIClient>,
  parsed: Record<string, unknown>,
  jdText: string,
  profileText: string,
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  totalPoolSize: number,
): Promise<ScoredCandidateAssessment | null> {
  const prompt = buildArbiterPrompt(parsed, jdText, profileText, judgeA, judgeB);
  const { text } = await withTimeout(
    generateText({
      model: aiClient(getArbiterModel()),
      prompt,
      maxOutputTokens: 800,
    }),
    ARBITER_SCORING_TIMEOUT_MS,
    "Arbiter scoring",
  );

  const assessment = parseScoredAssessments(JSON.parse(extractJSON(text)), totalPoolSize)[0];
  if (!assessment) return null;
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
}

async function deepScoreSelectedProfiles(
  aiClient: ReturnType<typeof createAIClient>,
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
      const judgeBatch = [selectedIndex];
      const [judgeAResults, judgeBResults] = await Promise.allSettled([
        judgeScoreBatch(aiClient, parsed, jdText, profileTexts, judgeBatch, totalPoolSize, "Judge A"),
        judgeScoreBatch(aiClient, parsed, jdText, profileTexts, judgeBatch, totalPoolSize, "Judge B"),
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
): Promise<SearchPipelineResult> {
  const aiClient = createAIClient();
  const renderProfileEntries = brightProfiles.map((profile, index) =>
    brightDataProfileToRichText(profile, index),
  );

  const lightAssessments = await lightScoreAllProfiles(
    aiClient,
    parsed,
    context.jdText,
    renderProfileEntries,
    brightProfiles.length,
  );
  const lightQualified = selectQualifiedLightAssessments(lightAssessments);
  const selectedIndexes = lightAssessments.map((assessment) => assessment.index);

  const allAssessments = await deepScoreSelectedProfiles(
    aiClient,
    parsed,
    context.jdText,
    renderProfileEntries,
    selectedIndexes,
    brightProfiles.length,
  );
  if (DEEP_REVIEW_DEBUG_LOGS) {
    logSearchEvent("deep_review_distribution", {
      search_id: context.searchId,
      requested_count: selectedIndexes.length,
      completed_count: allAssessments.length,
      selected_indexes: selectedIndexes,
      scores: allAssessments.map((assessment) => ({
        index: assessment.index,
        match_score: assessment.suitability.match_score,
        capability_score: assessment.suitability.scoring_breakdown.capability_score,
        relevance_score: assessment.suitability.scoring_breakdown.relevance_score,
        join_likelihood_score: assessment.suitability.scoring_breakdown.join_likelihood_score,
        fit_decision: assessment.suitability.fit_decision,
        actionability: assessment.suitability.actionability,
      })),
    });
  }
  const fullDetailIncomplete = allAssessments.length < selectedIndexes.length;
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const qualifiedAssessments = selectQualifiedAssessments(allAssessments, hiringBrief);
  const qualifiedCount = qualifiedAssessments.length;
  // 流水线模式：返回所有合格候选人，不限制数量
  const outreachPoolCount = qualifiedCount;
  const deepTopPickRows = buildBrightDataCandidateRows(
    brightProfiles,
    qualifiedAssessments,
    context.highlightCount,
    "top_pick",
  );
  const deepPoolRows = buildBrightDataCandidateRows(
    brightProfiles,
    qualifiedAssessments.slice(context.highlightCount),
    qualifiedCount - context.highlightCount,
    "outreach_pool",
  );
  const lightTopPickRows = buildBrightDataLightCandidateRows(
    brightProfiles,
    lightQualified,
    context.highlightCount,
    "top_pick",
  );
  const lightPoolRows = buildBrightDataLightCandidateRows(
    brightProfiles,
    lightQualified.slice(context.highlightCount),
    lightQualified.length - context.highlightCount,
    "outreach_pool",
  );
  const finalRows = tagPoolRows(
    [...deepTopPickRows, ...deepPoolRows],
    [...lightTopPickRows, ...lightPoolRows],
    context.highlightCount,
    outreachPoolCount,
  );
  const shortlistRows = finalRows.filter((row) => row.metadata?.pool_type === "top_pick");
  const qualifiedRowCount = finalRows.length;

  let warningMessage: string | null = null;
  if (finalRows.length === 0) {
    warningMessage = "No candidates met the current outreach threshold for this role.";
  } else if (shortlistRows.length < context.highlightCount) {
    warningMessage = `Only ${shortlistRows.length} highlighted candidate${shortlistRows.length === 1 ? "" : "s"} met the current outreach threshold.`;
  } else if (fullDetailIncomplete) {
    warningMessage =
      "Some advanced profile scoring did not finish, but the current 25 candidates are ready to review.";
  }

  return {
    finalRows,
    warningMessage,
    displayStats: buildSearchDisplayStats({
      retrieval_count: retrievalCount,
      deep_review_requested_count: selectedIndexes.length,
      deep_review_completed_count: allAssessments.length,
      qualified_count: qualifiedRowCount,
      outreach_pool_count: finalRows.length,
      shortlist_count: finalRows.length,
    }),
  };
}

function selectShortlist(
  assessments: ScoredCandidateAssessment[],
  candidateCount: number,
  hiringBrief: HiringBrief,
): ScoredCandidateAssessment[] {
  return selectQualifiedAssessments(assessments, hiringBrief).slice(0, candidateCount);
}

async function refineSerperCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  preScreened: SerperPreScreenedCandidate[],
  fallbackRows: CandidateRowInput[],
  retrievalCount: number,
) {
  const brightDataToken = process.env.BRIGHTDATA_API_TOKEN;
  const brightDataDatasetId = process.env.BRIGHTDATA_DATASET_ID;
  if (!brightDataToken || !brightDataDatasetId) {
    return {
      finalRows: fallbackRows,
      warningMessage: null,
      displayStats: buildSearchDisplayStats({
        retrieval_count: retrievalCount,
        deep_review_requested_count: preScreened.length,
        deep_review_completed_count: preScreened.length,
        qualified_count: fallbackRows.length,
        outreach_pool_count: fallbackRows.length,
        shortlist_count: fallbackRows.length,
      }),
    };
  }

  await setSearchStatus(context.searchId, "deep_scoring");
  const brightDataBatchCount = Math.ceil(preScreened.length / BRIGHTDATA_BATCH_SIZE);
  const scrapeBatchConcurrency = Math.min(BRIGHTDATA_BATCH_CONCURRENCY, brightDataBatchCount);
  const deepScoringBatchCount = Math.ceil(preScreened.length / DEEP_SCORING_BATCH_SIZE);
  const deepScoringConcurrency = Math.min(DEEP_SCORING_CONCURRENCY, deepScoringBatchCount);
  const deepReviewConcurrency = Math.min(DEEP_REVIEW_CONCURRENCY, preScreened.length);

  logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "deep_scoring",
    provider: "brightdata",
    batch_size: BRIGHTDATA_BATCH_SIZE,
    batch_concurrency: scrapeBatchConcurrency,
    deep_scoring_batch_size: DEEP_SCORING_BATCH_SIZE,
    deep_scoring_concurrency: deepScoringConcurrency,
    deep_review_concurrency: deepReviewConcurrency,
    job_id: context.jobId,
  });

  try {
    const urlsToScrape = preScreened.map((c) => c.serperCandidate.linkedin_url);

    // 流水线模式：边抓取边评分边落库
    const aiClient = createAIClient();
    const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
    const allDeepRows: CandidateRowInput[] = [];
    const allLightRows: CandidateRowInput[] = [];
    let totalScraped = 0;
    let deepRequestedCount = 0;
    let deepCompletedCount = 0;
    let batchNumber = 0;

    const profileStream = streamLinkedInProfiles(brightDataToken, brightDataDatasetId, urlsToScrape, {
      batchSize: BRIGHTDATA_BATCH_SIZE,
      concurrency: scrapeBatchConcurrency,
      allowPartial: true,
    });

    for await (const profileBatch of profileStream) {
      batchNumber += 1;
      totalScraped += profileBatch.length;
      logSearchEvent("search_pipeline_batch_started", {
        search_id: context.searchId,
        batch: batchNumber,
        batch_size: profileBatch.length,
        scraped_so_far: totalScraped,
        total_requested: urlsToScrape.length,
        job_id: context.jobId,
      });

      const renderProfileEntries = profileBatch.map((profile, index) =>
        brightDataProfileToRichText(profile, index),
      );

      const fallbackLightAssessments: LightCandidateAssessment[] = profileBatch.map((_, index) => ({
        index,
        match_score: 0,
        reason: "Ranking pass failed for this profile batch.",
      }));

      const lightAssessments = await lightScoreAllProfiles(
        aiClient,
        parsed,
        context.jdText,
        renderProfileEntries,
        profileBatch.length,
      ).catch((error) => {
        logSearchEvent("search_pipeline_light_scoring_failed", {
          search_id: context.searchId,
          batch: batchNumber,
          error: error instanceof Error ? error.message : String(error),
          job_id: context.jobId,
        });
        return fallbackLightAssessments;
      });

      const lightQualified = selectQualifiedLightAssessments(lightAssessments);
      allLightRows.push(
        ...buildBrightDataLightCandidateRows(
          profileBatch,
          lightQualified,
          lightQualified.length,
          "outreach_pool",
        ),
      );

      const selectedIndexes = lightAssessments.map((assessment) => assessment.index);
      deepRequestedCount += selectedIndexes.length;

      const deepAssessments = await deepScoreSelectedProfiles(
        aiClient,
        parsed,
        context.jdText,
        renderProfileEntries,
        selectedIndexes,
        profileBatch.length,
      ).catch((error) => {
        logSearchEvent("search_pipeline_deep_scoring_failed", {
          search_id: context.searchId,
          batch: batchNumber,
          error: error instanceof Error ? error.message : String(error),
          job_id: context.jobId,
        });
        return [] as ScoredCandidateAssessment[];
      });

      deepCompletedCount += deepAssessments.length;
      const qualifiedAssessments = selectQualifiedAssessments(deepAssessments, hiringBrief);
      allDeepRows.push(
        ...buildBrightDataCandidateRows(
          profileBatch,
          qualifiedAssessments,
          qualifiedAssessments.length,
          "outreach_pool",
        ),
      );

      const previewLimit = Math.max(allDeepRows.length, allLightRows.length);
      if (previewLimit > 0) {
        const previewRows = tagPoolRows(
          allDeepRows,
          allLightRows,
          context.highlightCount,
          previewLimit,
        );
        await upsertCandidatesForSearch(context.searchId, previewRows);
      }

      logSearchEvent("search_pipeline_batch_completed", {
        search_id: context.searchId,
        batch: batchNumber,
        light_qualified_count: lightQualified.length,
        deep_completed_count: deepAssessments.length,
        deep_qualified_count: qualifiedAssessments.length,
        total_candidates_so_far: Math.max(allDeepRows.length, allLightRows.length),
        job_id: context.jobId,
      });
    }

    if (!totalScraped) {
      throw new Error("Bright Data returned no profiles");
    }

    const finalLimit = Math.max(allDeepRows.length, allLightRows.length);
    const finalRows =
      finalLimit > 0
        ? tagPoolRows(allDeepRows, allLightRows, context.highlightCount, finalLimit)
        : [];
    if (!finalRows.length) {
      throw new Error("No qualified candidates found");
    }

    const topPickCount = finalRows.filter(
      (row) => row.metadata?.pool_type === "top_pick",
    ).length;
    let warningMessage: string | null = null;
    if (topPickCount < context.highlightCount) {
      warningMessage = `Only ${topPickCount} highlighted candidate${topPickCount === 1 ? "" : "s"} met the current outreach threshold.`;
    }
    if (deepCompletedCount < deepRequestedCount) {
      warningMessage =
        "Some advanced profile scoring did not finish, but the current candidate pool is ready to review.";
    }

    const scored: SearchPipelineResult = {
      finalRows,
      warningMessage,
      displayStats: buildSearchDisplayStats({
        retrieval_count: retrievalCount,
        deep_review_requested_count: deepRequestedCount,
        deep_review_completed_count: deepCompletedCount,
        qualified_count: finalRows.length,
        outreach_pool_count: finalRows.length,
        shortlist_count: finalRows.length,
      }),
    };

    logSearchEvent("search_step_completed", {
      search_id: context.searchId,
      step: "deep_scoring",
      provider: "brightdata",
      result_count: scored.finalRows.length,
      scraped_count: totalScraped,
      shortlist_count: scored.displayStats.shortlist_count,
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
        deep_review_requested_count: preScreened.length,
        deep_review_completed_count: preScreened.length,
        qualified_count: fallbackRows.length,
        outreach_pool_count: fallbackRows.length,
        shortlist_count: fallbackRows.length,
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
) {
  const draftedRows =
    finalRows.length > 0
      ? await generateOutreachDraftsForRows(context, parsed, finalRows)
      : finalRows;

  if (draftedRows.length > 0) {
    await upsertCandidatesForSearch(context.searchId, draftedRows, {
      replaceMissing: true,
    });
  }

  await setSearchStatus(context.searchId, warningMessage ? "degraded" : "done", {
    done_at: nowIso(),
    error_message: null,
    warning_message: warningMessage ?? null,
    parsed_requirements: withDisplayStats(parsed, displayStats),
  });

  logSearchEvent(warningMessage ? "search_degraded" : "search_done", {
    search_id: context.searchId,
    candidate_count: draftedRows.length,
    warning_message: warningMessage ?? null,
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
    .select("id, user_id, jd_text, parsed_requirements, status, parse_completed_at")
    .eq("id", job.search_id)
    .single();

  if (!search) {
    throw new Error("Search not found");
  }

  const context: PipelineContext = {
    searchId: job.search_id,
    jobId: job.id,
    userId: job.user_id,
    jdText: job.jd_text || (search as SearchRow).jd_text,
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
      display_count: context.candidateCount,
      highlight_count:
        Number((search as SearchRow).parsed_requirements?.highlight_count) ||
        context.highlightCount,
      outreach_pool_target:
        Number((search as SearchRow).parsed_requirements?.outreach_pool_target) ||
        context.outreachPoolTarget,
      recall_provider: SEARCH_RECALL_PROVIDER,
      recall_spec: normalizeRecallSpec(
        (search as SearchRow).parsed_requirements?.recall_spec,
        context.candidateCount,
      ),
    }
    : await parseJobDescription(context, (search as SearchRow).parsed_requirements);

  const recallProvider: RecallProvider =
    SEARCH_RECALL_PROVIDER === "serper" ? "serper" : "brightdata_dataset";
  const fallbackProvider: RecallProvider | null =
    SEARCH_RECALL_FALLBACK_PROVIDER === "serper" ? "serper" : null;

  if (recallProvider === "brightdata_dataset") {
    try {
      const brightDataResult = await buildBrightDataDatasetCandidates(context, parsed);
      if (brightDataResult?.finalRows.length) {
        await completeSearch(
          context,
          parsed,
          brightDataResult.finalRows,
          brightDataResult.displayStats,
          brightDataResult.warningMessage,
        );
        return;
      }
    } catch (error) {
      if (error instanceof DatasetRecallPendingError) {
        throw error;
      }
      logSearchEvent("search_provider_failed", {
        search_id: context.searchId,
        provider: "brightdata_dataset",
        reason: error instanceof Error ? error.message : String(error),
        job_id: context.jobId,
      });
      if (fallbackProvider !== "serper") {
        throw error;
      }
    }
  }

  const serperResult = await buildSerperCandidates(context, parsed);
  if (!serperResult?.preScreened.length) {
    throw new Error(
      "No data source returned candidates. Please try again later.",
    );
  }

  const refinedResult = await refineSerperCandidates(
    context,
    parsed,
    serperResult.preScreened,
    serperResult.fallbackRows,
    serperResult.retrievalCount,
  );
  await completeSearch(
    context,
    parsed,
    refinedResult.finalRows,
    refinedResult.displayStats,
    refinedResult.warningMessage,
  );
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
