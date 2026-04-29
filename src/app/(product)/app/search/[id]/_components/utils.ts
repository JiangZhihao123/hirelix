import { getSearchCompletionFollowUpCopy } from "@/lib/search-notification-config";
import type {
  CandidateDisplayTier,
  CandidateRow,
  ConstraintVerdict,
  ExcludedReason,
  GithubSignals,
  SearchPageCacheSnapshot,
} from "./types";

export const PRIORITY_OUTREACH_MIN_SCORE = 70;

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
  const explicitTier = candidate.metadata?.display_tier;
  if (explicitTier === "priority_outreach") {
    return safeScore >= PRIORITY_OUTREACH_MIN_SCORE ? "priority_outreach" : "worth_reviewing";
  }
  if (explicitTier === "worth_reviewing") {
    return "worth_reviewing";
  }
  const bucket = candidate.metadata?.bucket ?? candidate.metadata?.suitability?.bucket;
  if (bucket === "strong_now") {
    return safeScore >= PRIORITY_OUTREACH_MIN_SCORE ? "priority_outreach" : "worth_reviewing";
  }
  if (bucket === "consider_next") return "worth_reviewing";
  return null;
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
      suggestions.push("Accept a broader evidence mix instead of relying so heavily on public GitHub proof.");
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
      return "Medium evidence";
    case "weak":
      return "Weak evidence";
    default:
      return "LinkedIn-only";
  }
}

export function getEvidenceSourceLabel(signals: GithubSignals | null) {
  if (signals?.status === "verified") return "GitHub evidence";
  if (signals?.status === "queued" || signals?.status === "running") return "GitHub review pending";
  return "LinkedIn-only evidence";
}

export function getGithubBadge(signals: GithubSignals | null) {
  if (signals?.status === "verified") {
    return { text: "GitHub verified", className: "bg-emerald-50 text-emerald-700" };
  }
  if (signals?.status === "queued") {
    return { text: "GitHub pending", className: "bg-amber-50 text-amber-700" };
  }
  if (signals?.status === "running") {
    return { text: "GitHub pending", className: "bg-sky-50 text-sky-700" };
  }
  return { text: "LinkedIn only", className: "bg-blue-50 text-blue-700" };
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

export function getSearchErrorPresentation(errorMessage: string | null | undefined) {
  const normalized = (errorMessage || "").toLowerCase();
  if (normalized.includes("insufficient funds")) {
    return {
      title: "External profile provider balance is too low",
      body: "The LinkedIn search could not start due to a configuration issue on our end. Please retry or contact support.",
      hint: "Top up the provider balance, then retry this shortlist.",
    };
  }
  if (normalized.includes("timed out")) {
    return {
      title: "Profile recall took too long",
      body: "The external profile provider did not finish in time, so Hirelix could not continue this shortlist run.",
      hint: "Retrying is usually enough when the provider is temporarily slow.",
    };
  }
  if (normalized.includes("no candidates") || normalized.includes("no results")) {
    return {
      title: "No profiles made it through review",
      body: "Hirelix finished the search, but no recalled profiles passed the recruiter shortlist decision.",
      hint: "Try widening location, relaxing must-haves, or clarifying the JD before retrying.",
    };
  }
  return {
    title: "This shortlist run didn't finish",
    body: errorMessage || "We couldn't generate candidates for this shortlist.",
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
  return getCandidateScoringBreakdown(candidate)?.capability_score ?? 0;
}

export function getCandidateRelevanceScore(candidate: CandidateRow) {
  return getCandidateScoringBreakdown(candidate)?.relevance_score ?? 0;
}

export function getCandidateJoinLikelihoodScore(candidate: CandidateRow) {
  return getCandidateScoringBreakdown(candidate)?.join_likelihood_score ?? 0;
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
      label: "Capability",
      shortLabel: "Capability",
      score: breakdown?.capability_score,
      description: "Engineering depth, seniority, and ability to handle the role complexity.",
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

export function hasPublicGithubEvidence(candidate: CandidateRow) {
  const signals = getCandidateGithubSignals(candidate);
  return signals?.status === "verified" || Boolean(candidate.github_url);
}
