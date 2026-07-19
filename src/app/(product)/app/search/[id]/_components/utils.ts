import { getSearchCompletionFollowUpCopy } from "@/lib/search-notification-config";
import type {
  CandidateDisplayTier,
  CandidateRow,
  CandidateSellingKit,
  ConstraintVerdict,
  ExcludedReason,
  GithubSignals,
  PublicEvidence,
  SearchPageCacheSnapshot,
} from "./types";

export const PRIORITY_OUTREACH_MIN_SCORE = 70;
const REACH_FIRST_MIN_REACHABILITY = 55;

export function getSearchPageCacheKey(id: string) {
  return `hirelix:search-page:${id}`;
}

export function readSearchPageCache(id: string | null | undefined): SearchPageCacheSnapshot | null {
  if (!id || typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(getSearchPageCacheKey(id));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SearchPageCacheSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.search || !Array.isArray(parsed.candidates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatConstraintValue(
  value: ConstraintVerdict["location_fit"] | ConstraintVerdict["work_model_fit"] | ConstraintVerdict["must_have_coverage"],
) {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDimensionLabel(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
  if (value >= 85) return "High";
  if (value >= 65) return "Good";
  if (value >= 40) return "Mixed";
  return "Low";
}

export function parseOutreach(draft: string | null): { subject: string; linkedin: string; email: string } {
  if (!draft) return { subject: "", linkedin: "", email: "" };
  // Try JSON format first (new format)
  try {
    const parsed = JSON.parse(draft);
    return {
      subject: parsed.subject || "",
      linkedin: parsed.linkedin || parsed.email || "",
      email: parsed.email || parsed.linkedin || "",
    };
  } catch {
    // Legacy format: "Subject: ...\n\nBody"
    const match = draft.match(/^Subject:\s*(.+?)\n\n([\s\S]*)$/i);
    if (match) return { subject: match[1].trim(), linkedin: match[2].trim(), email: match[2].trim() };
    return { subject: "", linkedin: draft, email: draft };
  }
}

export function positiveInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

export function formatDisplayCount(value: number) {
  if (value >= 100) return `${Math.floor(value / 50) * 50}+`;
  return `${value}`;
}

export function getCandidateDisplayTier(candidate: CandidateRow): CandidateDisplayTier | null {
  const safeScore = typeof candidate.match_score === "number" ? candidate.match_score : 0;
  const deliveryBucket = candidate.metadata?.delivery_bucket;
  const reachabilityScore = getCandidateJoinLikelihoodScoreValue(candidate);
  const hasLowReachability =
    typeof reachabilityScore === "number" && reachabilityScore < REACH_FIRST_MIN_REACHABILITY;
  const hasActiveJobSearchSignal = candidateHasActiveJobSearchSignal(candidate);

  if (deliveryBucket === "reach_first") {
    return hasLowReachability || hasActiveJobSearchSignal ? "worth_reviewing" : "priority_outreach";
  }
  if (deliveryBucket === "review_next") return "worth_reviewing";
  const explicitTier = candidate.metadata?.display_tier;
  if (explicitTier === "priority_outreach") {
    return safeScore >= PRIORITY_OUTREACH_MIN_SCORE && !hasLowReachability && !hasActiveJobSearchSignal
      ? "priority_outreach"
      : "worth_reviewing";
  }
  if (explicitTier === "worth_reviewing") {
    return "worth_reviewing";
  }
  const bucket = candidate.metadata?.bucket ?? candidate.metadata?.suitability?.bucket;
  if (bucket === "strong_now") {
    return safeScore >= PRIORITY_OUTREACH_MIN_SCORE && !hasLowReachability && !hasActiveJobSearchSignal
      ? "priority_outreach"
      : "worth_reviewing";
  }
  if (bucket === "consider_next") return "worth_reviewing";
  return null;
}

function candidateHasActiveJobSearchSignal(candidate: CandidateRow) {
  const metadata = candidate.metadata;
  const text = [
    candidate.headline,
    metadata?.primary_risk,
    metadata?.shortlist_reason,
    metadata?.suitability?.primary_risk,
    metadata?.suitability?.shortlist_reason,
    ...(metadata?.risk_flags || []),
    ...(metadata?.constraint_risks || []),
    ...(metadata?.why_not_higher || []),
    ...(metadata?.join_likelihood_reasons || []),
    ...(metadata?.suitability?.risk_flags || []),
    ...(metadata?.suitability?.why_not_higher || []),
    ...(metadata?.suitability?.scoring_breakdown?.join_likelihood_reasons || []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (!text) return false;
  return [
    "actively looking",
    "active looking",
    "looking for new",
    "looking for opportunities",
    "open to work",
    "opentowork",
    "open to opportunities",
    "seeking new",
    "seeking opportunities",
    "available immediately",
    "c2c",
    "c2h",
  ].some((term) => text.includes(term));
}

export function getCandidateDeliveryBucket(candidate: CandidateRow) {
  const explicit = candidate.metadata?.delivery_bucket;
  if (explicit === "reach_first") {
    return getCandidateDisplayTier(candidate) === "priority_outreach"
      ? "reach_first"
      : "review_next";
  }
  if (
    explicit === "review_next" ||
    explicit === "lower_priority" ||
    explicit === "not_recommended"
  ) {
    return explicit;
  }
  const tier = getCandidateDisplayTier(candidate);
  if (tier === "priority_outreach") return "reach_first";
  if (tier === "worth_reviewing") return "review_next";
  const suitability = candidate.metadata?.suitability;
  if (
    candidate.metadata?.blocking_severity === "hard" ||
    suitability?.blocking_severity === "hard" ||
    candidate.metadata?.advance_recommendation === "reject" ||
    suitability?.advance_recommendation === "reject" ||
    candidate.metadata?.bucket === "do_not_show" ||
    suitability?.bucket === "do_not_show"
  ) {
    return "not_recommended";
  }
  return "lower_priority";
}

export function formatDeliveryBucketLabel(candidate: CandidateRow) {
  switch (getCandidateDeliveryBucket(candidate)) {
    case "reach_first":
      return "Reach first";
    case "review_next":
      return "Review next";
    case "not_recommended":
      return "Not recommended";
    case "lower_priority":
    default:
      return "Lower priority";
  }
}

function candidateQualityScore(candidate: CandidateRow) {
  return candidate.metadata?.quality_score ??
    candidate.metadata?.scoring_breakdown?.quality_score ??
    getCandidateOverallScore(candidate);
}

function candidateAdvanceScore(candidate: CandidateRow) {
  return candidate.metadata?.advance_score ??
    candidate.metadata?.scoring_breakdown?.advance_score ??
    candidate.match_score;
}

function candidateTriggerScore(candidate: CandidateRow) {
  return candidate.metadata?.subscription_trigger_score ??
    candidate.metadata?.suitability?.subscription_trigger_score ??
    candidate.match_score;
}

function candidateDeliveryPriority(candidate: CandidateRow) {
  switch (getCandidateDeliveryBucket(candidate)) {
    case "reach_first":
      return 0;
    case "review_next":
      return 1;
    case "lower_priority":
      return 2;
    case "not_recommended":
      return 3;
    default:
      return 2;
  }
}

export function compareCandidatesForRecruiterRanking(left: CandidateRow, right: CandidateRow) {
  const leftFinalRank = typeof left.final_rank === "number" ? left.final_rank : Number.POSITIVE_INFINITY;
  const rightFinalRank = typeof right.final_rank === "number" ? right.final_rank : Number.POSITIVE_INFINITY;
  const leftRank = typeof left.metadata?.scored_rank === "number" ? left.metadata.scored_rank : Number.POSITIVE_INFINITY;
  const rightRank = typeof right.metadata?.scored_rank === "number" ? right.metadata.scored_rank : Number.POSITIVE_INFINITY;

  return (
    candidateDeliveryPriority(left) - candidateDeliveryPriority(right) ||
    leftFinalRank - rightFinalRank ||
    candidateQualityScore(right) - candidateQualityScore(left) ||
    candidateAdvanceScore(right) - candidateAdvanceScore(left) ||
    right.match_score - left.match_score ||
    candidateTriggerScore(right) - candidateTriggerScore(left) ||
    leftRank - rightRank
  );
}

export function formatTierLabel(value: CandidateDisplayTier) {
  return value === "priority_outreach" ? "Reach Out First" : "Worth Reviewing";
}

export function formatExcludedReasonLabel(reason: ExcludedReason) {
  switch (reason) {
    case "stack_gap":
      return "Stack or must-have gap";
    case "title_or_seniority_mismatch":
      return "Title or seniority mismatch";
    case "location_or_work_model":
      return "Location or work model mismatch";
    case "evidence_too_weak":
      return "Evidence too weak";
    case "response_risk":
      return "Response risk";
    case "multiple_risks":
    default:
      return "Multiple risks";
  }
}

export function buildWidenPoolSuggestions(
  excludedReasonCounts: Array<{ reason: ExcludedReason; count: number }>,
) {
  const uniqueReasons = excludedReasonCounts
    .filter((item) => item.count > 0)
    .map((item) => item.reason);
  const suggestions: string[] = [];

  for (const reason of uniqueReasons) {
    if (reason === "location_or_work_model") {
      suggestions.push("Loosen location or remote constraints to recover candidates who fit the role but missed the current work-model filter.");
    } else if (reason === "stack_gap") {
      suggestions.push("Downgrade one or two must-have technologies to preferred so strong adjacent profiles can move into review.");
    } else if (reason === "title_or_seniority_mismatch") {
      suggestions.push("Widen the accepted title family or seniority band so adjacent profiles can enter the review pool.");
    } else if (reason === "evidence_too_weak") {
      suggestions.push("Accept a broader evidence mix, or research only the candidates who need citable proof.");
    } else if (reason === "response_risk") {
      suggestions.push("Relax tenure or company-stage assumptions if you want more candidates who may still be reachable.");
    } else if (reason === "multiple_risks") {
      suggestions.push("Review the JD for combined constraints that may be stacking together and squeezing the pool too hard.");
    }
    if (suggestions.length >= 3) break;
  }

  return suggestions;
}

// LinkedIn scraper strips newlines without inserting spaces, so sentence boundaries appear as
// "sentence one.Next sentence". This fixes that by adding a space after sentence-ending
// punctuation followed immediately by a capital letter.
export function fixSentenceSpacing(text: string): string {
  return text.replace(/([.!?])([A-Z])/g, "$1 $2");
}

export function formatLocationFlexibilityTag(value: string) {
  switch (value) {
    case "strict":
      return "strict location";
    case "flexible":
      return "location flexible";
    default:
      return value.replace(/_/g, " ");
  }
}

export function formatRelocationTag(value: string) {
  switch (value) {
    case "no":
      return "no relocation";
    case "yes":
      return "relocation okay";
    default:
      return `relocation ${value.replace(/_/g, " ")}`;
  }
}

export function deriveCurrentCompany(candidate: CandidateRow) {
  const fromWorkHistory = candidate.metadata?.work_history?.find((entry) => entry.company)?.company?.trim();
  if (fromWorkHistory) return fromWorkHistory;
  const headline = candidate.headline || "";
  const match = headline.match(/\bat\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function deriveCurrentRole(candidate: CandidateRow) {
  const fromWorkHistory = candidate.metadata?.work_history?.find((entry) => entry.title)?.title?.trim();
  if (fromWorkHistory) return fromWorkHistory;
  const headline = candidate.headline || "";
  return headline.split(" at ")[0]?.trim() || headline || "LinkedIn profile";
}

export function formatEvidenceStrength(value: GithubSignals["evidence_strength"]) {
  switch (value) {
    case "strong":
      return "Strong evidence";
    case "medium":
      return "Moderate evidence";
    case "weak":
      return "Light evidence";
    default:
      return "Profile fit reviewed";
  }
}

export function formatRecruiterSellingHeadline(
  candidate: CandidateRow,
  options: { hidePublicEvidence?: boolean } = {},
) {
  const sellingKit = getCandidateSellingKit(candidate);
  if (options.hidePublicEvidence && sellingKit?.evidence_basis === "public_evidence") {
    return null;
  }
  const pitch = sellingKit?.one_line_pitch?.trim();
  if (!pitch) return null;

  const normalized = pitch
    .replace(/^LinkedIn-based\s*:?\s*/i, "")
    .replace(/^Based on LinkedIn,\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]\s*$/, "");
  const safeNormalized = hidePublicEvidenceLine(normalized);
  if (!safeNormalized) return null;

  if (safeNormalized.length <= 92) return safeNormalized;

  const breakpoint = Math.max(
    safeNormalized.lastIndexOf(" + ", 92),
    safeNormalized.lastIndexOf(" with ", 92),
    safeNormalized.lastIndexOf(", ", 92),
    safeNormalized.lastIndexOf(" and ", 92),
  );
  const end = breakpoint >= 52 ? breakpoint : 89;
  return `${safeNormalized.slice(0, end).trim()}...`;
}

export function getEvidenceSourceLabel(signals: GithubSignals | null) {
  if (signals?.status === "verified") return "Research ready";
  if (signals?.status === "ambiguous_match") return "Research needs review";
  if (signals?.status === "queued" || signals?.status === "running") return "Research pending";
  return "Profile fit";
}

export function getGithubBadge(signals: GithubSignals | null) {
  if (signals?.status === "verified") {
    return { text: "Research ready", className: "bg-emerald-50 text-emerald-700" };
  }
  if (signals?.status === "queued") {
    return { text: "Research pending", className: "bg-amber-50 text-amber-700" };
  }
  if (signals?.status === "running") {
    return { text: "Research pending", className: "bg-sky-50 text-sky-700" };
  }
  if (signals?.status === "ambiguous_match") {
    return { text: "Evidence needs review", className: "bg-violet-50 text-violet-700" };
  }
  if (signals?.status === "missing_public_data") {
    return { text: "Profile fit reviewed", className: "bg-slate-100 text-slate-600" };
  }
  if (signals?.status === "api_error") {
    return { text: "Public check unavailable", className: "bg-rose-50 text-rose-700" };
  }
  return { text: "Profile fit reviewed", className: "bg-blue-50 text-blue-700" };
}

export function formatElapsedMinutes(ms: number | null) {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return "just now";
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatStartedAgo(value: string) {
  const elapsedMs = Math.max(0, Date.now() - Date.parse(value));
  return formatElapsedMinutes(elapsedMs);
}

export function getProviderDelayCopy(elapsedMs: number | null, emailEnabled: boolean) {
  if (!elapsedMs || elapsedMs < 180_000) {
    return "Scanning LinkedIn profiles now. Broader searches cover a larger pool and may take a few minutes.";
  }
  if (elapsedMs < 360_000) {
    return "This search is covering a wider pool than usual. Results will be more comprehensive.";
  }
  return `This is taking a bit longer than usual. ${getSearchCompletionFollowUpCopy(emailEnabled)}.`;
}

export function getSearchErrorPresentation(parsedRequirements?: Record<string, unknown> | null) {
  if (parsedRequirements?.search_error_type === "zero_recall") {
    return {
      title: "No matching profiles were found",
      body: "The search finished without usable LinkedIn profiles for the current constraints.",
      hint: "This run has been released from your client-role allowance. Broaden the JD or retry with wider criteria.",
    };
  }

  return {
    title: "This shortlist run didn't finish",
    body: "Hirelix couldn't finish this search. The detailed error has been logged for debugging.",
    hint: "Retry from here, or tighten the JD if the role is too vague.",
  };
}

export function getCandidateScoringBreakdown(candidate: CandidateRow) {
  return candidate.metadata?.scoring_breakdown || candidate.metadata?.suitability?.scoring_breakdown;
}

export function getCandidateOverallScore(candidate: CandidateRow) {
  return (
    candidate.metadata?.overall_score ??
    candidate.metadata?.advance_score ??
    candidate.metadata?.suitability?.overall_score ??
    candidate.metadata?.suitability?.advance_score ??
    getCandidateScoringBreakdown(candidate)?.overall_score ??
    getCandidateScoringBreakdown(candidate)?.advance_score ??
    candidate.match_score
  );
}

export function getCandidateCapabilityScore(candidate: CandidateRow) {
  return (
    candidate.metadata?.technical_evidence_score ??
    getCandidateScoringBreakdown(candidate)?.technical_evidence_score ??
    getCandidateScoringBreakdown(candidate)?.capability_score ??
    0
  );
}

export function getCandidateRelevanceScore(candidate: CandidateRow) {
  return getCandidateScoringBreakdown(candidate)?.relevance_score ?? 0;
}

function getCandidateJoinLikelihoodScoreValue(candidate: CandidateRow) {
  const value = getCandidateScoringBreakdown(candidate)?.join_likelihood_score;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getCandidateJoinLikelihoodScore(candidate: CandidateRow) {
  return getCandidateJoinLikelihoodScoreValue(candidate) ?? 0;
}

export function getCandidateScoreMetrics(candidate: CandidateRow) {
  const breakdown = getCandidateScoringBreakdown(candidate);
  return [
    {
      key: "overall",
      label: "Overall",
      shortLabel: "Overall",
      score: getCandidateOverallScore(candidate),
      description: "Best single ranking signal for who to review first.",
    },
    {
      key: "capability",
      label: "Technical Fit",
      shortLabel: "Tech",
      score: getCandidateCapabilityScore(candidate),
      description: "Engineering depth from the profile, strengthened by candidate research when you run it.",
    },
    {
      key: "role_fit",
      label: "Role Fit",
      shortLabel: "Role Fit",
      score: breakdown?.relevance_score,
      description: "Direct match to the JD, domain, title family, and required stack.",
    },
    {
      key: "reachability",
      label: "Reachability",
      shortLabel: "Reachability",
      score: breakdown?.join_likelihood_score,
      description: "How realistic this person is to contact now, given mobility and logistics signals.",
    },
  ];
}

export function getCandidateGithubSignals(candidate: CandidateRow): GithubSignals | null {
  const value = candidate.metadata?.github_signals;
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    status:
      item.status === "queued" ||
      item.status === "running" ||
      item.status === "verified" ||
      item.status === "missing_public_data" ||
      item.status === "ambiguous_match" ||
      item.status === "api_error"
        ? item.status
        : undefined,
    profile_url: typeof item.profile_url === "string" ? item.profile_url : null,
    profile_login: typeof item.profile_login === "string" ? item.profile_login : null,
    activity_trend:
      typeof item.activity_trend === "string" ? item.activity_trend : null,
    top_languages: Array.isArray(item.top_languages)
      ? item.top_languages.filter((entry): entry is string => typeof entry === "string")
      : [],
    merged_pr_count:
      typeof item.merged_pr_count === "number" ? item.merged_pr_count : null,
    commit_message_quality:
      typeof item.commit_message_quality === "string"
        ? item.commit_message_quality
        : null,
    highlight: typeof item.highlight === "string" ? item.highlight : null,
    discovery_confidence:
      typeof item.discovery_confidence === "number" ? item.discovery_confidence : undefined,
    identity_evidence:
      item.identity_evidence && typeof item.identity_evidence === "object"
        ? (item.identity_evidence as GithubSignals["identity_evidence"])
        : undefined,
    github_signal_score:
      typeof item.github_signal_score === "number" ? item.github_signal_score : null,
    evidence_strength:
      item.evidence_strength === "strong" ||
      item.evidence_strength === "medium" ||
      item.evidence_strength === "weak" ||
      item.evidence_strength === "none"
        ? item.evidence_strength
        : undefined,
    recruiter_summary:
      typeof item.recruiter_summary === "string" ? item.recruiter_summary : null,
    outreach_angle:
      typeof item.outreach_angle === "string" ? item.outreach_angle : null,
    verification_risks: Array.isArray(item.verification_risks)
      ? item.verification_risks.filter((entry): entry is string => typeof entry === "string")
      : [],
    discovery_notes: Array.isArray(item.discovery_notes)
      ? item.discovery_notes.filter((entry): entry is string => typeof entry === "string")
      : [],
    evidence_summary: Array.isArray(item.evidence_summary)
      ? item.evidence_summary.filter((entry): entry is string => typeof entry === "string")
      : [],
    last_enriched_at: typeof item.last_enriched_at === "string" ? item.last_enriched_at : null,
  };
}

export function getCandidatePublicEvidence(candidate: CandidateRow): PublicEvidence | null {
  const value = candidate.metadata?.public_evidence;
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    status:
      item.status === "queued" ||
      item.status === "running" ||
      item.status === "verified" ||
      item.status === "partial" ||
      item.status === "missing" ||
      item.status === "error"
        ? item.status
        : undefined,
    score: typeof item.score === "number" ? item.score : null,
    summary: typeof item.summary === "string" ? item.summary : null,
    source_counts:
      item.source_counts && typeof item.source_counts === "object"
        ? (item.source_counts as Record<string, number>)
        : {},
    items: Array.isArray(item.items)
      ? item.items
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .filter((entry) => entry.selling_tier !== "not_usable")
          .map((entry) => ({
            citation_label: typeof entry.citation_label === "string" ? entry.citation_label : null,
            source_type: typeof entry.source_type === "string" ? entry.source_type : null,
            source_url: typeof entry.source_url === "string" ? entry.source_url : null,
            title: typeof entry.title === "string" ? entry.title : null,
            publication:
              entry.publication && typeof entry.publication === "object"
                ? {
                    title:
                      typeof (entry.publication as Record<string, unknown>).title === "string"
                        ? ((entry.publication as Record<string, unknown>).title as string)
                        : null,
                    venue:
                      typeof (entry.publication as Record<string, unknown>).venue === "string"
                        ? ((entry.publication as Record<string, unknown>).venue as string)
                        : null,
                    year:
                      typeof (entry.publication as Record<string, unknown>).year === "string"
                        ? ((entry.publication as Record<string, unknown>).year as string)
                        : null,
                    authors: Array.isArray((entry.publication as Record<string, unknown>).authors)
                      ? ((entry.publication as Record<string, unknown>).authors as unknown[]).filter(
                          (author): author is string => typeof author === "string",
                        )
                      : [],
                    citation_count:
                      typeof (entry.publication as Record<string, unknown>).citation_count === "number"
                        ? ((entry.publication as Record<string, unknown>).citation_count as number)
                        : null,
                  }
                : null,
            identity_confidence:
              typeof entry.identity_confidence === "number" ? entry.identity_confidence : null,
            relevance_score:
              typeof entry.relevance_score === "number" ? entry.relevance_score : null,
            evidence_strength:
              entry.evidence_strength === "strong" ||
              entry.evidence_strength === "medium" ||
              entry.evidence_strength === "weak"
                ? entry.evidence_strength
                : undefined,
            evidence_summary:
              typeof entry.evidence_summary === "string" ? entry.evidence_summary : null,
            outreach_angle:
              typeof entry.outreach_angle === "string" ? entry.outreach_angle : null,
            evidence_category:
              entry.evidence_category === "engineering_proof" ||
              entry.evidence_category === "official_project_credit" ||
              entry.evidence_category === "research_publication" ||
              entry.evidence_category === "technical_writing" ||
              entry.evidence_category === "package_or_tool" ||
              entry.evidence_category === "identity_support" ||
              entry.evidence_category === "risk_only"
                ? entry.evidence_category
                : undefined,
            selling_tier:
              entry.selling_tier === "strong_selling_point" ||
              entry.selling_tier === "supporting_point" ||
              entry.selling_tier === "identity_only" ||
              entry.selling_tier === "not_usable"
                ? entry.selling_tier
                : undefined,
            safe_to_use_in_outreach:
              typeof entry.safe_to_use_in_outreach === "boolean"
                ? entry.safe_to_use_in_outreach
                : undefined,
            safe_to_use_in_client_brief:
              typeof entry.safe_to_use_in_client_brief === "boolean"
                ? entry.safe_to_use_in_client_brief
                : undefined,
            claim_limit:
              typeof entry.claim_limit === "string" ? entry.claim_limit : null,
          }))
      : [],
    last_enriched_at: typeof item.last_enriched_at === "string" ? item.last_enriched_at : null,
  };
}

export function getCandidateSellingKit(candidate: CandidateRow): CandidateSellingKit | null {
  const value = candidate.metadata?.selling_kit;
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const clientBrief = item.client_brief && typeof item.client_brief === "object"
    ? item.client_brief as Record<string, unknown>
    : null;
  return {
    version: item.version === 1 ? 1 : undefined,
    evidence_basis:
      item.evidence_basis === "public_evidence" || item.evidence_basis === "linkedin_based"
        ? item.evidence_basis
        : undefined,
    recommendation:
      item.recommendation === "reach_out_first" ||
      item.recommendation === "backup" ||
      item.recommendation === "do_not_pitch"
        ? item.recommendation
        : undefined,
    one_line_pitch: typeof item.one_line_pitch === "string" ? item.one_line_pitch : null,
    outreach_opener: typeof item.outreach_opener === "string" ? item.outreach_opener : null,
    client_brief: clientBrief
      ? {
          positioning:
            typeof clientBrief.positioning === "string" ? clientBrief.positioning : null,
          why_match: Array.isArray(clientBrief.why_match)
            ? clientBrief.why_match.filter((entry): entry is string => typeof entry === "string")
            : [],
          evidence_refs: Array.isArray(clientBrief.evidence_refs)
            ? clientBrief.evidence_refs.filter((entry): entry is string => typeof entry === "string")
            : [],
          risks_to_verify: Array.isArray(clientBrief.risks_to_verify)
            ? clientBrief.risks_to_verify.filter((entry): entry is string => typeof entry === "string")
            : [],
        }
      : null,
    evidence_badges: Array.isArray(item.evidence_badges)
      ? item.evidence_badges
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .map((entry) => ({
            label: typeof entry.label === "string" ? entry.label : null,
            tier:
              entry.tier === "strong" ||
              entry.tier === "medium" ||
              entry.tier === "weak"
                ? entry.tier
                : undefined,
            citation_label:
              typeof entry.citation_label === "string" ? entry.citation_label : null,
          }))
      : [],
    risk_flags: Array.isArray(item.risk_flags)
      ? item.risk_flags.filter((entry): entry is string => typeof entry === "string")
      : [],
    generated_at: typeof item.generated_at === "string" ? item.generated_at : null,
  };
}

export function hasPublicGithubEvidence(candidate: CandidateRow) {
  const signals = getCandidateGithubSignals(candidate);
  return signals?.status === "verified";
}

export function hasVerifiedPublicEvidence(candidate: CandidateRow) {
  const publicEvidence = getCandidatePublicEvidence(candidate);
  return (
    publicEvidence?.items?.some(
      (item) =>
        item.safe_to_use_in_client_brief === true ||
        item.safe_to_use_in_outreach === true ||
        item.selling_tier === "strong_selling_point" ||
        item.selling_tier === "supporting_point",
    ) || false
  );
}

export function getCandidateTrustLabel(
  candidate: CandidateRow,
  options: { hidePublicEvidence?: boolean } = {},
) {
  const publicEvidence = options.hidePublicEvidence ? null : getCandidatePublicEvidence(candidate);
  const sellingKit = getCandidateSellingKit(candidate);
  const safePublicEvidenceCount = publicEvidence?.items?.filter(
    (item) =>
      item.safe_to_use_in_client_brief === true ||
      item.safe_to_use_in_outreach === true ||
      item.selling_tier === "strong_selling_point" ||
      item.selling_tier === "supporting_point",
  ).length ?? 0;

  if (safePublicEvidenceCount > 0) {
    return {
      label: "Research ready",
      tone: "strong" as const,
      description: "Research-backed proof is available for the client brief or outreach.",
    };
  }

  if (sellingKit?.evidence_basis === "linkedin_based") {
    return {
      label: "Profile fit reviewed",
      tone: "medium" as const,
      description: "Ranking is based on profile facts. Research this candidate when they are worth deeper review.",
    };
  }

  return {
    label: "Fit reviewed",
    tone: "medium" as const,
    description: "Hirelix scored the profile fit and risks. Candidate research can be added on demand.",
  };
}

function isUsefulProofLine(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  const weakPhrases = [
    "queued",
    "pending",
    "not verified",
    "no public",
    "could not",
    "not available",
    "missing",
    "failed",
    "still looks worth reviewing",
    "profile fit worth reviewing",
    "run a public evidence deep dive before citing",
    "public engineering evidence has not been researched",
  ];
  return !weakPhrases.some((phrase) => normalized.includes(phrase));
}

export function hidePublicEvidenceLine(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const publicEvidenceFallbackPhrases = [
    "no public github evidence was verified",
    "still looks worth reviewing from linkedin",
    "run a public evidence deep dive before citing",
    "public engineering evidence has not been researched",
  ];
  if (publicEvidenceFallbackPhrases.some((phrase) => normalized.includes(phrase))) {
    return null;
  }
  return value;
}

export function getCandidateDecisionAudit(
  candidate: CandidateRow,
  rank?: number,
  options: { hidePublicEvidence?: boolean } = {},
) {
  const sellingKit = getCandidateSellingKit(candidate);
  const publicEvidence = options.hidePublicEvidence ? null : getCandidatePublicEvidence(candidate);
  const trust = getCandidateTrustLabel(candidate, options);
  const deliveryBucket = getCandidateDeliveryBucket(candidate);
  const currentRole = deriveCurrentRole(candidate);
  const currentCompany = deriveCurrentCompany(candidate);
  const score = getCandidateOverallScore(candidate);
  const proofLines = [
    ...(sellingKit?.client_brief?.evidence_refs || []),
    ...(publicEvidence?.items || [])
      .filter(
        (item) =>
          item.safe_to_use_in_client_brief === true ||
          item.safe_to_use_in_outreach === true ||
          item.selling_tier === "strong_selling_point" ||
          item.selling_tier === "supporting_point",
      )
      .map((item) => item.evidence_summary)
      .filter((item): item is string => Boolean(item)),
    ...(sellingKit?.client_brief?.why_match || []),
    ...candidate.match_reasons,
  ]
    .map((line) => (options.hidePublicEvidence ? hidePublicEvidenceLine(line) : line))
    .filter((line): line is string => typeof line === "string" && isUsefulProofLine(line));
  const riskLines = [
    ...(sellingKit?.client_brief?.risks_to_verify || []),
    ...(sellingKit?.risk_flags || []),
    ...(candidate.metadata?.risk_flags || []),
    ...(candidate.metadata?.suitability?.risk_flags || []),
    ...(candidate.metadata?.why_not_higher || []),
  ].filter(Boolean);
  const uniqueProof = Array.from(new Set(proofLines)).slice(0, 3);
  const uniqueRisks = Array.from(new Set(riskLines)).slice(0, 3);
  const hasCitableProof = uniqueProof.length > 0;
  const hasStrongEvidence = trust.tone === "strong" && hasCitableProof;
  const hasMediumEvidence = trust.tone === "medium" && hasCitableProof;
  const nextAction =
    deliveryBucket === "not_recommended"
      ? "Use as market coverage. Do not pitch unless the recruiter overrides the risks."
      : deliveryBucket === "lower_priority"
        ? "Keep as longlist context. Review only after stronger candidates are exhausted."
        : sellingKit?.recommendation === "do_not_pitch" ||
    candidate.metadata?.suitability?.advance_recommendation === "reject"
          ? "Hold. Review the risk before outreach."
          : hasStrongEvidence && score >= 80
            ? "Contact first. Use the strongest proof line in the opener."
            : hasStrongEvidence || hasMediumEvidence
              ? "Review then contact. Confirm fit before sending."
              : "Review fit and risks before outreach.";
  const rankPrefix = typeof rank === "number" ? `#${rank}: ` : "";
  const rankingReason = `${rankPrefix}${currentRole}${currentCompany ? ` at ${currentCompany}` : ""} is prioritized because ${
    uniqueProof[0] || "the profile shows relevant role evidence"
  }${uniqueRisks[0] ? ` Main uncertainty: ${uniqueRisks[0]}` : "."}`;

  return {
    trust,
    proofLines: uniqueProof.length > 0 ? uniqueProof : ["Profile facts support initial review; research the candidate when you need citable proof."],
    riskLines: uniqueRisks,
    nextAction,
    rankingReason,
  };
}
