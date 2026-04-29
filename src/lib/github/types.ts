export type GithubSignalStatus =
  | "queued"
  | "running"
  | "verified"
  | "missing_public_data"
  | "ambiguous_match"
  | "api_error";

export type GithubDiscoverySource =
  | "explicit_url"
  | "owned_website"
  | "external_search"
  | "github_search"
  | "serper_search"
  | "none";

export type GithubEvidenceStrength = "strong" | "medium" | "weak" | "none";

export type GithubCandidateInput = {
  name: string;
  headline?: string | null;
  location?: string | null;
  skills?: string[];
  profileUrl?: string | null;
  githubUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  requiredSkills?: string[];
  searchId?: string | null;
  jobId?: string | null;
  userId?: string | null;
};

export type GithubIdentityEvidence = {
  name_match?: "exact" | "partial" | "none";
  company_match?: boolean;
  location_match?: boolean;
  website_backlink?: boolean;
  linkedin_or_profile_crosslink?: boolean;
  skill_overlap?: string[];
  source_urls?: string[];
  llm_identity_judged?: boolean;
  identity_resolution_version?: number;
};

export type GithubDiscoveryResult = {
  username: string | null;
  url: string | null;
  confidence: number;
  source: GithubDiscoverySource;
  notes: string[];
  evidence?: GithubIdentityEvidence;
};

export type GithubLanguageSignal = {
  name: string;
  weight: number;
};

export type GithubCommitMessageQuality = {
  label: "strong" | "mixed" | "weak" | "unknown";
  detail: string;
};

export type GithubSignals = {
  status: GithubSignalStatus;
  profile_login: string | null;
  profile_url: string | null;
  activity_trend: string | null;
  top_languages: string[];
  top_language_weights?: GithubLanguageSignal[];
  merged_pr_count: number | null;
  merged_pr_highlights?: MergedPrSignal["highlights"];
  commit_message_quality: string | null;
  highlight: string | null;
  discovery_confidence: number;
  identity_evidence?: GithubIdentityEvidence;
  github_signal_score: number | null;
  evidence_strength: GithubEvidenceStrength;
  recruiter_summary: string | null;
  outreach_angle: string | null;
  verification_risks: string[];
  discovery_notes: string[];
  evidence_summary: string[];
  last_enriched_at: string;
};

export type GithubEnrichmentResult = {
  githubUrl: string | null;
  githubSignals: GithubSignals;
  githubSignalScore: number | null;
  githubDiscoveryConfidence: number;
};

export type ContributionDay = {
  contributionCount: number;
  date: string;
};

export type RepositoryContributionSummary = {
  nameWithOwner: string;
  ownerLogin: string | null;
  url: string | null;
  languageWeights: GithubLanguageSignal[];
  contributionCount: number;
};

export type RecentCommitSample = {
  repo: string;
  message: string;
};

export type SerperGithubSearchResult = {
  link: string | null;
  title: string | null;
  snippet: string | null;
};

export type GithubEvidenceReadout = {
  evidenceStrength: GithubEvidenceStrength;
  recruiterSummary: string;
  outreachAngle: string;
  verificationRisks: string[];
};

export type MergedPrSignal = {
  count: number;
  highlights: Array<{
    repo: string | null;
    repo_url?: string | null;
    repo_description?: string | null;
    repo_primary_language?: string | null;
    repo_stargazers_count?: number | null;
    repo_topics?: string[];
    project_summary?: string | null;
    title: string | null;
    url: string | null;
  }>;
};

export type GithubRequestCategory =
  | "search_users"
  | "search_issues"
  | "user_lookup"
  | "repo_commits"
  | "graphql_contributions"
  | "graphql_other"
  | "other_rest";

export type GithubRequestTraceEntry = {
  category: GithubRequestCategory;
  path: string;
  status: number;
  resource: string | null;
  limit: number | null;
  remaining: number | null;
  used: number | null;
  resetAt: string | null;
  retryAfterMs: number | null;
  durationMs: number;
  rateLimited: boolean;
};

export type GithubRequestTrace = {
  candidateName: string;
  startedAt: number;
  requestCount: number;
  rateLimitHits: number;
  categoryCounts: Partial<Record<GithubRequestCategory, number>>;
  resourceCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  requests: GithubRequestTraceEntry[];
};
