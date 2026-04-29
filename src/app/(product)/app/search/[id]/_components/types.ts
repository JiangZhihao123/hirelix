export type SearchRow = {
  id: string;
  title: string | null;
  jd_text: string;
  parsed_requirements: Record<string, unknown> | null;
  status: string;
  pipeline_step: string | null;
  error_message: string | null;
  warning_message?: string | null;
  queued_at?: string | null;
  parse_completed_at?: string | null;
  search_completed_at?: string | null;
  partial_ready_at?: string | null;
  done_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkHistoryItem = {
  title: string | null;
  company: string | null;
  start_date: string | null;
  end_date: string | null;
  summary?: string | null;
};

export type EducationItem = {
  school: string | null;
  degree: string | null;
  major: string | null;
  start_year?: string | null;
  end_year?: string | null;
};

export type ConstraintVerdict = {
  location_fit?: "local" | "nearby" | "non_local" | "unknown";
  work_model_fit?: "yes" | "no" | "unclear";
  must_have_coverage?: "strong" | "partial" | "weak" | "unknown";
};

export type ScoringBreakdown = {
  capability_score?: number;
  relevance_score?: number;
  join_likelihood_score?: number;
  join_likelihood_reasons?: string[];
  quality_score?: number;
  overall_score?: number;
  advance_score?: number;
};

export type CandidateSuitability = {
  fit_decision?: "strong_fit" | "viable_fit" | "risky_fit" | "reject";
  actionability?: "ready_to_act" | "needs_review" | "not_actionable";
  bucket?: "strong_now" | "consider_next" | "do_not_show";
  shortlist_decision?: "yes" | "no";
  shortlist_reason?: string | null;
  match_score?: number;
  quality_score?: number;
  overall_score?: number;
  advance_score?: number;
  advance_recommendation?: "advance" | "hold" | "reject";
  primary_risk?: string | null;
  first_contact_confidence?: "high" | "medium" | "low";
  subscription_trigger_score?: number;
  blocking_constraints?: string[];
  blocking_severity?: "hard" | "soft" | "none";
  scoring_breakdown?: ScoringBreakdown;
  constraint_verdicts?: ConstraintVerdict;
  constraint_risks?: string[];
  risk_flags?: string[];
  why_this_candidate?: string[];
  why_not_higher?: string[];
  evidence_quality?: "high" | "medium" | "low";
};

export type CandidateRow = {
  id: string;
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
  status: string;
  metadata: {
    work_history?: WorkHistoryItem[];
    education?: EducationItem[];
    analysis_stage?: string;
    preliminary?: boolean;
    pool_type?: "top_pick" | "outreach_pool" | "main" | "extended";
    display_tier?: "priority_outreach" | "worth_reviewing";
    quality_score?: number;
    overall_score?: number;
    advance_score?: number;
    advance_recommendation?: "advance" | "hold" | "reject";
    bucket?: "strong_now" | "consider_next" | "do_not_show";
    shortlist_decision?: "yes" | "no";
    shortlist_reason?: string | null;
    primary_risk?: string | null;
    first_contact_confidence?: "high" | "medium" | "low";
    subscription_trigger_score?: number;
    blocking_constraints?: string[];
    blocking_severity?: "hard" | "soft" | "none";
    quality_breakdown?: {
      capability_score?: number;
      relevance_score?: number;
    };
    suitability?: CandidateSuitability;
    scoring_breakdown?: ScoringBreakdown;
    constraint_verdicts?: ConstraintVerdict;
    constraint_risks?: string[];
    risk_flags?: string[];
    join_likelihood_reasons?: string[];
    why_not_higher?: string[];
    canonical_profile?: Record<string, unknown>;
    raw_profile?: Record<string, unknown>;
    about?: string | null;
    github_signals?: GithubSignals;
  } | null;
};

export type CandidateSortMode = "overall" | "capability" | "relevance" | "join_likelihood";

export type CandidateDisplayTier = "priority_outreach" | "worth_reviewing";

export type ExcludedReason =
  | "stack_gap"
  | "title_or_seniority_mismatch"
  | "location_or_work_model"
  | "evidence_too_weak"
  | "response_risk"
  | "multiple_risks";

export type SearchDisplayStats = {
  retrieval_count?: number;
  deep_review_count?: number;
  deep_review_requested_count?: number;
  deep_review_completed_count?: number;
  qualified_count?: number;
  outreach_pool_count?: number;
  shortlist_count?: number;
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
  judge_mode?: "single" | "dual";
  activation_run?: boolean;
  quality_floor_applied?: boolean;
  visible_candidate_count?: number;
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
  brief_ready_at?: string;
  first_shortlist_candidate_at?: string;
  reviewable_at?: string;
  time_to_ack_ms?: number;
  time_to_brief_ready_ms?: number;
  time_to_standard_recall_ready_ms?: number;
  time_to_first_shortlist_candidate_ms?: number;
  time_to_reviewable_ms?: number;
  time_to_done_ms?: number;
  excluded_reason_counts?: Array<{
    reason: ExcludedReason;
    count: number;
  }>;
};

export type RecallMetadataView = {
  snapshot_id?: string | null;
  requested_at?: string | null;
  completed_at?: string | null;
  standard_recall_requested_at?: string | null;
  standard_recall_completed_at?: string | null;
  all_recall_completed_at?: string | null;
};

export type GithubSignals = {
  status?: "queued" | "running" | "verified" | "missing_public_data" | "ambiguous_match" | "api_error";
  profile_url?: string | null;
  profile_login?: string | null;
  activity_trend?: string | null;
  top_languages?: string[];
  merged_pr_count?: number | null;
  commit_message_quality?: string | null;
  highlight?: string | null;
  discovery_confidence?: number;
  github_signal_score?: number | null;
  evidence_strength?: "strong" | "medium" | "weak" | "none";
  recruiter_summary?: string | null;
  outreach_angle?: string | null;
  verification_risks?: string[];
  discovery_notes?: string[];
  evidence_summary?: string[];
  last_enriched_at?: string | null;
};

export type SearchPageCacheSnapshot = {
  search: SearchRow;
  candidates: CandidateRow[];
};
