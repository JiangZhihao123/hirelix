import type { SearchPlanCode } from "@/lib/search-execution";

export const SEARCH_STATUS_VALUES = [
  "queued",
  "parsing",
  "searching",
  "screening",
  "deep_scoring",
  "done",
  "error",
] as const;

export type SearchStatus = (typeof SEARCH_STATUS_VALUES)[number];

export type SearchJobRow = {
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
  updated_at?: string | null;
};

export type SearchRow = {
  id: string;
  user_id: string;
  jd_text: string;
  parsed_requirements: Record<string, unknown> | null;
  status: string;
  parse_completed_at?: string | null;
};

export type CandidateRowInput = {
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

export type RecallSpec = {
  countries: string[];
  title_variants: string[];
  core_skill_terms: string[];
  differentiating_skill_terms: string[];
  baseline_skill_terms: string[];
  domain_terms: string[];
  location_terms: string[];
  strict_location_terms: string[];
  nearby_location_terms: string[];
  must_have_signals: string[];
  avoid_profiles: string[];
  geo_strategy: string | null;
  recall_confidence: "high" | "medium" | "low";
  role_breadth: "narrow" | "balanced" | "broad";
  lateral_title_variants: string[];
  target_companies: string[];
  sourcing_lanes: SourcingLane[];
  recall_strategy: "standard" | "multi_round";
  record_limit: number;
};

export type SourcingLane = {
  name: string;
  strategy: "title" | "skill" | "seniority" | "company";
  title_terms: string[];
  skill_terms: string[];
  company_terms: string[];
  avoid_terms: string[];
  budget_weight: number;
};

export type RecallProvider = "brightdata_dataset";

export type HiringBriefRoleCore = {
  title: string | null;
  seniority: string | null;
  function_focus: string | null;
  required_skills: string[];
  nice_to_have_skills: string[];
};

export type HiringBrief = {
  role_core: HiringBriefRoleCore;
  work_model: "onsite" | "hybrid" | "remote" | "unknown";
  location_scope: string | null;
  location_flexibility: "strict" | "moderate" | "flexible";
  relocation_allowed: "yes" | "no" | "unknown";
  must_have_constraints: string[];
  soft_constraints: string[];
  company_stage_expectation: "startup" | "growth" | "enterprise" | "unknown";
  screening_intent: string | null;
  candidate_count_strategy: "focused_shortlist" | "broader_shortlist";
  constraint_reasoning: string | null;
};

export type ConstraintVerdict = {
  location_fit: "local" | "nearby" | "non_local" | "unknown";
  work_model_fit: "yes" | "no" | "unclear";
  must_have_coverage: "strong" | "partial" | "weak" | "unknown";
};

export type CompanyProfile = {
  size: string | null;
  mission: string | null;
  benefits: string | null;
  tech_stack: string | null;
  selling_points: string | null;
};

export type ScoringBreakdown = {
  capability_score: number;
  relevance_score: number;
  join_likelihood_score: number;
  join_likelihood_reasons: string[];
  quality_score: number;
  overall_score: number;
  advance_score: number;
};

export type AdvanceRecommendation = "advance" | "hold" | "reject";
export type BlockingSeverity = "hard" | "soft" | "none";
export type ShortlistDecision = "yes" | "no";

export type CandidateSuitability = {
  fit_decision: "strong_fit" | "viable_fit" | "risky_fit" | "reject";
  actionability: "ready_to_act" | "needs_review" | "not_actionable";
  bucket: "strong_now" | "consider_next" | "do_not_show";
  match_score: number;
  quality_score: number;
  overall_score: number;
  advance_score: number;
  advance_recommendation: AdvanceRecommendation;
  primary_risk: string | null;
  first_contact_confidence: "high" | "medium" | "low";
  subscription_trigger_score: number;
  shortlist_decision: ShortlistDecision;
  shortlist_reason: string | null;
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

export type ScoredCandidateAssessment = {
  index: number;
  suitability: CandidateSuitability;
  skills: string[];
  experience_years: number | null;
  location: string | null;
  why_reachable_now?: string | null;
  scoring_method?:
    | "fast_judge_triage"
    | "single_judge_debug"
    | "single_judge_triage"
    | "selective_dual_review"
    | "dual_review_arbitrated";
  judge_delta?: number;
  judge_conflict?: boolean;
};

export type JudgeScoreResult = {
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
  shortlist_decision: ShortlistDecision;
  shortlist_reason: string | null;
  constraint_verdicts: ConstraintVerdict;
  evidence_quality: "high" | "medium" | "low";
  skills: string[];
  experience_years: number | null;
  location: string | null;
  why_reachable_now: string | null;
};

export type PipelineContext = {
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

export type LlmUsageEventPayload = {
  searchId?: string | null;
  jobId?: string | null;
  userId?: string | null;
  stage: string;
  status?: "success" | "error" | "timeout";
  model: string;
  provider?: string;
  attempt?: number;
  batchSize?: number | null;
  candidateIndexes?: number[] | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  cacheMissInputTokens?: number;
  maxOutputTokens?: number | null;
  thinking?: string | null;
  reasoningEffort?: string | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
  requestHash?: string | null;
  responseHash?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export type SearchDisplayStats = {
  retrieval_count: number;
  deep_review_count: number;
  deep_review_requested_count: number;
  deep_review_completed_count: number;
  qualified_count: number;
  outreach_pool_count: number;
  shortlist_count: number;
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
  judge_mode?: "single" | "dual";
  fast_judge_count?: number;
  deep_judge_count?: number;
  arbiter_count?: number;
  fast_judge_wall_time_ms?: number;
  deep_judge_wall_time_ms?: number;
  llm_wall_time_ms?: number;
  llm_input_tokens?: number;
  llm_output_tokens?: number;
  llm_cached_input_tokens?: number;
  llm_cache_miss_input_tokens?: number;
  llm_actual_estimated_cost?: number;
  activation_run?: boolean;
  quality_floor_applied?: boolean;
  visible_candidate_count?: number;
  promised_candidate_count?: number;
  delivered_candidate_count?: number;
  shortlist_underfilled?: boolean;
  pre_gate_blocked_count?: number;
  prescreen_blocked_count?: number;
  contact_unlock_candidates?: number;
  recall_profile_count?: number;
  priority_outreach_count?: number;
  worth_reviewing_count?: number;
  ruled_out_count?: number;
  strong_now_count?: number;
  consider_next_count?: number;
  do_not_show_count?: number;
  shortlist_yes_count?: number;
  shortlist_no_count?: number;
  clear_location_fit_count?: number;
  must_have_strong_count?: number;
  first_contact_confidence_count?: number;
  lower_priority_count?: number;
  recommended_count?: number;
  brief_ready_at?: string;
  first_shortlist_candidate_at?: string;
  reviewable_at?: string;
  time_to_ack_ms?: number;
  time_to_brief_ready_ms?: number;
  time_to_standard_recall_ready_ms?: number;
  time_to_first_shortlist_candidate_ms?: number;
  time_to_reviewable_ms?: number;
  time_to_done_ms?: number;
  excluded_reason_counts?: ExcludedReasonCount[];
};

export type SearchPipelineResult = {
  finalRows: CandidateRowInput[];
  displayStats: SearchDisplayStats;
  assessments?: ScoredCandidateAssessment[];
};

export type CandidateDisplayTier = "priority_outreach" | "worth_reviewing";

export type CandidateDeliveryBucket =
  | "reach_first"
  | "review_next"
  | "lower_priority"
  | "not_recommended";

export type ExcludedReason =
  | "stack_gap"
  | "title_or_seniority_mismatch"
  | "location_or_work_model"
  | "evidence_too_weak"
  | "response_risk"
  | "multiple_risks";

export type ExcludedReasonCount = {
  reason: ExcludedReason;
  count: number;
};

export type AdditionalRecallSnapshot = {
  round: string;
  snapshot_id?: string | null;
  records_limit?: number | null;
  filter_hash?: string | null;
  requested_count?: number | null;
  status?: "submitted" | "polling" | "ready" | "failed";
  submitted_at?: string | null;
  ready_at?: string | null;
  failed_at?: string | null;
  failure_code?: string | null;
  last_polled_at?: string | null;
  download_started_at?: string | null;
  download_completed_at?: string | null;
  completed_at?: string | null;
  profiles_returned?: number | null;
  poll_attempt_count?: number | null;
  download_attempt_count?: number | null;
  quality_distribution?: RecallRoundQualityDistribution | null;
};

export type RecallRoundQualityDistribution = {
  strong_now: number;
  consider_next: number;
  do_not_show: number;
  total_scored: number;
};

export type RecallRoundDiagnostics = {
  round: string;
  requested_count: number;
  returned_count?: number | null;
  filter_hash?: string | null;
  title_terms: string[];
  skill_signal_groups: {
    search_domain: string[];
    platform_engineering: string[];
  };
  location_mode: "country_only" | "location_filter";
  quality_distribution?: RecallRoundQualityDistribution | null;
};

export type RecallMetadata = {
  provider: RecallProvider;
  snapshot_id: string;
  additional_snapshots?: AdditionalRecallSnapshot[];
  dataset_size?: number | null;
  recall_latency_ms?: number | null;
  cost?: number | null;
  cost_source?: "metadata" | "balance_delta" | null;
  bright_balance_before?: number | null;
  bright_balance_after?: number | null;
  bright_profile_budget?: number | null;
  bright_profiles_requested?: number | null;
  bright_profiles_returned?: number | null;
  judge_mode?: "single" | "dual" | null;
  requested_at?: string | null;
  completed_at?: string | null;
  standard_recall_requested_at?: string | null;
  standard_recall_ready_at?: string | null;
  standard_recall_completed_at?: string | null;
  standard_download_started_at?: string | null;
  standard_download_completed_at?: string | null;
  all_recall_completed_at?: string | null;
  round_diagnostics?: RecallRoundDiagnostics[];
  status?: "submitted" | "polling" | "ready";
  filter_summary?: {
    title_terms: string[];
    country_codes: string[];
    location_terms?: string[];
    strict_location_terms?: string[];
    nearby_location_terms?: string[];
    must_have_signals?: string[];
    avoid_profiles?: string[];
  } | null;
};

export type SearchExecutionRuntime = {
  lightPrescreenMaxOutputTokens: number;
  judgeMaxOutputTokens: number;
  arbiterMaxOutputTokens: number;
  outreachMaxOutputTokens: number;
  judgeMaxAttempts: number;
  arbiterMaxAttempts: number;
  judgeMode: "single" | "dual";
};

export type SearchCostEstimate = {
  estimatedLlmCost: number;
  estimatedSearchTotalCost: number;
};
