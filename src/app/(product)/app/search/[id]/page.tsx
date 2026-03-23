"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import { ResultPageSkeleton } from "@/components/ProductSkeletons";
import { supabase } from "@/lib/supabase";
import { useBilling } from "@/lib/use-billing";
import {
  isReviewableSearchStatus,
  isRunningSearchStatus,
  getStalledSearchMessage,
  isOlderThanMinutes,
  isStaleProcessingSearch,
} from "@/lib/search-state";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromBrowser,
  trackEvent,
} from "@/lib/analytics";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  Briefcase,
  Mail,
  ExternalLink,
  AlertCircle,
  Search,
  RotateCcw,
  FileText,
  Users,
  Star,
  Send,
  Download,
  Eye,
  EyeOff,
  Github,
  ChevronsUp,
  GraduationCap,
  Building2,
} from "lucide-react";

type SearchRow = {
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

type WorkHistoryItem = {
  title: string | null;
  company: string | null;
  start_date: string | null;
  end_date: string | null;
  summary?: string | null;
};

type EducationItem = {
  school: string | null;
  degree: string | null;
  major: string | null;
  start_year?: string | null;
  end_year?: string | null;
};

type ConstraintVerdict = {
  location_fit?: "local" | "nearby" | "non_local" | "unknown";
  work_model_fit?: "yes" | "no" | "unclear";
  must_have_coverage?: "strong" | "partial" | "weak" | "unknown";
};

type ScoringBreakdown = {
  capability_score?: number;
  relevance_score?: number;
  join_likelihood_score?: number;
  join_likelihood_reasons?: string[];
  quality_score?: number;
  overall_score?: number;
  advance_score?: number;
};

type CandidateSuitability = {
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

type CandidateRow = {
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
  } | null;
};

type CandidateSortMode = "overall" | "capability" | "relevance" | "join_likelihood";

type SearchDisplayStats = {
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
  search_phase_count?: number;
  judge_mode?: "single" | "dual";
  activation_run?: boolean;
  quality_floor_applied?: boolean;
  visible_candidate_count?: number;
  pre_gate_blocked_count?: number;
  prescreen_blocked_count?: number;
  contact_unlock_candidates?: number;
  recall_profile_count?: number;
  topup_triggered?: boolean;
  strong_now_count?: number;
  consider_next_count?: number;
  do_not_show_count?: number;
  shortlist_yes_count?: number;
  shortlist_no_count?: number;
  clear_location_fit_count?: number;
  must_have_strong_count?: number;
  first_contact_confidence_count?: number;
  first_shortlist_candidate_at?: string;
  reviewable_at?: string;
  time_to_ack_ms?: number;
  time_to_standard_recall_ready_ms?: number;
  time_to_first_shortlist_candidate_ms?: number;
  time_to_reviewable_ms?: number;
  time_to_done_ms?: number;
  serper_query_tier_stats?: Array<{
    tier: "P0" | "P1" | "P2";
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
  }>;
};

type RecallMetadataView = {
  requested_at?: string | null;
  completed_at?: string | null;
  standard_recall_requested_at?: string | null;
  standard_recall_completed_at?: string | null;
  all_recall_completed_at?: string | null;
};

const avatarColors = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
];

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const colorIdx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarColors.length;
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarColors[colorIdx]} text-white text-sm font-bold`}>
      {initials}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90
      ? "bg-green-100 text-green-700"
      : score >= 75
        ? "bg-blue-100 text-blue-700"
        : score >= 60
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}
    >
      {score}% overall
    </span>
  );
}

function ActionabilityBadge({ candidate }: { candidate: CandidateRow }) {
  const actionability = candidate.metadata?.suitability?.actionability;
  const fitDecision = candidate.metadata?.suitability?.fit_decision;
  const advanceRecommendation = candidate.metadata?.advance_recommendation ||
    candidate.metadata?.suitability?.advance_recommendation;
  const blockingSeverity = candidate.metadata?.blocking_severity ||
    candidate.metadata?.suitability?.blocking_severity;

  if (advanceRecommendation === "reject" && blockingSeverity === "hard") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        Hard blocker
      </span>
    );
  }

  if (blockingSeverity === "soft" || advanceRecommendation === "hold") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        Needs review
      </span>
    );
  }

  if (fitDecision === "risky_fit" || actionability === "not_actionable") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        Constraint risk
      </span>
    );
  }

  if (actionability === "needs_review" || fitDecision === "viable_fit") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
        Needs review
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      Ready to act
    </span>
  );
}

function formatConstraintValue(
  value: ConstraintVerdict["location_fit"] | ConstraintVerdict["work_model_fit"] | ConstraintVerdict["must_have_coverage"],
) {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDimensionLabel(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
  if (value >= 85) return "High";
  if (value >= 65) return "Good";
  if (value >= 40) return "Mixed";
  return "Low";
}

function parseOutreach(draft: string | null): { subject: string; linkedin: string; email: string } {
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

function positiveInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function formatDisplayCount(value: number) {
  if (value >= 100) return `${Math.floor(value / 50) * 50}+`;
  if (value >= 10) return `${Math.floor(value / 5) * 5}+`;
  return `${value}`;
}

function formatElapsedMinutes(ms: number | null) {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return "just now";
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function getProviderDelayCopy(elapsedMs: number | null) {
  if (!elapsedMs || elapsedMs < 90_000) {
    return "Hirelix accepted the search and is waiting for Bright Data to return the first profile batch.";
  }
  if (elapsedMs < 210_000) {
    return "Bright Data recall is taking longer than usual, but this still looks like a normal provider delay.";
  }
  return "Bright Data recall is unusually slow right now. You can leave this page and come back once the shortlist starts to grow.";
}

function getSearchErrorPresentation(errorMessage: string | null | undefined) {
  const normalized = (errorMessage || "").toLowerCase();
  if (normalized.includes("insufficient funds")) {
    return {
      title: "External profile provider balance is too low",
      body: "Bright Data could not start the profile recall because the provider account has insufficient funds.",
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

function getCandidateScoringBreakdown(candidate: CandidateRow) {
  return candidate.metadata?.scoring_breakdown || candidate.metadata?.suitability?.scoring_breakdown;
}

function getCandidateOverallScore(candidate: CandidateRow) {
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

function getCandidateCapabilityScore(candidate: CandidateRow) {
  return getCandidateScoringBreakdown(candidate)?.capability_score ?? 0;
}

function getCandidateRelevanceScore(candidate: CandidateRow) {
  return getCandidateScoringBreakdown(candidate)?.relevance_score ?? 0;
}

function getCandidateJoinLikelihoodScore(candidate: CandidateRow) {
  return getCandidateScoringBreakdown(candidate)?.join_likelihood_score ?? 0;
}

function CandidateCard({
  candidate,
  onStatusChange,
  onExpand,
  requiredSkills,
  selected,
  onToggleSelect,
  billingPlanCode,
  enrichesRemaining,
  refreshBilling,
  onUpgradeClick,
  highlighted,
  isNew,
}: {
  candidate: CandidateRow;
  onStatusChange: (id: string, status: string) => void;
  onExpand: (candidate: CandidateRow) => void;
  requiredSkills: string[];
  selected?: boolean;
  onToggleSelect?: () => void;
  billingPlanCode: "free" | "pro_monthly" | "pro_annual";
  enrichesRemaining: number;
  refreshBilling: () => Promise<void>;
  onUpgradeClick: (surface: string) => void;
  highlighted?: boolean;
  isNew?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | false>(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [localCandidate, setLocalCandidate] = useState(candidate);
  const outreach = parseOutreach(localCandidate.outreach_draft);
  const hasRealEmail = !!(localCandidate.email && !localCandidate.email.includes("***"));
  const [outreachTab, setOutreachTab] = useState<"linkedin" | "email">(hasRealEmail ? "email" : "linkedin");
  const [editedSubject, setEditedSubject] = useState(outreach.subject);
  const [editedLinkedin, setEditedLinkedin] = useState(outreach.linkedin);
  const [editedEmail, setEditedEmail] = useState(outreach.email);
  const { session } = useAuth();

  // Sync when candidate prop changes
  useEffect(() => {
    setLocalCandidate(candidate);
  }, [candidate]);

  // Update outreach fields when localCandidate changes
  useEffect(() => {
    const o = parseOutreach(localCandidate.outreach_draft);
    setEditedSubject(o.subject);
    setEditedLinkedin(o.linkedin);
    setEditedEmail(o.email);
    const hasEmail = !!(localCandidate.email && !localCandidate.email.includes("***"));
    setOutreachTab(hasEmail ? "email" : "linkedin");
  }, [localCandidate.outreach_draft, localCandidate.email]);

  async function handleEnrich() {
    if (enriching || !session?.access_token) return;
    setEnrichError(null);
    setEnriching(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/enrich`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLocalCandidate((prev) => ({
          ...prev,
          email: data.email || prev.email,
          outreach_draft: data.outreach_draft || prev.outreach_draft,
        }));
        await refreshBilling();
      } else {
        const data = await res.json().catch(() => ({}));
        setEnrichError(data.error || "We couldn't enrich this candidate.");
      }
    } catch (err) {
      console.error("Enrich failed:", err);
      setEnrichError("We couldn't enrich this candidate right now.");
    } finally {
      setEnriching(false);
    }
  }

  const activeBody = outreachTab === "linkedin" ? editedLinkedin : editedEmail;
  const setActiveBody = outreachTab === "linkedin" ? setEditedLinkedin : setEditedEmail;

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(false), 2000);
  }
  function copyAll() {
    const full = outreachTab === "email" && editedSubject
      ? `Subject: ${editedSubject}\n\n${activeBody}`
      : activeBody;
    copyText(full, "all");
  }

  // Normalize required skills for fuzzy matching
  const reqLower = requiredSkills.map((s) => s.toLowerCase());
  function isMatchedSkill(skill: string): boolean {
    const sl = skill.toLowerCase();
    return reqLower.some((r) => sl.includes(r) || r.includes(sl) || sl.split(" ").some((w) => w.length > 3 && r.includes(w)));
  }
  const displayableWorkHistory = (candidate.metadata?.work_history || []).filter(
    (job) => job.title || job.company || job.summary,
  );
  const displayableEducation = (candidate.metadata?.education || []).filter(
    (edu) => edu.school || edu.degree || edu.major,
  );
  const scoringBreakdown = getCandidateScoringBreakdown(candidate);
  const suitability = candidate.metadata?.suitability;
  const overallScore = getCandidateOverallScore(candidate);
  const qualityScore =
    candidate.metadata?.quality_score ??
    suitability?.quality_score ??
    scoringBreakdown?.quality_score ??
    overallScore;
  const advanceRecommendation =
    candidate.metadata?.advance_recommendation ??
    suitability?.advance_recommendation;
  const blockingSeverity =
    candidate.metadata?.blocking_severity ??
    suitability?.blocking_severity;
  const canUnlockAction =
    billingPlanCode === "free" &&
    advanceRecommendation !== "reject" &&
    blockingSeverity !== "hard";
  const blockingConstraints =
    candidate.metadata?.blocking_constraints ??
    suitability?.blocking_constraints ??
    [];
  const joinLikelihoodReasons =
    candidate.metadata?.join_likelihood_reasons ||
    candidate.metadata?.suitability?.scoring_breakdown?.join_likelihood_reasons ||
    [];
  const riskFlags =
    candidate.metadata?.risk_flags ||
    candidate.metadata?.suitability?.risk_flags ||
    [];
  const shortlistReason =
    candidate.metadata?.shortlist_reason ??
    suitability?.shortlist_reason ??
    null;

  const statusColors: Record<string, string> = {
    new: "text-muted-light",
    starred: "text-amber-500",
    contacted: "text-blue-600",
    replied: "text-green-600",
    rejected: "text-red-500",
  };

  function toggleExpanded() {
    if (!expanded) {
      onExpand(localCandidate);
    }
    setExpanded(!expanded);
  }

  return (
    <div
      className={`rounded-xl border bg-background transition-colors hover:border-muted-light ${
        highlighted
          ? "border-amber-300 ring-1 ring-amber-200 shadow-[0_12px_30px_rgba(245,158,11,0.10)]"
          : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex w-full items-center gap-4 p-5 text-left">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
          />
        )}
        <button
          onClick={toggleExpanded}
          className="flex flex-1 cursor-pointer items-center gap-4 min-w-0"
        >
        <InitialsAvatar name={candidate.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-sm font-semibold">{candidate.name}</p>
            {highlighted && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Top pick
              </span>
            )}
            {isNew && (
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                New
              </span>
            )}
            <ActionabilityBadge candidate={candidate} />
            <ScoreBadge score={overallScore} />
            {!candidate.email && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
                LinkedIn only
              </span>
            )}
            {candidate.status !== "new" && (
              <span
                className={`text-xs font-medium capitalize ${statusColors[candidate.status] || ""}`}
              >
                {candidate.status}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {candidate.headline || (candidate.skills.length > 0 ? candidate.skills.slice(0, 3).join(" · ") : "Professional")}
          </p>
          {scoringBreakdown && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                Cap {scoringBreakdown.capability_score ?? "?"}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                Fit {scoringBreakdown.relevance_score ?? "?"}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                Join {scoringBreakdown.join_likelihood_score ?? "?"}
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Overall {overallScore}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {candidate.location && (
            <span className="hidden items-center gap-1 text-xs text-muted-light sm:flex">
              <MapPin className="h-3 w-3" />
              {candidate.location}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-light" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-light" />
          )}
        </div>
        </button>
        {canUnlockAction && (
          <PaddleCheckoutButton
            checkout={{ type: "plan", planCode: "pro_monthly" }}
            label="Unlock contact + outreach"
            onClick={() => onUpgradeClick("candidate_header_unlock")}
            onError={(message) => setEnrichError(message)}
            className="hidden shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 lg:inline-flex"
          />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Candidate info */}
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                  Details
                </p>
                <div className="space-y-2 text-sm">
                  {candidate.location && (
                    <div className="flex items-center gap-2 text-muted">
                      <MapPin className="h-3.5 w-3.5" />
                      {candidate.location}
                    </div>
                  )}
                  {candidate.experience_years && (
                    <div className="flex items-center gap-2 text-muted">
                      <Briefcase className="h-3.5 w-3.5" />
                      {candidate.experience_years} years experience
                    </div>
                  )}
                  {candidate.email && (
                    <div className="flex items-center gap-2 text-muted">
                      <Mail className="h-3.5 w-3.5" />
                      {candidate.email}
                    </div>
                  )}
                  {candidate.profile_url && (
                    <a
                      href={candidate.profile_url.replace("://linkedin.com", "://www.linkedin.com")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      LinkedIn
                    </a>
                  )}
                  {candidate.github_url && (
                    <a
                      href={candidate.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Github className="h-3.5 w-3.5" />
                      GitHub
                    </a>
                  )}
                </div>
              </div>

              {(candidate.metadata?.constraint_verdicts || candidate.metadata?.suitability?.constraint_verdicts) && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Constraint fit
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Location fit</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {formatConstraintValue(
                          candidate.metadata?.constraint_verdicts?.location_fit ||
                            candidate.metadata?.suitability?.constraint_verdicts?.location_fit,
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Work model fit</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {formatConstraintValue(
                          candidate.metadata?.constraint_verdicts?.work_model_fit ||
                            candidate.metadata?.suitability?.constraint_verdicts?.work_model_fit,
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Must-have coverage</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {formatConstraintValue(
                          candidate.metadata?.constraint_verdicts?.must_have_coverage ||
                            candidate.metadata?.suitability?.constraint_verdicts?.must_have_coverage,
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {scoringBreakdown && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    AI scorecard
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Overall score</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {overallScore ?? "?"} · {formatDimensionLabel(overallScore)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Capability score</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {scoringBreakdown?.capability_score ?? "?"} · {formatDimensionLabel(scoringBreakdown?.capability_score)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Fit score</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {scoringBreakdown?.relevance_score ?? "?"} · {formatDimensionLabel(scoringBreakdown?.relevance_score)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Join likelihood</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {scoringBreakdown?.join_likelihood_score ?? "?"} · {formatDimensionLabel(scoringBreakdown?.join_likelihood_score)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Quality score</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                      {qualityScore ?? "?"} · {formatDimensionLabel(qualityScore)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Shortlist verdict</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {candidate.metadata?.shortlist_decision === "yes" ||
                        suitability?.shortlist_decision === "yes"
                          ? "Shortlisted"
                          : advanceRecommendation
                            ? advanceRecommendation.charAt(0).toUpperCase() + advanceRecommendation.slice(1)
                            : "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {blockingConstraints.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Blocking constraints
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {blockingConstraints.map((constraint) => (
                      <span
                        key={constraint}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          blockingSeverity === "hard"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {constraint}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                  Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...candidate.skills]
                    .sort((a, b) => {
                      const aMatch = isMatchedSkill(a) ? 0 : 1;
                      const bMatch = isMatchedSkill(b) ? 0 : 1;
                      return aMatch - bMatch;
                    })
                    .map((skill) => (
                    <span
                      key={skill}
                      className={`rounded-md px-2 py-1 text-xs ${
                        isMatchedSkill(skill)
                          ? "bg-primary/15 text-primary font-medium ring-1 ring-primary/20"
                          : "bg-surface text-foreground"
                      }`}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-light">
                      {highlighted
                        ? "Why this candidate is a top pick"
                        : "Why this candidate made the shortlist"}
                    </p>
                  {candidate.metadata?.preliminary && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                      Preliminary
                    </span>
                  )}
                </div>
                {shortlistReason && (
                  <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {shortlistReason}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {candidate.match_reasons.map((reason, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {reason}
                    </li>
                  ))}
                </ul>
                {candidate.metadata?.preliminary && (
                  <p className="mt-2 text-xs text-muted">
                    These reasons are already usable for review. Hirelix may refine the ranking and rationale as richer profile data comes in.
                  </p>
                )}
              </div>

              {joinLikelihoodReasons.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Why they might realistically engage
                  </p>
                  <ul className="space-y-1.5">
                    {joinLikelihoodReasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(candidate.metadata?.why_not_higher) && candidate.metadata.why_not_higher.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    What to verify before outreach
                  </p>
                  <ul className="space-y-1.5">
                    {candidate.metadata.why_not_higher.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {riskFlags.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Advancement risks
                  </p>
                  <ul className="space-y-1.5">
                    {riskFlags.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Work History */}
              {displayableWorkHistory.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Work History
                  </p>
                  <div className="space-y-2">
                    {displayableWorkHistory.map((job, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-light" />
                        <div>
                          <p className="font-medium text-foreground">{job.title || "Unknown Role"}</p>
                          <p className="text-xs text-muted">
                            {job.company || "Unknown Company"}
                            {job.start_date && (
                              <span className="text-muted-light"> · {job.start_date.includes(" - ") ? job.start_date : (job.end_date ? `${job.start_date} – ${job.end_date}` : `${job.start_date} – Present`)}</span>
                            )}
                          </p>
                          {job.summary && (
                            <p className="mt-1 text-xs text-muted">{job.summary}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {displayableEducation.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Education
                  </p>
                  <div className="space-y-2">
                    {displayableEducation.map((edu, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-light" />
                        <div>
                          {edu.school && <p className="font-medium text-foreground">{edu.school}</p>}
                          {(edu.degree || edu.major) && (
                            <p className="text-xs text-muted">
                              {[edu.degree, edu.major].filter(Boolean).join(" in ")}
                            </p>
                          )}
                          {(edu.start_year || edu.end_year) && (
                            <p className="text-xs text-muted-light">
                              {[edu.start_year, edu.end_year].filter(Boolean).join(" – ")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                  Status
                </p>
                <div className="flex gap-2">
                  {["new", "starred", "contacted", "replied", "rejected"].map((s) => (
                    <button
                      key={s}
                      onClick={() => onStatusChange(candidate.id, s)}
                      className={`rounded-md cursor-pointer px-3 py-1 text-xs font-medium capitalize transition-colors ${
                        candidate.status === s
                          ? "bg-primary text-white"
                          : "bg-surface text-muted hover:bg-surface-dark"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Outreach */}
            <div className="space-y-3">
              {!localCandidate.outreach_draft ? (
                // Fallback if the main pipeline did not persist outreach copy
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
                  <Mail className="mb-3 h-8 w-8 text-muted-light" />
                  <p className="mb-1 text-sm font-medium text-foreground">Ready to unlock contact details for this candidate?</p>
                  <p className="mb-4 text-xs text-muted">
                    {billingPlanCode === "free"
                      ? "You already have the ranked candidate list and draft copy. Upgrade only when you want contact lookup for the people you decide to reach out to."
                      : "The outreach copy is ready. Find contact details when you are ready to act on this candidate."}
                  </p>
                  {billingPlanCode === "free" ? (
                    <PaddleCheckoutButton
                      checkout={{ type: "plan", planCode: "pro_monthly" }}
                      label="Unlock contact details and outreach"
                      onClick={() => onUpgradeClick("candidate_outreach_gate")}
                      onError={(message) => setEnrichError(message)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  ) : enrichesRemaining <= 0 ? (
                    <PaddleCheckoutButton
                      checkout={{ type: "add_on", addOn: "contact_pack" }}
                      label="Buy Contact Pack"
                      onClick={() => onUpgradeClick("candidate_contact_pack")}
                      onError={(message) => setEnrichError(message)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  ) : (
                    <button
                      onClick={handleEnrich}
                      disabled={enriching}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {enriching ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Finding contact info...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Find Email
                        </>
                      )}
                    </button>
                  )}
                  {enrichError && (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {enrichError}
                    </p>
                  )}
                  {localCandidate.profile_url && (
                    <a
                      href={localCandidate.profile_url.replace("://linkedin.com", "://www.linkedin.com")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open LinkedIn Profile
                    </a>
                  )}
                </div>
              ) : (
                // Outreach content
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setOutreachTab("linkedin")}
                        className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          outreachTab === "linkedin"
                            ? "bg-[#0077B5]/10 text-[#0077B5]"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        LinkedIn
                      </button>
                      {hasRealEmail && (
                        <button
                          onClick={() => setOutreachTab("email")}
                          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            outreachTab === "email"
                              ? "bg-primary/10 text-primary"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          Email
                        </button>
                      )}
                    </div>
                    <button
                      onClick={copyAll}
                      className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-dark hover:text-foreground"
                    >
                      {copied === "all" ? (
                        <>
                          <Check className="h-3 w-3 text-green-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy All
                        </>
                      )}
                    </button>
                  </div>
                  {hasRealEmail && localCandidate.email && (
                    <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
                      <Mail className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-xs font-medium text-green-700">{localCandidate.email}</span>
                      <button
                        onClick={() => copyText(localCandidate.email!, "email-addr")}
                        className="ml-auto text-[10px] cursor-pointer text-green-600 hover:text-green-800 transition-colors"
                      >
                        {copied === "email-addr" ? "✓" : "Copy"}
                      </button>
                    </div>
                  )}
                  {outreachTab === "email" && editedSubject && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-light">Subject</label>
                        <button onClick={() => copyText(editedSubject, "subject")} className="text-[10px] cursor-pointer text-muted hover:text-foreground transition-colors">
                          {copied === "subject" ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editedSubject}
                        onChange={(e) => setEditedSubject(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  )}
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-light">
                        {outreachTab === "linkedin" ? "Message" : "Body"}
                      </label>
                      <button onClick={() => copyText(activeBody, "body")} className="text-[10px] cursor-pointer text-muted hover:text-foreground transition-colors">
                        {copied === "body" ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                    <textarea
                      value={activeBody}
                      onChange={(e) => setActiveBody(e.target.value)}
                      rows={8}
                      className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {outreachTab === "linkedin" && localCandidate.profile_url && (
                    <a
                      href={localCandidate.profile_url.replace("://linkedin.com", "://www.linkedin.com")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0077B5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#005582]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open LinkedIn Profile
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs text-muted hover:bg-surface hover:text-foreground transition-colors"
          >
            <ChevronsUp className="h-3 w-3" />
            Collapse
          </button>
        </div>
      )}
    </div>
  );
}

function ProcessingSteps({
  pipelineStep,
  searchPhase,
  standardRecallReady,
  firstShortlistCandidateAt,
  providerDelayMs,
}: {
  pipelineStep: string | null;
  searchPhase: string | null;
  standardRecallReady: boolean;
  firstShortlistCandidateAt: string | null;
  providerDelayMs: number | null;
}) {
  const steps = [
    { icon: FileText, label: "Understanding the role", activeFor: ["queued", "parsing"] },
    { icon: Users, label: "Recalling profiles", activeFor: ["searching"] },
    { icon: Star, label: "Reviewing candidates", activeFor: ["screening"] },
  ];

  const activeIdx = Math.max(
    steps.findIndex((step) => step.activeFor.includes(pipelineStep || "queued")),
    0,
  );

  const progressTitle =
    pipelineStep === "parsing"
      ? "Understanding the role and extracting the hiring signal..."
      : pipelineStep === "searching"
        ? searchPhase === "phase_2"
          ? "Launching the deeper Bright refinement pass..."
          : "Recalling the first Bright profile batch..."
        : pipelineStep === "screening"
          ? "Reviewing recalled profiles for shortlist decisions..."
          : "Running recruiter judgments across recalled profiles...";

  const progressBody =
    pipelineStep === "parsing"
      ? "Hirelix has accepted the search and is turning the JD into a recruiter-ready search brief."
      : pipelineStep === "searching"
        ? getProviderDelayCopy(providerDelayMs)
        : firstShortlistCandidateAt
          ? "The shortlist is already usable, and Hirelix is still reviewing more recalled profiles in the background."
          : standardRecallReady
            ? "The first Bright batch is back. Hirelix is now reviewing recalled profiles and will show the shortlist as soon as candidates pass recruiter review."
            : "Hirelix is preparing to review recalled profiles as soon as the first provider batch lands.";
  const statusEyebrow = pipelineStep === "queued" ? "Search accepted" : "Search started";

  return (
    <div className="mb-6 rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,#fafdff_0%,#f2f8ff_100%)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
        {statusEyebrow}
      </p>
      <div className="mb-2 mt-2 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-sm font-medium">{progressTitle}</p>
      </div>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-slate-600">
        {progressBody}
      </p>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                isDone ? "bg-green-100" : isActive ? "bg-primary/20" : "bg-gray-100"
              }`}>
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-gray-400" />
                )}
              </div>
              <span className={`text-sm ${
                isDone ? "text-green-700 font-medium" : isActive ? "text-foreground font-medium" : "text-muted-light"
              }`}>
                {step.label}
                {isDone && " ✓"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full border border-sky-100 bg-white px-3 py-1">Results appear as candidates pass recruiter review</span>
        <span className="rounded-full border border-sky-100 bg-white px-3 py-1">Safe to leave and come back</span>
        <span className="rounded-full border border-sky-100 bg-white px-3 py-1">Top picks update as stronger profiles arrive</span>
      </div>
      <p className="mt-4 text-xs text-muted">
        You do not need to stay on this page. Hirelix will keep recalling profiles, reviewing them, and growing the shortlist in the background.
      </p>
    </div>
  );
}

export default function SearchResultPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, session } = useAuth();
  const { billing, refresh: refreshBilling } = useBilling();
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [newCandidateIds, setNewCandidateIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showJd, setShowJd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [showOnlyWithEmail, setShowOnlyWithEmail] = useState(false);
  const [sortMode, setSortMode] = useState<CandidateSortMode>("overall");
  const [, setUpgradeError] = useState<string | null>(null);
  const hasTrackedProcessingViewRef = useRef(false);
  const hasTrackedResultsViewRef = useRef(false);
  const hasTrackedDoneRef = useRef(false);
  const hasTrackedDegradedRef = useRef(false);
  const hasTrackedProcessingReassuranceRef = useRef(false);
  const hasTrackedUpgradeValueExposedRef = useRef(false);
  const seenCandidateIdsRef = useRef<Set<string>>(new Set());
  const analyticsContext = getAnalyticsContextFromBrowser({
    entry_mode: searchParams.get("entry") === "landing"
      ? "landing"
      : searchParams.get("entry") === "signin"
        ? "signin"
        : "workspace",
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll(rows: CandidateRow[]) {
    const rowIds = rows.map((row) => row.id);
    const allSelected = rowIds.length > 0 && rowIds.every((rowId) => selectedIds.has(rowId));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rowIds));
    }
  }
  async function bulkStatusChange(newStatus: string) {
    const ids = Array.from(selectedIds);
    setCandidates((prev) =>
      prev.map((c) => (ids.includes(c.id) ? { ...c, status: newStatus } : c)),
    );
    setSelectedIds(new Set());
    for (const cid of ids) {
      await supabase.from("hirelix_candidates").update({ status: newStatus }).eq("id", cid);
    }
  }

  function exportCSV(rows: CandidateRow[]) {
    if (rows.length === 0) return;
    const headers = ["Name", "Headline", "Location", "Overall Score", "Skills", "Experience Years", "Profile URL", "Email", "Status", "Match Reasons"];
    const csvRows = rows.map((c) => [
      c.name,
      c.headline || "",
      c.location || "",
      c.match_score,
      c.skills.join("; "),
      c.experience_years || "",
      c.profile_url || "",
      c.email || "",
      c.status,
      c.match_reasons.join("; "),
    ]);
    const csv = [headers, ...csvRows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${search?.title || "candidates"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fetchData = useCallback(async () => {
    if (!user || !id) return;

    const searchRequest = supabase.from("hirelix_searches").select("*").eq("id", id).single();
    const candidatesRequest = supabase
      .from("hirelix_candidates")
      .select("*")
      .eq("search_id", id)
      .order("match_score", { ascending: false });

    const { data: searchData } = await searchRequest;

    let normalizedSearch = searchData;
    if (
      searchData &&
      isStaleProcessingSearch(searchData.status, searchData.updated_at)
    ) {
      await supabase
        .from("hirelix_searches")
        .update({
          status: "error",
          pipeline_step: "error",
          error_message: getStalledSearchMessage(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);

      normalizedSearch = {
        ...searchData,
        status: "error",
        pipeline_step: "error",
        error_message: getStalledSearchMessage(),
        updated_at: new Date().toISOString(),
      };
    }
    if (normalizedSearch) setSearch(normalizedSearch);
    setLoading(false);
    const { data: candidatesData } = await candidatesRequest;
    if (
      normalizedSearch &&
      normalizedSearch.status === "deep_scoring" &&
      (candidatesData?.length || 0) > 0 &&
      isOlderThanMinutes(normalizedSearch.updated_at)
    ) {
      await supabase
        .from("hirelix_searches")
        .update({
          status: "degraded",
          pipeline_step: "done",
          warning_message:
            "Advanced profile refinement took too long, but your shortlist is still ready to review.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);

      normalizedSearch = {
        ...normalizedSearch,
        status: "degraded",
        pipeline_step: "done",
        warning_message:
          "Advanced profile refinement took too long, but your shortlist is still ready to review.",
        updated_at: new Date().toISOString(),
      };
      setSearch(normalizedSearch);
    }
    if (candidatesData) {
      // Track new candidates for highlight (diff against previously seen)
      const newIds = new Set<string>();
      candidatesData.forEach((c) => {
        if (!seenCandidateIdsRef.current.has(c.id)) newIds.add(c.id);
        seenCandidateIdsRef.current.add(c.id);
      });
      if (newIds.size > 0) {
        setNewCandidateIds(newIds);
        // Clear highlight after 4 seconds
        setTimeout(() => setNewCandidateIds(new Set()), 4000);
      }
      // Sort: candidates with email first, then by match score
      const sorted = candidatesData.sort((a, b) => {
        const aHasEmail = !!a.email;
        const bHasEmail = !!b.email;
        if (aHasEmail !== bHasEmail) return bHasEmail ? 1 : -1;
        return b.match_score - a.match_score;
      });
      setCandidates(sorted);
    }
  }, [user, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fast poll while search is actively progressing or refining results.
  useEffect(() => {
    if (!search || !isRunningSearchStatus(search.status)) return;
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [fetchData, search]);

  useEffect(() => {
    if (
      !search ||
      !["queued", "parsing", "searching", "screening"].includes(search.status) ||
      hasTrackedProcessingViewRef.current
    ) {
      return;
    }
    hasTrackedProcessingViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.searchProcessingView, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      pipeline_step: search.pipeline_step ?? "unknown",
      candidate_count: candidates.length,
      has_candidates: candidates.length > 0,
      has_email_candidates: candidates.some((candidate) => Boolean(candidate.email)),
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
    });
  }, [analyticsContext, billing, candidates, candidates.length, search]);

  useEffect(() => {
    if (!search || !isReviewableSearchStatus(search.status) || candidates.length === 0 || hasTrackedResultsViewRef.current) return;
    hasTrackedResultsViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.searchResultsView, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      candidate_count: candidates.length,
      has_candidates: candidates.length > 0,
      has_email_candidates: candidates.some((candidate) => Boolean(candidate.email)),
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
    });
  }, [analyticsContext, billing, candidates, candidates.length, search]);

  useEffect(() => {
    if (!search || search.status !== "done" || hasTrackedDoneRef.current) return;
    hasTrackedDoneRef.current = true;
    trackEvent(ANALYTICS_EVENTS.searchDone, {
      ...analyticsContext,
      search_id: search.id,
      candidate_count: candidates.length,
      done_at: search.done_at ?? null,
    });
  }, [analyticsContext, candidates.length, search]);

  useEffect(() => {
    if (!search || search.status !== "degraded" || hasTrackedDegradedRef.current) return;
    hasTrackedDegradedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.searchDegraded, {
      ...analyticsContext,
      search_id: search.id,
      candidate_count: candidates.length,
      warning_message: search.warning_message ?? null,
    });
  }, [analyticsContext, candidates.length, search]);

  useEffect(() => {
    if (!search || !["queued", "parsing", "searching", "screening"].includes(search.status) || hasTrackedProcessingReassuranceRef.current) {
      return;
    }

    hasTrackedProcessingReassuranceRef.current = true;
    trackEvent(ANALYTICS_EVENTS.processingReassuranceView, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      pipeline_step: search.pipeline_step ?? "unknown",
    });
  }, [analyticsContext, search]);

  useEffect(() => {
    if (
      !search ||
      !isReviewableSearchStatus(search.status) ||
      candidates.length === 0 ||
      hasTrackedUpgradeValueExposedRef.current ||
      billing?.plan.code !== "free"
    ) {
      return;
    }

    hasTrackedUpgradeValueExposedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.upgradeValueExposed, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      candidate_count: candidates.length,
      has_email_candidates: candidates.some((candidate) => Boolean(candidate.email)),
      upgrade_surface: "results_capability_unlock",
    });
    trackEvent(ANALYTICS_EVENTS.resultsUnlockCtaViewed, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      candidate_count: candidates.length,
      upgrade_surface: "results_capability_unlock",
    });
  }, [analyticsContext, billing?.plan.code, candidates, search]);

  async function handleRetry() {
    if (!session?.access_token || !id) return;
    setRetrying(true);
    trackEvent(ANALYTICS_EVENTS.retrySearchClick, {
      ...analyticsContext,
      search_id: id,
      search_status: search?.status ?? "unknown",
      candidate_count: candidates.length,
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
    });
    try {
      const res = await fetch(`/api/search/${id}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        // Reset local state to show processing
        hasTrackedProcessingViewRef.current = false;
        hasTrackedResultsViewRef.current = false;
        hasTrackedDoneRef.current = false;
        hasTrackedDegradedRef.current = false;
        hasTrackedProcessingReassuranceRef.current = false;
        hasTrackedUpgradeValueExposedRef.current = false;
        setSearch((prev) =>
          prev
            ? {
                ...prev,
                status: "queued",
                pipeline_step: "queued",
                error_message: null,
                warning_message: null,
              }
            : prev,
        );
        setCandidates([]);
      }
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  }

  async function handleStatusChange(candidateId: string, newStatus: string) {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId ? { ...c, status: newStatus } : c,
      ),
    );
    await supabase
      .from("hirelix_candidates")
      .update({ status: newStatus })
      .eq("id", candidateId);
  }

  function handleCandidateExpand(candidate: CandidateRow) {
    trackEvent(ANALYTICS_EVENTS.candidateExpand, {
      ...analyticsContext,
      search_id: search?.id ?? null,
      candidate_id: candidate.id,
      match_score: candidate.match_score,
      has_email: Boolean(candidate.email),
      has_candidates: candidates.length > 0,
      has_email_candidates: candidates.some((row) => Boolean(row.email)),
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
    });
  }

  function handleUpgradeClick(surface: string) {
    trackEvent(ANALYTICS_EVENTS.upgradeCtaClick, {
      ...analyticsContext,
      search_id: search?.id ?? null,
      search_status: search?.status ?? "unknown",
      candidate_count: candidates.length,
      has_candidates: candidates.length > 0,
      has_email_candidates: candidates.some((candidate) => Boolean(candidate.email)),
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      upgrade_surface: surface,
    });
    trackEvent(ANALYTICS_EVENTS.resultsUnlockCtaClicked, {
      ...analyticsContext,
      search_id: search?.id ?? null,
      search_status: search?.status ?? "unknown",
      candidate_count: candidates.length,
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      upgrade_surface: surface,
    });
  }

  if (loading) {
    return <ResultPageSkeleton />;
  }

  if (!search) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted">Shortlist not found</p>
        <Link
          href="/app"
          className="mt-4 text-sm text-primary hover:underline"
        >
          Go back
        </Link>
      </div>
    );
  }

  const reqs = search.parsed_requirements as Record<string, unknown> | null;
  const hiringBrief =
    reqs && typeof reqs.hiring_brief === "object" && reqs.hiring_brief
      ? (reqs.hiring_brief as Record<string, unknown>)
      : null;
  const roleCore =
    hiringBrief && typeof hiringBrief.role_core === "object" && hiringBrief.role_core
      ? (hiringBrief.role_core as Record<string, unknown>)
      : null;
  const requiredSkills = Array.isArray(roleCore?.required_skills)
    ? (roleCore?.required_skills as string[]).filter(Boolean)
    : Array.isArray(reqs?.required_skills)
      ? (reqs?.required_skills as string[]).filter(Boolean)
      : [];
  const workModel = typeof hiringBrief?.work_model === "string" ? hiringBrief.work_model : null;
  const locationScope = typeof hiringBrief?.location_scope === "string" ? hiringBrief.location_scope : (typeof reqs?.location === "string" ? reqs.location : null);
  const locationFlexibility = typeof hiringBrief?.location_flexibility === "string" ? hiringBrief.location_flexibility : null;
  const relocationAllowed = typeof hiringBrief?.relocation_allowed === "string" ? hiringBrief.relocation_allowed : null;
  const constraintReasoning = typeof hiringBrief?.constraint_reasoning === "string" ? hiringBrief.constraint_reasoning : null;
  const executionProfile = typeof reqs?.execution_profile === "string" ? reqs.execution_profile : null;
  const searchPhase = typeof reqs?.search_phase === "string" ? reqs.search_phase : null;
  const resultStage = typeof reqs?.result_stage === "string" ? reqs.result_stage : null;
  const launchMode = typeof reqs?.launch_mode === "string" ? reqs.launch_mode : null;
  const launchScope = typeof reqs?.launch_scope === "string" ? reqs.launch_scope : null;
  const searchPhaseCount = positiveInt(reqs?.search_phase_count);
  const isReviewable = isReviewableSearchStatus(search.status);
  const isImprovingInBackground = search.status === "deep_scoring";
  const isReadyWithWarning = search.status === "degraded";
  const isPreResultsProcessing =
    search.status === "queued" ||
    search.status === "parsing" ||
    search.status === "searching" ||
    search.status === "screening";
  const displayTarget =
    positiveInt(reqs?.display_count) ??
    positiveInt(reqs?.candidate_count) ??
    25;
  const highlightCount =
    positiveInt(reqs?.highlight_count) ??
    5;
  const allCandidates = [...candidates].sort((left, right) => {
    const scoreFor = (candidate: CandidateRow) => {
      switch (sortMode) {
        case "capability":
          return getCandidateCapabilityScore(candidate);
        case "relevance":
          return getCandidateRelevanceScore(candidate);
        case "join_likelihood":
          return getCandidateJoinLikelihoodScore(candidate);
        case "overall":
        default:
          return getCandidateOverallScore(candidate);
      }
    };
    const rightPrimary = scoreFor(right);
    const leftPrimary = scoreFor(left);
    const rightSecondary =
      right.metadata?.subscription_trigger_score ??
      right.metadata?.suitability?.subscription_trigger_score ??
      getCandidateOverallScore(right);
    const leftSecondary =
      left.metadata?.subscription_trigger_score ??
      left.metadata?.suitability?.subscription_trigger_score ??
      getCandidateOverallScore(left);
    return rightPrimary - leftPrimary || rightSecondary - leftSecondary;
  });
  const highlightedIds = new Set(
    allCandidates.slice(0, highlightCount).map((candidate) => candidate.id),
  );
  const visibleCandidates = showOnlyWithEmail
    ? allCandidates.filter((candidate) => candidate.email)
    : allCandidates;
  const highlightedCandidates = visibleCandidates.slice(0, Math.min(highlightCount, visibleCandidates.length));
  const averageQuality = highlightedCandidates.length
    ? Math.round(
        highlightedCandidates.reduce((sum, candidate) => sum + candidate.match_score, 0) /
          highlightedCandidates.length,
      )
    : 0;
  const rawDisplayStats =
    reqs && typeof reqs.display_stats === "object" && reqs.display_stats
      ? (reqs.display_stats as SearchDisplayStats)
      : null;
  const recallMetadata =
    reqs && typeof reqs.recall_metadata === "object" && reqs.recall_metadata
      ? (reqs.recall_metadata as RecallMetadataView)
      : null;
  const searchStartedAt =
    reqs && typeof reqs.search_started_at === "string"
      ? reqs.search_started_at
      : search.created_at;
  const standardRecallCompletedAt =
    recallMetadata?.standard_recall_completed_at ??
    recallMetadata?.completed_at ??
    null;
  const firstShortlistCandidateAt =
    rawDisplayStats?.first_shortlist_candidate_at ??
    search.partial_ready_at ??
    null;
  const timeToStandardRecallReadyMs =
    rawDisplayStats?.time_to_standard_recall_ready_ms ??
    (standardRecallCompletedAt && searchStartedAt
      ? Math.max(0, Date.parse(standardRecallCompletedAt) - Date.parse(searchStartedAt))
      : null);
  const timeToFirstShortlistCandidateMs =
    rawDisplayStats?.time_to_first_shortlist_candidate_ms ??
    (firstShortlistCandidateAt && searchStartedAt
      ? Math.max(0, Date.parse(firstShortlistCandidateAt) - Date.parse(searchStartedAt))
      : null);
  const providerDelayMs =
    !standardRecallCompletedAt && searchStartedAt
      ? Math.max(0, Date.now() - Date.parse(searchStartedAt))
      : null;
  const standardRecallReady = Boolean(standardRecallCompletedAt);
  const brightProfileBudget =
    positiveInt(rawDisplayStats?.bright_profile_budget) ??
    positiveInt(reqs?.bright_profile_budget) ??
    null;
  const brightProfilesRequested =
    positiveInt(rawDisplayStats?.bright_profiles_requested) ?? null;
  const brightProfilesReturned =
    positiveInt(rawDisplayStats?.bright_profiles_returned) ?? null;
  const brightSnapshotCost =
    typeof rawDisplayStats?.bright_snapshot_cost === "number"
      ? rawDisplayStats.bright_snapshot_cost
      : null;
  const estimatedLlmCost =
    typeof rawDisplayStats?.estimated_llm_cost === "number"
      ? rawDisplayStats.estimated_llm_cost
      : null;
  const estimatedSearchTotalCost =
    typeof rawDisplayStats?.estimated_search_total_cost === "number"
      ? rawDisplayStats.estimated_search_total_cost
      : null;
  const judgeMode =
    rawDisplayStats?.judge_mode === "single" || rawDisplayStats?.judge_mode === "dual"
      ? rawDisplayStats.judge_mode
      : typeof reqs?.judge_mode === "string" && (reqs.judge_mode === "single" || reqs.judge_mode === "dual")
        ? reqs.judge_mode
        : null;
  const retrievalCount =
    positiveInt(rawDisplayStats?.retrieval_count) ??
    Math.max(allCandidates.length, 0);
  const deepReviewRequestedCount =
    positiveInt(rawDisplayStats?.deep_review_requested_count) ??
    positiveInt(rawDisplayStats?.deep_review_count) ??
    Math.max(allCandidates.length, 0);
  const deepReviewCompletedCount =
    positiveInt(rawDisplayStats?.deep_review_completed_count) ??
    positiveInt(rawDisplayStats?.deep_review_count) ??
    Math.max(allCandidates.length, 0);
  const outreachPoolCount = Math.min(
    positiveInt(rawDisplayStats?.outreach_pool_count) ?? Math.max(allCandidates.length, 0),
    displayTarget,
  );
  const shortlistReadyCount =
    positiveInt(rawDisplayStats?.shortlist_count) ?? allCandidates.length;
  const visibleCandidateCount =
    positiveInt(rawDisplayStats?.visible_candidate_count) ?? shortlistReadyCount;
  const hardBlockedCount =
    positiveInt(rawDisplayStats?.hard_blocked_count) ?? 0;
  const softBlockedCount =
    positiveInt(rawDisplayStats?.soft_blocked_count) ?? 0;
  const qualityFloorApplied =
    rawDisplayStats?.quality_floor_applied === true;
  const advanceableCount =
    positiveInt(rawDisplayStats?.advanceable_count) ??
    allCandidates.filter(
      (candidate) => candidate.metadata?.suitability?.advance_recommendation === "advance",
    ).length;
  const isProvisional = resultStage === "provisional";
  const isPhaseTwoRunning = isImprovingInBackground && searchPhase === "phase_2";
  const readyToActCount = allCandidates.filter(
    (candidate) =>
      candidate.metadata?.suitability?.advance_recommendation === "advance" ||
      candidate.metadata?.suitability?.actionability === "ready_to_act",
  ).length;
  const contactUnlockCandidates =
    positiveInt(rawDisplayStats?.contact_unlock_candidates) ??
    allCandidates.filter(
      (candidate) =>
        candidate.metadata?.suitability?.advance_recommendation !== "reject" &&
        candidate.metadata?.suitability?.blocking_severity !== "hard",
    ).length;
  const clearLocationFitCount = allCandidates.filter((candidate) => {
    const locationFit = candidate.metadata?.suitability?.constraint_verdicts?.location_fit;
    return locationFit === "local" || locationFit === "nearby";
  }).length;
  const strongMustHaveCount = allCandidates.filter((candidate) => {
    const coverage = candidate.metadata?.suitability?.constraint_verdicts?.must_have_coverage;
    return coverage === "strong";
  }).length;
  const topStartCount = Math.min(highlightCount, allCandidates.length);
  const shortlistYesCount =
    positiveInt(rawDisplayStats?.shortlist_yes_count) ?? allCandidates.length;
  const shortlistNoCount =
    positiveInt(rawDisplayStats?.shortlist_no_count) ?? 0;
  const recallProfileCount =
    positiveInt(rawDisplayStats?.recall_profile_count) ?? brightProfilesReturned ?? retrievalCount;
  const clearLocationFitDisplayCount =
    positiveInt(rawDisplayStats?.clear_location_fit_count) ?? clearLocationFitCount;
  const mustHaveStrongDisplayCount =
    positiveInt(rawDisplayStats?.must_have_strong_count) ?? strongMustHaveCount;
  const firstContactConfidenceCount =
    positiveInt(rawDisplayStats?.first_contact_confidence_count) ??
    allCandidates.filter(
      (candidate) =>
        candidate.metadata?.first_contact_confidence === "high" ||
        candidate.metadata?.suitability?.first_contact_confidence === "high",
    ).length;
  const topupTriggered = rawDisplayStats?.topup_triggered === true;
  const finalReadyHeadline =
    visibleCandidateCount <= topStartCount
      ? `We shortlisted ${visibleCandidateCount} candidate${visibleCandidateCount === 1 ? "" : "s"} worth reviewing now`
      : `Your shortlist is ready to review`;
  const firstVisibleLabel = formatElapsedMinutes(timeToFirstShortlistCandidateMs);
  const standardRecallReadyLabel = formatElapsedMinutes(timeToStandardRecallReadyMs);
  const errorPresentation = getSearchErrorPresentation(search.error_message);
  const entryQuery =
    analyticsContext.entry_mode === "workspace"
      ? ""
      : `?entry=${analyticsContext.entry_mode}`;
  const encodedJd = encodeURIComponent(search.jd_text);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/app"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to shortlists
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            {search.title || "Untitled shortlist"}
          </h1>
          {isReviewable && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowJd(!showJd)}
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:border-muted-light transition-colors"
              >
                {showJd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                <span className="hidden sm:inline">{showJd ? "Hide JD" : "View JD"}</span>
                <span className="sm:hidden">{showJd ? "Hide" : "JD"}</span>
              </button>
              {allCandidates.length > 0 &&
                (billing?.usage.exportEnabled ? (
                  <button
                    onClick={() => exportCSV(allCandidates)}
                    className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:border-muted-light transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    <span className="hidden sm:inline">Export CSV</span>
                    <span className="sm:hidden">CSV</span>
                  </button>
                ) : (
                  <Link
                    href="/app/settings#billing"
                    onClick={() => handleUpgradeClick("results_export_gate")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-muted-light hover:text-foreground"
                  >
                    <Download className="h-3 w-3" />
                    Export this shortlist
                  </Link>
                ))}
              <Link
                href={`/app/search/new${entryQuery}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
              >
                <Search className="h-3 w-3" />
                New shortlist
              </Link>
            </div>
          )}
        </div>
        {reqs && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {requiredSkills.slice(0, 6).map((skill) => (
                <span
                  key={skill}
                  className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {skill}
                </span>
              ))}
              {typeof reqs.experience_years_min === "number" && (
                <span className="text-xs text-muted">
                  {reqs.experience_years_min}+ years
                </span>
              )}
              {locationScope && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <MapPin className="h-3 w-3" />
                  {locationScope}
                </span>
              )}
              {workModel && workModel !== "unknown" && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {workModel}
                </span>
              )}
              {locationFlexibility && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  location: {locationFlexibility}
                </span>
              )}
              {relocationAllowed && relocationAllowed !== "unknown" && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  relocation: {relocationAllowed}
                </span>
              )}
              {executionProfile && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {executionProfile}
                </span>
              )}
              {launchMode === "paid_beta" && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                  paid beta
                </span>
              )}
              {launchScope === "us_only" && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  US-only
                </span>
              )}
              {resultStage && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {resultStage}
                </span>
              )}
              {searchPhaseCount && searchPhaseCount > 1 && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {searchPhaseCount} phases
                </span>
              )}
            </div>
            {constraintReasoning && (
              <p className="max-w-3xl text-xs text-muted">
                Hirelix interpreted this role as: {constraintReasoning}
              </p>
            )}
          </div>
        )}
      </div>

      {isPreResultsProcessing && (
        <div className="mb-6 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            Search accepted
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {standardRecallReady
              ? "The first profile batch is back"
              : (search?.pipeline_step ?? search?.status ?? "queued") === "queued"
                ? "Hirelix has accepted your shortlist request"
                : "Hirelix has started your shortlist search"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            {standardRecallReady
              ? "Hirelix is now reviewing recalled profiles. The shortlist will switch from pure progress to a usable, growing candidate list as soon as candidates pass recruiter review."
              : "Hirelix is understanding the role and asking Bright Data for the first profile batch. The shortlist will begin to grow before the full search is completely finished."}
          </p>
          <p className="mt-3 max-w-2xl text-xs text-slate-500">
            {standardRecallReady
              ? `Standard recall finished in ${standardRecallReadyLabel}.`
              : getProviderDelayCopy(providerDelayMs)}{" "}
            If this shortlist looks off, email{" "}
            <a className="text-primary hover:underline" href="mailto:support@hirelix.online">
              support@hirelix.online
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1">
              {searchPhase === "phase_2" ? "Deep Bright refinement in progress" : "Bright recall running"}
            </span>
            <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1">Results will appear as candidates pass review</span>
            <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1">You can come back to this shortlist any time</span>
          </div>
        </div>
      )}

      {isReviewable && allCandidates.length > 0 && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                {isReadyWithWarning
                  ? "Ready with a warning"
                  : isPhaseTwoRunning
                    ? "Provisional shortlist ready"
                    : isImprovingInBackground
                      ? "Usable now, still refining"
                    : "Candidates ready"}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                {isReadyWithWarning
                  ? "Your candidate list is ready with a warning"
                  : isPhaseTwoRunning
                    ? "Your provisional shortlist is ready"
                    : isImprovingInBackground
                      ? "Your candidates are already usable now"
                    : finalReadyHeadline}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                {search.warning_message
                  ? search.warning_message
                  : isPhaseTwoRunning
                    ? "Hirelix already delivered the Bright fast-pass shortlist. A deeper Bright pass is still running in the background and may add stronger candidates to this list."
                    : qualityFloorApplied
                      ? "Hirelix searched a Bright LinkedIn pool and kept the candidates that already look credible to review now."
                      : `Hirelix is already showing recruiter-approved candidates. The shortlist started growing after ${firstVisibleLabel}, and the current top ${highlightCount} are highlighted first.`}
              </p>
              <p className="mt-3 max-w-2xl text-xs text-slate-500">
                Paid beta, US-only at launch. If your shortlist misses the mark or your billing looks wrong, email{" "}
                <a className="text-primary hover:underline" href="mailto:support@hirelix.online">
                  support@hirelix.online
                </a>
                .
              </p>
              {isImprovingInBackground && !search.warning_message && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                  {isPhaseTwoRunning
                    ? "Background refinement is still running a deeper Bright pass, but the shortlist is already reviewable"
                    : candidates.length > 0
                      ? `Found ${candidates.length} shortlist candidate${candidates.length === 1 ? "" : "s"} so far — still reviewing${rawDisplayStats?.deep_review_completed_count && rawDisplayStats?.deep_review_requested_count ? ` (${rawDisplayStats.deep_review_completed_count}/${rawDisplayStats.deep_review_requested_count} reviewed)` : ""}...`
                      : "The shortlist is still growing as more recalled profiles are reviewed..."}
                </div>
              )}
              {!search.warning_message && (
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {isProvisional
                    ? `Start with the highlighted top ${highlightCount} now. Hirelix will replace this provisional list if the deeper Bright pass finds stronger matches.`
                    : `Start with the highlighted top ${highlightCount}, then unlock contact details and outreach execution for the candidates you actually want to work.`}
                </p>
              )}
              {(brightProfileBudget || judgeMode || brightSnapshotCost != null) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  {brightProfileBudget ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Bright budget: {brightProfileBudget} profiles
                    </span>
                  ) : null}
                  {brightProfilesRequested ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Requested: {brightProfilesRequested}
                    </span>
                  ) : null}
                  {brightProfilesReturned ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Returned: {brightProfilesReturned}
                    </span>
                  ) : null}
                  {judgeMode ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Judge mode: {judgeMode}
                    </span>
                  ) : null}
                  {typeof brightSnapshotCost === "number" ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Snapshot cost: {brightSnapshotCost.toFixed(2)}
                    </span>
                  ) : null}
                  {typeof estimatedLlmCost === "number" ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Est. LLM cost: {estimatedLlmCost.toFixed(2)}
                    </span>
                  ) : null}
                  {typeof estimatedSearchTotalCost === "number" ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      Est. total cost: {estimatedSearchTotalCost.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Candidates considered</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{formatDisplayCount(recallProfileCount)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {topupTriggered ? "Expanded recall after first-pass quality check" : "From a broader LinkedIn search"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Profiles deeply reviewed</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{formatDisplayCount(deepReviewCompletedCount)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {deepReviewRequestedCount > deepReviewCompletedCount
                    ? `${formatDisplayCount(deepReviewRequestedCount)} requested`
                    : "Full profiles evaluated before final ranking"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Candidates shown</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{formatDisplayCount(visibleCandidateCount)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDisplayCount(shortlistYesCount)} shortlisted so far
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Shortlist decisions</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{shortlistYesCount} yes / {shortlistNoCount} no</p>
                <p className="mt-1 text-xs text-slate-500">
                  {hardBlockedCount > 0 || softBlockedCount > 0
                    ? `${hardBlockedCount} hard blocked, ${softBlockedCount} soft risks flagged`
                    : `${outreachPoolCount > 0 ? outreachPoolCount : allCandidates.length} candidates currently returned`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* JD original text toggle */}
      {showJd && search.jd_text && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">Original Job Description</p>
          <pre className="whitespace-pre-wrap text-sm text-muted leading-relaxed">{search.jd_text}</pre>
        </div>
      )}

      {/* Processing state with step progress */}
      {isPreResultsProcessing && (
        <ProcessingSteps
          pipelineStep={search.pipeline_step}
          searchPhase={searchPhase}
          standardRecallReady={standardRecallReady}
          firstShortlistCandidateAt={firstShortlistCandidateAt}
          providerDelayMs={providerDelayMs}
        />
      )}

      {/* Error state */}
      {search.status === "error" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">
                {errorPresentation.title}
              </p>
              <p className="text-xs text-red-600">
                {errorPresentation.body}
              </p>
              <p className="mt-2 text-xs text-red-600/90">
                {errorPresentation.hint}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {search.error_message?.includes("Settings") && (
                <Link
                  href="/app/settings"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors"
                >
                  Go to Settings
                </Link>
              )}
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
              >
                {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Retry shortlist run
              </button>
              <Link
                href={`/app/search/new?jd=${encodedJd}${analyticsContext.entry_mode === "workspace" ? "" : `&entry=${analyticsContext.entry_mode}`}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Refine JD and retry
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {allCandidates.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 text-sm text-slate-600 shadow-sm">
            {allCandidates.length === 0 ? (
              "No candidates have passed the recruiter shortlist yet. Refine the role or widen the search to unlock more viable targets."
            ) : isImprovingInBackground ? (
              <>
                <span className="font-semibold text-slate-950">Your candidate list is reviewable now.</span>
                {" "}Hirelix is still refining the remaining scores in the background.
              </>
            ) : isReadyWithWarning ? (
              <>
                <span className="font-semibold text-slate-950">
                  {shortlistReadyCount} candidate{shortlistReadyCount === 1 ? "" : "s"} ready to review
                </span>
                {" "}— top {topStartCount} are highlighted first
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-950">This list is worth working from now</span>
                {" "}— {visibleCandidateCount} candidate{visibleCandidateCount === 1 ? "" : "s"} are shown, the top {topStartCount} are highlighted, and {readyToActCount > 0 ? `${readyToActCount} already look ready to act on` : "the leading candidates already have clear fit signals"}
              </>
            )}
          </div>
          {billing?.plan.code === "free" && allCandidates.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,#fffdf7_0%,#fff7df_100%)] px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                Action unlock
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">
                These candidates are worth contacting.
              </h3>
              <p className="mt-2 text-sm text-slate-700">
                Upgrade to unlock contact details, export, and outreach execution the moment you are ready to work this shortlist.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{shortlistYesCount} shortlisted</span>
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{shortlistNoCount} screened out</span>
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{clearLocationFitDisplayCount} with clear location fit</span>
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{mustHaveStrongDisplayCount} with strong must-have coverage</span>
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{firstContactConfidenceCount} high-confidence first contacts</span>
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{contactUnlockCandidates} ready for contact unlock</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <PaddleCheckoutButton
                  checkout={{ type: "plan", planCode: "pro_monthly" }}
                  label="Unlock contact details"
                  onClick={() => handleUpgradeClick("results_first_use_strip")}
                  onError={(message) => setUpgradeError(message)}
                  className="inline-flex items-center justify-center rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300"
                />
                <p className="text-xs text-slate-600">
                  {topupTriggered
                    ? "Hirelix expanded recall depth to protect shortlist quality."
                    : "You can already review fit evidence now. Upgrade when you want to actually work the shortlist."}
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted">
                {showOnlyWithEmail
                  ? `${visibleCandidates.length} candidates with contact info`
                  : `${allCandidates.length} candidates ready to review`}
              </p>
              <div className="hidden items-center gap-1.5 text-xs text-muted-light sm:flex">
                {highlightedCandidates.length > 0 && (
                  <>
                    <span>Overall avg: {averageQuality}%</span>
                    <span>·</span>
                    <span>Range: {Math.min(...highlightedCandidates.map((c) => c.match_score))}–{Math.max(...highlightedCandidates.map((c) => c.match_score))}%</span>
                  </>
                )}
                {(hardBlockedCount > 0 || advanceableCount > 0) && (
                  <>
                    <span>·</span>
                    <span>{advanceableCount} advanceable / {hardBlockedCount} hard blocked</span>
                  </>
                )}
                {billing?.usage.exportEnabled ? (
                  <>
                    <span>·</span>
                    <span>
                      {`${allCandidates.filter((candidate) => candidate.email).length}/${allCandidates.length} with contact info`}
                    </span>
                  </>
                ) : (
                  <>
                    <span>·</span>
                    <span>Profiles sourced from LinkedIn</span>
                  </>
                )}
                <span>·</span>
                <span>Top {topStartCount} highlighted first</span>
              </div>
            </div>
            {isReviewable && (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span>Sort by</span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as CandidateSortMode)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  >
                    <option value="overall">Overall score</option>
                    <option value="capability">Capability</option>
                    <option value="relevance">Fit</option>
                    <option value="join_likelihood">Join likelihood</option>
                  </select>
                </label>
                {billing?.usage.exportEnabled && allCandidates.some((candidate) => candidate.email) && (
                  <>
                    <button
                      onClick={() => setShowOnlyWithEmail(!showOnlyWithEmail)}
                      className="text-xs cursor-pointer text-muted hover:text-foreground transition-colors"
                    >
                      {showOnlyWithEmail ? "Show all" : "Only with contact info"}
                    </button>
                    <span className="text-muted-light">·</span>
                  </>
                )}
                <button
                  onClick={() => toggleAll(visibleCandidates)}
                  className="text-xs cursor-pointer text-muted hover:text-foreground transition-colors"
                >
                  {visibleCandidates.length > 0 && visibleCandidates.every((candidate) => selectedIds.has(candidate.id))
                    ? "Deselect all"
                    : "Select all"}
                </button>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted">{selectedIds.size} selected →</span>
                    {["starred", "contacted", "rejected"].map((s) => (
                      <button
                        key={s}
                        onClick={() => bulkStatusChange(s)}
                        className="rounded-md cursor-pointer bg-surface px-2 py-0.5 text-xs font-medium text-muted capitalize hover:bg-surface-dark hover:text-foreground transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {visibleCandidates.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Recruiter-ranked shortlist
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Every candidate here passed the recruiter model&apos;s shortlist decision. The first {topStartCount} are highlighted as the current top picks.
                </p>
              </div>
              {visibleCandidates.map((c, idx) => (
                <div
                  key={c.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <CandidateCard
                    candidate={c}
                    onStatusChange={handleStatusChange}
                    onExpand={handleCandidateExpand}
                    requiredSkills={reqs && Array.isArray(reqs.required_skills) ? (reqs.required_skills as string[]) : []}
                    selected={selectedIds.has(c.id)}
                    onToggleSelect={() => toggleSelect(c.id)}
                    billingPlanCode={billing?.subscription.planCode || "free"}
                    enrichesRemaining={billing?.usage.enrichesRemaining ?? 0}
                    refreshBilling={refreshBilling}
                    onUpgradeClick={handleUpgradeClick}
                    highlighted={highlightedIds.has(c.id)}
                    isNew={isImprovingInBackground && newCandidateIds.has(c.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isReviewable && allCandidates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <p className="text-muted">No candidates passed the shortlist decision yet.</p>
          <p className="mt-2 max-w-md text-center text-sm text-muted">
            Hirelix did not find enough candidates the recruiter model felt confident adding to this shortlist. Tighten the JD, relax location requirements, or widen the target profile to unlock a larger funnel.
          </p>
          <Link
            href={`/app/search/new?jd=${encodedJd}${analyticsContext.entry_mode === "workspace" ? "" : `&entry=${analyticsContext.entry_mode}`}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refine & Retry
          </Link>
        </div>
      )}
    </div>
  );
}
