export type ProviderName =
  | "deepseek"
  | "serper"
  | "exa"
  | "firecrawl"
  | "bright"
  | "github";

export type ProviderReadiness = {
  provider: ProviderName;
  required: boolean;
  configured: boolean;
  usable: boolean;
  status: "ready" | "missing" | "warning" | "error" | "skipped";
  message: string;
  details?: Record<string, unknown>;
};

export type SourcingRunMode = "dry-run" | "live";

export type SearchBudget = {
  totalUsdCap: number;
  brightUsdCap: number;
  allowPaid: boolean;
};

export type CostLedgerEntry = {
  ts: string;
  run_id: string;
  provider: ProviderName;
  operation: string;
  lane_id?: string | null;
  query?: string | null;
  estimated_cost_usd: number;
  actual_cost_usd: number | null;
  latency_ms: number | null;
  returned_count: number | null;
  status: "planned" | "success" | "blocked" | "error";
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderOperation =
  | "search"
  | "semantic_search"
  | "extract_url"
  | "bright_filter_probe";

export type ParsedSearchIntent = {
  role_family: string;
  target_title: string;
  seniority: string;
  must_have: string[];
  nice_to_have: string[];
  location: string | null;
  target_companies: string[];
  adjacent_backgrounds: string[];
  avoid: string[];
  notes: string[];
};

export type SourcingLane = {
  lane_id: string;
  type:
    | "title_xray"
    | "company_target"
    | "skill_evidence"
    | "adjacent_background"
    | "public_evidence"
    | "bright_probe";
  goal: string;
  provider_hints: ProviderName[];
  queries: Array<{
    provider: ProviderName;
    query: string;
  }>;
  must_keep: string[];
  relax_if_empty: string[];
  stop_conditions: string[];
  max_results: number;
};

export type CandidateLead = {
  lead_id: string;
  provider: ProviderName;
  lane_id: string;
  url: string;
  title: string | null;
  snippet: string | null;
  source_type: "linkedin" | "github" | "personal_site" | "company_page" | "article" | "other";
  source_confidence: "high" | "medium" | "low";
  raw: Record<string, unknown>;
};

export type CandidateCard = {
  candidate_id: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  profile_urls: string[];
  evidence_summary: string;
  source_mix: ProviderName[];
  lead_ids: string[];
};

export type LightScreenDecision = {
  candidate_id: string;
  would_advance: "yes" | "no" | "maybe";
  reason: string;
  deal_breaker: string | null;
  missing_evidence: string[];
  source_confidence: "high" | "medium" | "low";
  profile_completeness: "high" | "medium" | "low";
  outreach_angle: string | null;
  suggested_next_action: "contact" | "research_more" | "reject" | "expand_similar";
};

export type LaneDiagnosis = {
  lane_id: string;
  status: "expand" | "stop" | "revise_query" | "needs_more_evidence";
  failure_reason:
    | "none"
    | "query_too_narrow"
    | "query_too_broad"
    | "provider_coverage"
    | "budget_blocked"
    | "location_too_strict"
    | "jd_too_rare"
    | "provider_error"
    | "needs_enrichment";
  reason: string;
  recommended_change: string | null;
};

export type RunManifest = {
  run_id: string;
  created_at: string;
  mode: SourcingRunMode;
  jd_path: string;
  budget: SearchBudget;
  providers: ProviderName[];
  options?: Record<string, unknown>;
};
