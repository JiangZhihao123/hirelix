"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import { ResultPageSkeleton } from "@/components/ProductSkeletons";
import { LinkedInScanAnimation } from "@/components/LinkedInScanAnimation";
import { useAuth } from "@/components/AuthProvider";
import { useBilling } from "@/lib/use-billing";
import { fetchWithUserSession } from "@/lib/client-auth";
import { CANDIDATE_STATUS_LABELS } from "@/lib/candidate-status";
import {
  getSearchTaskEtaCopy,
  getSearchTaskStage,
  getSearchTaskStageLabel,
  getSearchTaskSummary,
  inferSearchTaskRisks,
  isSearchTaskProcessingStatus,
} from "@/lib/search-task";
import { getSearchDisplayTitle } from "@/lib/search-title";
import {
  areSearchNotificationsPromisedInClient,
  getSearchCompletionFollowUpCopy,
} from "@/lib/search-notification-config";
import {
  isReviewableSearchStatus,
  isRunningSearchStatus,
  getStalledSearchMessage,
  isStaleProcessingSearch,
} from "@/lib/search-state";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromBrowser,
  trackEvent,
} from "@/lib/analytics";
import { PUBLIC_RESCORE_ERROR_MESSAGE } from "@/lib/public-errors";
import {
  ArrowLeft,
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Mail,
  MapPin,
  RotateCcw,
  ScanSearch,
  Search,
  Send,
} from "lucide-react";
import type {
  CandidateRow,
  CandidateSortMode,
  ExcludedReason,
  RecallMetadataView,
  SearchDisplayStats,
  SearchRow,
} from "./_components/types";
import {
  buildWidenPoolSuggestions,
  formatDisplayCount,
  formatDeliveryBucketLabel,
  formatElapsedMinutes,
  formatExcludedReasonLabel,
  formatLocationFlexibilityTag,
  formatRelocationTag,
  formatStartedAgo,
  deriveCurrentCompany,
  deriveCurrentRole,
  getCandidateCapabilityScore,
  getCandidateDeliveryBucket,
  getCandidateDisplayTier,
  getCandidateJoinLikelihoodScore,
  getCandidateOverallScore,
  getCandidateRelevanceScore,
  getCandidateSellingKit,
  getProviderDelayCopy,
  getSearchErrorPresentation,
  getCandidateDecisionAudit,
  getSearchPageCacheKey,
  hidePublicEvidenceLine,
  parseOutreach,
  positiveInt,
  readSearchPageCache,
  formatRecruiterSellingHeadline,
} from "./_components/utils";
import { CandidateCard } from "./_components/CandidateCard";
import { CandidateWorkbenchDetail } from "./_components/CandidateWorkbenchDetail";
import { CandidateWorkbenchListItem } from "./_components/CandidateWorkbenchListItem";
import { TaskTimelinePanel } from "./_components/TaskTimelinePanel";

type CandidatePoolView = "recommended" | "full_pool";

function buildCandidateClientBrief(candidate: CandidateRow, index: number, hidePublicEvidence = false) {
  const sellingKit = getCandidateSellingKit(candidate);
  const headline = formatRecruiterSellingHeadline(candidate, { hidePublicEvidence });
  const currentRole = deriveCurrentRole(candidate);
  const currentCompany = deriveCurrentCompany(candidate);
  const titleLine = [
    `${index + 1}. ${candidate.name}`,
    currentRole,
    currentCompany,
    candidate.location,
  ].filter(Boolean).join(" | ");
  const clientBrief = sellingKit?.client_brief;
  const whyMatchSource = clientBrief?.why_match?.length
    ? clientBrief.why_match
    : candidate.match_reasons.slice(0, 3);
  const whyMatch = whyMatchSource.map(hidePublicEvidenceLine).filter((item): item is string => Boolean(item));
  const evidence = hidePublicEvidence ? [] : clientBrief?.evidence_refs?.length
    ? clientBrief.evidence_refs
    : (sellingKit?.evidence_badges || [])
        .map((badge) => [badge.label, badge.citation_label].filter(Boolean).join(" "))
        .filter(Boolean);
  const risks = clientBrief?.risks_to_verify?.length
    ? clientBrief.risks_to_verify
    : sellingKit?.risk_flags || [];

  return [
    titleLine,
    headline || hidePublicEvidenceLine(clientBrief?.positioning) || candidate.headline || "",
    whyMatch.length ? "Why match:" : "",
    ...whyMatch.map((item) => `- ${item}`),
    evidence.length ? "Evidence:" : "",
    ...evidence.slice(0, 3).map((item) => `- ${item}`),
    risks.length ? "Risks to verify:" : "",
    ...risks.slice(0, 2).map((item) => `- ${item}`),
  ].filter(Boolean).join("\n");
}

export default function SearchResultPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { billing, refresh: refreshBilling } = useBilling();
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [newCandidateIds, setNewCandidateIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showJd, setShowJd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showOnlyWithEmail, setShowOnlyWithEmail] = useState(false);
  const [sortMode, setSortMode] = useState<CandidateSortMode>("overall");
  const [poolView, setPoolView] = useState<CandidatePoolView>("recommended");
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [copiedWorkflowAction, setCopiedWorkflowAction] = useState<string | null>(null);
  const [publicEvidenceQueueingId, setPublicEvidenceQueueingId] = useState<string | null>(null);
  const [publicEvidenceError, setPublicEvidenceError] = useState<string | null>(null);
  const [, setUpgradeError] = useState<string | null>(null);
  const [rescoreError, setRescoreError] = useState<string | null>(null);
  const [rescoreSubmitting, setRescoreSubmitting] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [expandSubmitting, setExpandSubmitting] = useState(false);
  const hasTrackedTaskViewRef = useRef(false);
  const hasTrackedBriefReadyViewRef = useRef(false);
  const hasTrackedProcessingViewRef = useRef(false);
  const hasTrackedResultsViewRef = useRef(false);
  const hasTrackedResultsSummaryViewRef = useRef(false);
  const hasTrackedDoneRef = useRef(false);
  const hasTrackedProcessingReassuranceRef = useRef(false);
  const hasTrackedUpgradeValueExposedRef = useRef(false);
  const hasTrackedClientBriefGateRef = useRef(false);
  const seenCandidateIdsRef = useRef<Set<string>>(new Set());
  const searchEmailNotificationsEnabled = areSearchNotificationsPromisedInClient();
  const analyticsContext = getAnalyticsContextFromBrowser({
    entry_mode: searchParams.get("entry") === "landing"
      ? "landing"
      : searchParams.get("entry") === "signin"
        ? "signin"
        : searchParams.get("entry") === "free_trial"
          ? "free_trial"
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
    await Promise.all(
      ids.map((cid) =>
        fetchWithUserSession(`/api/candidates/${cid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }).catch(() => null),
      ),
    );
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
    a.download = `${getSearchDisplayTitle({
      title: search?.title,
      parsedRequirements: search?.parsed_requirements,
      fallback: "candidates",
    })}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyWorkflowText(text: string, action: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedWorkflowAction(action);
    window.setTimeout(() => setCopiedWorkflowAction(null), 1800);
  }

  async function rerunScoringFromCache() {
    if (!id || rescoreSubmitting) return;
    setRescoreError(null);
    setRescoreSubmitting(true);
    try {
      const response = await fetchWithUserSession(`/api/search/${id}/rescore`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(PUBLIC_RESCORE_ERROR_MESSAGE);
      }
      window.sessionStorage.removeItem(getSearchPageCacheKey(id));
      await fetchData();
    } catch (error) {
      setRescoreError(error instanceof Error ? error.message : PUBLIC_RESCORE_ERROR_MESSAGE);
    } finally {
      setRescoreSubmitting(false);
    }
  }

  async function expandCandidatePool() {
    if (!id || expandSubmitting) return;
    setExpandError(null);
    setExpandSubmitting(true);
    try {
      const response = await fetchWithUserSession(`/api/search/${id}/expand`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Could not expand this candidate pool.");
      }
      window.sessionStorage.removeItem(getSearchPageCacheKey(id));
      await Promise.all([fetchData(), refreshBilling()]);
    } catch (error) {
      setExpandError(error instanceof Error ? error.message : "Could not expand this candidate pool.");
    } finally {
      setExpandSubmitting(false);
    }
  }

  const fetchData = useCallback(async () => {
    if (authLoading || !user || !id) return;

    let searchData: SearchRow | null = null;
    let candidatesData: CandidateRow[] | null = null;
    try {
      const res = await fetchWithUserSession(`/api/searches/${id}`);
      if (res.ok) {
        const payload = (await res.json()) as {
          search: SearchRow;
          candidates: CandidateRow[];
        };
        searchData = payload.search ?? null;
        candidatesData = payload.candidates ?? [];
      }
    } catch {
      // best-effort
    }

    let normalizedSearch = searchData;
    if (
      searchData &&
      isStaleProcessingSearch(searchData.status, searchData.updated_at)
    ) {
      try {
        await fetchWithUserSession(`/api/searches/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "error",
            pipeline_step: "error",
            error_message: getStalledSearchMessage(),
          }),
        });
      } catch {
        // best-effort
      }

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
        const aRank = typeof a.metadata?.scored_rank === "number" ? a.metadata.scored_rank : Number.POSITIVE_INFINITY;
        const bRank = typeof b.metadata?.scored_rank === "number" ? b.metadata.scored_rank : Number.POSITIVE_INFINITY;
        if (aRank !== bRank) return aRank - bRank;
        const aHasEmail = !!a.email;
        const bHasEmail = !!b.email;
        if (aHasEmail !== bHasEmail) return bHasEmail ? 1 : -1;
        return b.match_score - a.match_score;
      });
      setCandidates(sorted);
    }
  }, [authLoading, user, id]);

  useEffect(() => {
    if (!id) return;
    const cachedSnapshot = readSearchPageCache(id);
    if (!cachedSnapshot) return;

    setSearch(cachedSnapshot.search);
    setCandidates(cachedSnapshot.candidates);
    seenCandidateIdsRef.current = new Set(cachedSnapshot.candidates.map((candidate) => candidate.id));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (authLoading) return;

    const timeoutId = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [authLoading, fetchData]);

  useEffect(() => {
    if (!id || !search) return;

    window.sessionStorage.setItem(
      getSearchPageCacheKey(id),
      JSON.stringify({
        search,
        candidates,
      }),
    );
  }, [candidates, id, search]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData]);

  // Fast poll while search is actively progressing or refining results.
  useEffect(() => {
    if (!search || !isRunningSearchStatus(search.status)) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchData, search]);

  useEffect(() => {
    if (!search || !isSearchTaskProcessingStatus(search.status) || hasTrackedTaskViewRef.current) {
      return;
    }
    hasTrackedTaskViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.searchTaskView, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      pipeline_step: search.pipeline_step ?? "unknown",
    });
  }, [analyticsContext, search]);

  useEffect(() => {
    if (!search?.parse_completed_at || hasTrackedBriefReadyViewRef.current) return;
    hasTrackedBriefReadyViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.searchBriefReadyView, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      pipeline_step: search.pipeline_step ?? "unknown",
    });
  }, [analyticsContext, search]);

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
    if (!hasTrackedResultsSummaryViewRef.current) {
      hasTrackedResultsSummaryViewRef.current = true;
      trackEvent(ANALYTICS_EVENTS.resultsSummaryView, {
        ...analyticsContext,
        search_id: search.id,
        search_status: search.status,
        candidate_count: candidates.length,
        reach_out_first_count: candidates.filter(
          (candidate) => getCandidateDisplayTier(candidate) === "priority_outreach",
        ).length,
        worth_reviewing_count: candidates.filter(
          (candidate) => getCandidateDisplayTier(candidate) === "worth_reviewing",
        ).length,
        contact_ready_count: candidates.filter((candidate) => Boolean(candidate.email)).length,
        plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      });
    }
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
    trackEvent(ANALYTICS_EVENTS.contactUnlockGateView, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      candidate_count: candidates.length,
      upgrade_surface: "results_capability_unlock",
    });
  }, [analyticsContext, billing?.plan.code, candidates, search]);

  useEffect(() => {
    if (
      !search ||
      !isReviewableSearchStatus(search.status) ||
      candidates.length === 0 ||
      billing?.usage.clientBriefEnabled ||
      hasTrackedClientBriefGateRef.current
    ) {
      return;
    }

    hasTrackedClientBriefGateRef.current = true;
    trackEvent(ANALYTICS_EVENTS.clientBriefGateView, {
      ...analyticsContext,
      search_id: search.id,
      search_status: search.status,
      candidate_count: candidates.length,
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      upgrade_surface: "results_client_brief_gate",
    });
  }, [analyticsContext, billing, candidates.length, search]);


  async function handleStatusChange(candidateId: string, newStatus: string) {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId ? { ...c, status: newStatus } : c,
      ),
    );
    try {
      await fetchWithUserSession(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // best-effort; UI state is optimistic
    }
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

  async function handlePublicEvidenceDeepDive(candidate: CandidateRow) {
    if (publicEvidenceQueueingId) return;
    if (
      billing?.plan.code === "free" ||
      (billing?.usage.publicEvidenceDeepDivesRemaining ?? 0) <= 0
    ) {
      handleUpgradeClick("candidate_public_evidence_deep_dive");
      setPublicEvidenceError("Start a subscription to unlock public evidence deep dives.");
      return;
    }

    setPublicEvidenceError(null);
    setPublicEvidenceQueueingId(candidate.id);
    try {
      const res = await fetchWithUserSession(`/api/candidates/${candidate.id}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_evidence: true }),
      });
      if (!res.ok) {
        throw new Error("Could not start public evidence deep dive.");
      }
      const data = await res.json();
      if (data.metadata) {
        setCandidates((current) =>
          current.map((row) =>
            row.id === candidate.id
              ? { ...row, metadata: data.metadata }
              : row,
          ),
        );
      }
      await refreshBilling();
    } catch (error) {
      setPublicEvidenceError(error instanceof Error ? error.message : "Could not start public evidence deep dive.");
    } finally {
      setPublicEvidenceQueueingId(null);
    }
  }

  if (loading) {
    return <ResultPageSkeleton />;
  }

  if (!search) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted">Candidate pool not found</p>
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
  const launchScope = typeof reqs?.launch_scope === "string" ? reqs.launch_scope : null;
  const isReviewable = isReviewableSearchStatus(search.status);
  const isImprovingInBackground = search.status === "deep_scoring";
  const isPreResultsProcessing =
    search.status === "queued" ||
    search.status === "parsing" ||
    search.status === "searching" ||
    search.status === "screening";
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
    const leftRank = typeof left.metadata?.scored_rank === "number" ? left.metadata.scored_rank : Number.POSITIVE_INFINITY;
    const rightRank = typeof right.metadata?.scored_rank === "number" ? right.metadata.scored_rank : Number.POSITIVE_INFINITY;
    return rightPrimary - leftPrimary || rightSecondary - leftSecondary || leftRank - rightRank;
  });
  const rawDisplayStats =
    reqs && typeof reqs.display_stats === "object" && reqs.display_stats
      ? (reqs.display_stats as SearchDisplayStats)
      : null;
  const priorityCandidates = allCandidates.filter(
    (candidate) => getCandidateDisplayTier(candidate) === "priority_outreach",
  );
  const worthReviewingCandidates = allCandidates.filter(
    (candidate) => getCandidateDisplayTier(candidate) === "worth_reviewing",
  );
  const recommendedCandidates = allCandidates.filter((candidate) => {
    const bucket = getCandidateDeliveryBucket(candidate);
    return bucket === "reach_first" || bucket === "review_next";
  });
  const lowerPriorityCandidates = allCandidates.filter((candidate) => {
    const bucket = getCandidateDeliveryBucket(candidate);
    return bucket === "lower_priority" || bucket === "not_recommended";
  });
  const actualPriorityOutreachCount = priorityCandidates.length;
  const actualWorthReviewingCount = worthReviewingCandidates.length;
  const tierBaseCandidates = poolView === "full_pool"
    ? allCandidates
    : recommendedCandidates.length > 0
      ? recommendedCandidates
      : allCandidates;
  const visibleCandidates = showOnlyWithEmail
    ? tierBaseCandidates.filter((candidate) => candidate.email)
    : tierBaseCandidates;
  const activeCandidate =
    visibleCandidates.find((candidate) => candidate.id === activeCandidateId) ||
    visibleCandidates[0] ||
    null;

  const averageQuality = visibleCandidates.length
    ? Math.round(
        visibleCandidates.reduce((sum, candidate) => sum + candidate.match_score, 0) /
          visibleCandidates.length,
      )
    : 0;
  const recallMetadata =
    reqs && typeof reqs.recall_metadata === "object" && reqs.recall_metadata
      ? (reqs.recall_metadata as RecallMetadataView)
      : null;
  const canRerunScoringFromCache = isReviewable && Boolean(recallMetadata?.snapshot_id);
  const currentProfileScanBudget =
    positiveInt(reqs?.profile_scan_budget) ??
    positiveInt(rawDisplayStats?.bright_profiles_requested) ??
    positiveInt(recallMetadata?.bright_profiles_requested) ??
    null;
  const canExpandCandidatePool =
    isReviewable &&
    !isRunningSearchStatus(search.status) &&
    billing?.plan.code !== "free" &&
    (billing?.usage.profileScansRemaining ?? 0) > 0;
  const searchStartedAt =
    reqs && typeof reqs.search_started_at === "string"
      ? reqs.search_started_at
      : search.queued_at || search.created_at;
  const standardRecallCompletedAt =
    recallMetadata?.standard_recall_completed_at ??
    recallMetadata?.completed_at ??
    null;
  const briefReadyAt =
    rawDisplayStats?.brief_ready_at ??
    search.parse_completed_at ??
    null;
  const timeToBriefReadyMs =
    rawDisplayStats?.time_to_brief_ready_ms ??
    (briefReadyAt && searchStartedAt
      ? Math.max(0, Date.parse(briefReadyAt) - Date.parse(searchStartedAt))
      : null);
  const timeToStandardRecallReadyMs =
    rawDisplayStats?.time_to_standard_recall_ready_ms ??
    (standardRecallCompletedAt && searchStartedAt
      ? Math.max(0, Date.parse(standardRecallCompletedAt) - Date.parse(searchStartedAt))
      : null);
  const providerDelayMs =
    !standardRecallCompletedAt && searchStartedAt && search.updated_at
      ? Math.max(0, Date.parse(search.updated_at) - Date.parse(searchStartedAt))
      : null;
  const standardRecallReady = Boolean(standardRecallCompletedAt);
  const brightProfilesReturned =
    positiveInt(rawDisplayStats?.bright_profiles_returned) ?? null;
  const retrievalCount =
    positiveInt(rawDisplayStats?.retrieval_count) ??
    Math.max(allCandidates.length, 0);
  const deepReviewCompletedCount =
    positiveInt(rawDisplayStats?.deep_review_completed_count) ??
    positiveInt(rawDisplayStats?.deep_review_count) ??
    Math.max(allCandidates.length, 0);
  const deliveredCandidateCount = allCandidates.length;
  const priorityOutreachCount = actualPriorityOutreachCount;
  const worthReviewingCount = actualWorthReviewingCount;
  const isFreePlan = billing?.plan.code === "free";
  const ruledOutCount =
    positiveInt(rawDisplayStats?.ruled_out_count) ??
    positiveInt(rawDisplayStats?.do_not_show_count) ??
    0;
  const visibleCandidateCount = recommendedCandidates.length;
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
  const excludedReasonCounts =
    Array.isArray(rawDisplayStats?.excluded_reason_counts)
      ? rawDisplayStats.excluded_reason_counts
      : [];
  const widenPoolSuggestions = buildWidenPoolSuggestions(excludedReasonCounts as Array<{ reason: ExcludedReason; count: number }>);
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
  const recommendedCount = recommendedCandidates.length;
  const lowerPriorityCount = lowerPriorityCandidates.length;
  const hasCompleteRankedPool =
    deepReviewCompletedCount <= allCandidates.length ||
    Math.abs(deepReviewCompletedCount - allCandidates.length) <= 1;
  const poolCoverageCopy = hasCompleteRankedPool
    ? `${recommendedCount} are recommended for client review; the rest stay available as lower-priority market coverage.`
    : `${recommendedCount} are recommended for client review. This older run shows the saved ranked pool; run or expand the role to build the full pool.`;
  const selectedPoolLabel = poolView === "full_pool" ? "Full pool" : "Recommended";
  const taskStage = getSearchTaskStage({
    ...search,
    standard_recall_completed_at: standardRecallCompletedAt,
  });
  const taskRisks = inferSearchTaskRisks({
    requiredSkills,
    workModel,
    locationScope,
    locationFlexibility,
    relocationAllowed,
    constraintReasoning,
  });
  const displayTitle = getSearchDisplayTitle({
    title: search.title,
    parsedRequirements: search.parsed_requirements,
    fallback: "New candidate pool",
  });
  const clientReadyCandidates = (recommendedCandidates.length > 0 ? recommendedCandidates : allCandidates).slice(0, 5);
  const actionPlanCandidates = (recommendedCandidates.length > 0 ? recommendedCandidates : allCandidates)
    .slice(0, 3)
    .map((candidate, index) => ({
      candidate,
      audit: getCandidateDecisionAudit(candidate, index + 1, {
        hidePublicEvidence: isFreePlan,
      }),
    }));
  const clientReadyBriefText = [
    `Client-ready recommended pool: ${displayTitle}`,
    locationScope ? `Location/work model: ${[locationScope, workModel].filter(Boolean).join(" | ")}` : null,
    requiredSkills.length > 0 ? `Must-haves: ${requiredSkills.slice(0, 8).join(", ")}` : null,
    "",
    ...clientReadyCandidates.map((candidate, index) => buildCandidateClientBrief(candidate, index, isFreePlan)),
  ].filter((line): line is string => typeof line === "string").join("\n\n");
  const outreachQueueCandidates = (priorityCandidates.length > 0 ? priorityCandidates : recommendedCandidates)
    .filter((candidate) => candidate.status !== "rejected" && candidate.status !== "placed")
    .slice(0, 8);
  const validationCounts = {
    contacted: allCandidates.filter((candidate) => candidate.status === "contacted").length,
    replied: allCandidates.filter((candidate) => candidate.status === "replied").length,
    submitted: allCandidates.filter((candidate) => candidate.status === "submitted").length,
    interview: allCandidates.filter((candidate) => candidate.status === "interview").length,
    placed: allCandidates.filter((candidate) => candidate.status === "placed").length,
  };
  const risksFoundCount = allCandidates.filter((candidate) => {
    const audit = getCandidateDecisionAudit(candidate, undefined, {
      hidePublicEvidence: isFreePlan,
    });
    return audit.riskLines.length > 0;
  }).length;
  const briefReadyLabel = formatElapsedMinutes(timeToBriefReadyMs);
  const standardRecallReadyLabel = formatElapsedMinutes(timeToStandardRecallReadyMs);
  const errorPresentation = getSearchErrorPresentation();
  const entryQuery =
    analyticsContext.entry_mode === "workspace"
      ? ""
      : `?entry=${analyticsContext.entry_mode}`;
  const encodedJd = encodeURIComponent(search.jd_text);

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/app"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to candidate pools
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            {displayTitle}
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
              {canRerunScoringFromCache && (
                <button
                  onClick={rerunScoringFromCache}
                  disabled={rescoreSubmitting}
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-muted-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw className={`h-3 w-3 ${rescoreSubmitting ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">
                    {rescoreSubmitting ? "Rerunning scores" : "Rerun scoring"}
                  </span>
                  <span className="sm:hidden">Rescore</span>
                </button>
              )}
              {canExpandCandidatePool ? (
                <button
                  onClick={expandCandidatePool}
                  disabled={expandSubmitting}
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ScanSearch className={`h-3 w-3 ${expandSubmitting ? "animate-pulse" : ""}`} />
                  <span className="hidden sm:inline">
                    {expandSubmitting ? "Expanding pool" : "Expand pool"}
                  </span>
                  <span className="sm:hidden">Expand</span>
                </button>
              ) : billing?.plan.code === "free" && isReviewable ? (
                <Link
                  href="/app/settings#billing"
                  onClick={() => handleUpgradeClick("results_expand_pool_gate")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                >
                  <ScanSearch className="h-3 w-3" />
                  Expand pool
                </Link>
              ) : null}
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
                    Export this pool
                  </Link>
                ))}
              <Link
                href={`/app/search/new${entryQuery}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
              >
                <Search className="h-3 w-3" />
                New search
              </Link>
            </div>
          )}
        </div>
        {reqs && !isReviewable && (
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
                  {formatLocationFlexibilityTag(locationFlexibility)}
                </span>
              )}
              {relocationAllowed && relocationAllowed !== "unknown" && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {formatRelocationTag(relocationAllowed)}
                </span>
              )}
              {launchScope === "linkedin_plus_github" && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  Public evidence available as a deep dive
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
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-[1.3fr,0.7fr]">
            <div className="rounded-3xl border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#f5faff_100%)] p-6 shadow-[0_16px_40px_rgba(14,165,233,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                {getSearchTaskStageLabel(taskStage)}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {taskStage === "accepted"
                  ? "Your search has been accepted."
                  : taskStage === "brief_ready"
                    ? "Hirelix understands the role and is moving into recall."
                    : taskStage === "linkedin_scan"
                      ? "Scanning LinkedIn at scale."
                      : "Reviewing your candidates now."}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                {getSearchTaskSummary(taskStage)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1">
                  Started {formatStartedAgo(searchStartedAt)} ago
                </span>
                <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1">
                  {getSearchTaskEtaCopy(search.status, taskStage)}
                </span>
                <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1">
                  {getSearchCompletionFollowUpCopy(searchEmailNotificationsEnabled)}
                </span>
              </div>
              <p className="mt-4 max-w-2xl text-xs text-slate-500">
                {standardRecallReady
                  ? `LinkedIn scan finished in ${standardRecallReadyLabel}. Now reviewing the strongest matches.`
                  : getProviderDelayCopy(providerDelayMs, searchEmailNotificationsEnabled)}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-950"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to dashboard
                </Link>
                <Link
                  href={`/app/search/new?jd=${encodedJd}${analyticsContext.entry_mode === "workspace" ? "" : `&entry=${analyticsContext.entry_mode}`}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                >
                  <FileText className="h-4 w-4" />
                  Refine JD
                </Link>
              </div>
            </div>
            <TaskTimelinePanel
              search={{
                ...search,
                standard_recall_completed_at: standardRecallCompletedAt,
              }}
              metrics={{
                recalledCount: recallProfileCount,
                reviewedCount: deepReviewCompletedCount,
                visibleCandidateCount,
              }}
            />
          </div>
          {(taskStage === "linkedin_scan" || taskStage === "reviewing_profiles") && (
            <LinkedInScanAnimation
              stage={taskStage}
              roleTitle={typeof roleCore?.title === "string" && roleCore.title ? roleCore.title : displayTitle}
              startedAt={searchStartedAt}
              briefReadyAt={briefReadyAt}
              recallCompletedAt={standardRecallCompletedAt}
              recallProfileCount={recallProfileCount}
              candidateCount={visibleCandidateCount}
              elapsedLabel={searchStartedAt ? formatStartedAgo(searchStartedAt) : null}
              canLeavePage
            />
          )}
          <div className="mb-6 grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Sourcing brief
              </p>
              {briefReadyAt ? (
                <>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">
                    {typeof roleCore?.title === "string" && roleCore.title
                      ? roleCore.title
                      : displayTitle}
                  </h3>
                  <p className="mt-2 text-xs text-slate-500">
                    Brief ready in {briefReadyLabel}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                    {typeof roleCore?.seniority === "string" && roleCore.seniority && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                        {roleCore.seniority}
                      </span>
                    )}
                    {workModel && workModel !== "unknown" && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                        {workModel}
                      </span>
                    )}
                    {locationScope && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                        {locationScope}
                      </span>
                    )}
                    {relocationAllowed && relocationAllowed !== "unknown" && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                        {formatRelocationTag(relocationAllowed)}
                      </span>
                    )}
                  </div>
                  {requiredSkills.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                        Required skills
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {requiredSkills.slice(0, 10).map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs text-sky-700"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {constraintReasoning && (
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                      {constraintReasoning}
                    </p>
                  )}
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  Hirelix is still building the sourcing brief from the JD. This section will fill in as soon as parsing finishes.
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Search risks
              </p>
              <div className="mt-4 space-y-3">
                {taskRisks.map((risk) => (
                  <div
                    key={risk.key}
                    className={`rounded-2xl border px-4 py-3 ${
                      risk.tone === "caution"
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle className={`h-4 w-4 ${risk.tone === "caution" ? "text-amber-600" : "text-slate-400"}`} />
                      <p className="text-sm font-medium text-slate-950">{risk.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {risk.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {isReviewable && allCandidates.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	              <div className="min-w-0">
	              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
	                {isImprovingInBackground ? "Candidate pool ready" : "Candidate pool complete"}
	              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                {isImprovingInBackground
                  ? "Your candidate pool is ready to review"
                  : "Your candidate pool is ready"}
              </h2>
              <p className="mt-1 max-w-4xl text-sm text-slate-600">
	                {isImprovingInBackground
	                  ? "Hirelix is still refining the remaining scores in the background."
	                  : `Hirelix reviewed ${formatDisplayCount(deepReviewCompletedCount)} sourced profiles. ${poolCoverageCopy}`}
              </p>
              {billing?.plan.code !== "free" && (
                <p className="mt-2 text-xs text-slate-500">
                  {currentProfileScanBudget
                    ? `${currentProfileScanBudget.toLocaleString("en-US")} targeted profiles in this role budget. ${billing?.usage.profileScansRemaining ?? 0} scans left this cycle.`
                    : `${billing?.usage.profileScansRemaining ?? 0} targeted scans left this cycle.`}
                </p>
              )}
              {isImprovingInBackground && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-sky-500" />
	                  {candidates.length > 0
	                    ? `Scored ${candidates.length} candidate${candidates.length === 1 ? "" : "s"} so far — still reviewing${rawDisplayStats?.deep_review_completed_count && rawDisplayStats?.deep_review_requested_count ? ` (${rawDisplayStats.deep_review_completed_count}/${rawDisplayStats.deep_review_requested_count} reviewed)` : ""}...`
	                    : "The ranked candidate pool is still growing as more recalled profiles are reviewed..."}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
	                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sourced</span>
	                <span className="text-sm font-semibold text-slate-950">{recallProfileCount}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Reach first</span>
                <span className="text-sm font-semibold text-slate-950">{priorityOutreachCount}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
	                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Review next</span>
	                <span className="text-sm font-semibold text-slate-950">{worthReviewingCount}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
	                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Lower priority</span>
	                <span className="text-sm font-semibold text-slate-950">{lowerPriorityCount}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Risks found</span>
                <span className="text-sm font-semibold text-slate-950">{risksFoundCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReviewable && allCandidates.length > 0 && (
        <div className="mb-4 grid min-w-0 gap-4 xl:grid-cols-[1.05fr,0.95fr]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
	                  Search outcome
	                </p>
	                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
	                  {recommendedCount > 0
	                    ? `${recommendedCount} recommended candidates, backed by a ${allCandidates.length}-profile ranked pool.`
	                    : `${allCandidates.length} sourced profiles are ready for market review.`}
	                </h2>
	                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
	                  Start with recommended profiles, then use the full pool to understand the market and recover edge cases.
	                </p>
              </div>
              <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto xl:grid-cols-5">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
	                  <p className="break-words text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sourced</p>
	                  <p className="mt-1 text-xl font-semibold text-slate-950">{recallProfileCount}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="break-words text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Reach first</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">{priorityOutreachCount}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
	                  <p className="break-words text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">Review next</p>
	                  <p className="mt-1 text-xl font-semibold text-slate-950">{worthReviewingCount}</p>
	                </div>
	                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
	                  <p className="break-words text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Lower priority</p>
	                  <p className="mt-1 text-xl font-semibold text-slate-950">{lowerPriorityCount}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                  <p className="break-words text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">Risks found</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">{risksFoundCount}</p>
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {actionPlanCandidates.map(({ candidate, audit }, index) => (
                <div key={candidate.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-semibold text-white">
                      #{index + 1}
                    </span>
                    <p className="text-sm font-semibold text-slate-950">{candidate.name}</p>
                  </div>
                  <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    audit.trust.tone === "strong"
                      ? "bg-emerald-100 text-emerald-800"
                      : audit.trust.tone === "medium"
                        ? "bg-sky-100 text-sky-800"
                        : "bg-amber-100 text-amber-800"
                  }`}>
                    {audit.trust.label}
                  </p>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-700">
                    <span className="font-semibold text-slate-950">Proof:</span>{" "}
                    {audit.proofLines[0]}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-amber-800">
                    <span className="font-semibold">Risk:</span>{" "}
                    {audit.riskLines[0]}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-emerald-800">
                    {audit.nextAction}
                  </p>
                </div>
              ))}
            </div>
          </section>
	          <section
	            data-testid="client-ready-recommended-pool"
            className="min-w-0 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
	                  Client-ready recommended pool
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  Copy a client brief before you start outreach.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Use this as the recruiter-facing summary: who to lead with, why they fit, what proof is usable, and what still needs verification.
                </p>
              </div>
              {billing?.usage.clientBriefEnabled ? (
                <button
                  type="button"
                  data-testid="copy-client-brief"
                  onClick={() => copyWorkflowText(clientReadyBriefText, "client-brief")}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  {copiedWorkflowAction === "client-brief" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedWorkflowAction === "client-brief" ? "Copied" : "Copy brief"}
                </button>
              ) : (
                <PaddleCheckoutButton
                  checkout={{ type: "plan", planCode: "starter_monthly" }}
                  label="Upgrade to Starter for client briefs"
                  onClick={() => handleUpgradeClick("results_client_brief_gate")}
                  onError={(message) => setUpgradeError(message)}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                />
              )}
            </div>
            <div className="mt-4 space-y-3">
              {clientReadyCandidates.map((candidate, index) => {
                const sellingKit = getCandidateSellingKit(candidate);
                const headline = formatRecruiterSellingHeadline(candidate, { hidePublicEvidence: isFreePlan });
                const currentCompany = deriveCurrentCompany(candidate);
                const currentRole = deriveCurrentRole(candidate);
                return (
                  <div key={candidate.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        #{index + 1}
                      </span>
                      <p className="text-sm font-semibold text-slate-950">{candidate.name}</p>
                      <span className="text-xs text-slate-500">
                        {[currentRole, currentCompany, candidate.location].filter(Boolean).join(" | ")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {headline ||
                        hidePublicEvidenceLine(sellingKit?.client_brief?.positioning) ||
                        hidePublicEvidenceLine(candidate.match_reasons[0]) ||
                        "Relevant based on the current profile fit and risk signals."}
                    </p>
                    {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || []).length > 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        Verify: {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || []).slice(0, 2).join("; ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section
            data-testid="outreach-approval-queue"
            className="min-w-0 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                  Outreach approval queue
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  Review, copy, then mark progress.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
	                  This keeps the workflow human-in-the-loop while still moving recommended candidates to contacted, replied, submitted, interview, and placed.
                </p>
              </div>
              <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {(["contacted", "replied", "submitted", "interview", "placed"] as const).map((status) => (
                  <div
                    key={status}
                    data-testid={`validation-count-${status}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                  >
                    <p>{CANDIDATE_STATUS_LABELS[status]}</p>
                    <p
                      data-testid={`validation-count-${status}-value`}
                      className="mt-1 text-sm text-slate-950"
                    >
                      {validationCounts[status]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {outreachQueueCandidates.map((candidate) => {
                const outreach = parseOutreach(candidate.outreach_draft);
                const linkedinCopy = outreach.linkedin || outreach.email || "";
                const emailCopy = outreach.email
                  ? [outreach.subject ? `Subject: ${outreach.subject}` : null, outreach.email].filter(Boolean).join("\n\n")
                  : "";
                return (
                  <div
                    key={candidate.id}
                    data-testid={`outreach-queue-candidate-${candidate.id}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">{candidate.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {[deriveCurrentRole(candidate), deriveCurrentCompany(candidate), candidate.location].filter(Boolean).join(" | ")}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {CANDIDATE_STATUS_LABELS[candidate.status as keyof typeof CANDIDATE_STATUS_LABELS] || candidate.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid={`copy-linkedin-${candidate.id}`}
                        disabled={!linkedinCopy}
                        onClick={() => copyWorkflowText(linkedinCopy, `linkedin-${candidate.id}`)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copiedWorkflowAction === `linkedin-${candidate.id}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        LinkedIn copy
                      </button>
                      <button
                        type="button"
                        disabled={!emailCopy}
                        onClick={() => copyWorkflowText(emailCopy, `email-${candidate.id}`)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copiedWorkflowAction === `email-${candidate.id}` ? <Check className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                        Email copy
                      </button>
                      {candidate.profile_url && (
                        <a
                          href={candidate.profile_url.replace("://linkedin.com", "://www.linkedin.com")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Open profile
                        </a>
                      )}
                      {(["contacted", "submitted"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          data-testid={`mark-${status}-${candidate.id}`}
                          onClick={() => void handleStatusChange(candidate.id, status)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Mark {CANDIDATE_STATUS_LABELS[status].toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* JD original text toggle */}
      {showJd && search.jd_text && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">Original Job Description</p>
          <pre className="whitespace-pre-wrap text-sm text-muted leading-relaxed">{search.jd_text}</pre>
        </div>
      )}

      {rescoreError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {rescoreError}
        </div>
      )}

      {expandError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {expandError}
        </div>
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
              <Link
                href={`/app/search/new?jd=${encodedJd}${analyticsContext.entry_mode === "workspace" ? "" : `&entry=${analyticsContext.entry_mode}`}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Refine JD and search again
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {allCandidates.length > 0 && (
        <div className="space-y-3">
	          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
	              <div>
	                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
	                  Candidate pool
	                </p>
	                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
	                  Reviewed {recallProfileCount} sourced profiles. {recommendedCount} recommended for client review.
	                </h2>
	              </div>
              <p className="text-xs text-slate-500">
                Workflow: {validationCounts.contacted} contacted · {validationCounts.submitted} submitted · {validationCounts.interview} interview · {validationCounts.placed} placed
              </p>
            </div>
	            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
	              {[
	                { label: "Sourced profiles", value: recallProfileCount },
	                { label: "Full pool", value: deliveredCandidateCount },
	                { label: "Recommended", value: recommendedCount },
	                { label: "Reach first", value: priorityOutreachCount },
	                { label: "Review next", value: worthReviewingCount },
	              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
          </section>
          {isFreePlan && (billing?.usage.enrichesRemaining ?? 0) <= 0 && allCandidates.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,#fffdf7_0%,#fff7df_100%)] px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                Action unlock
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">
                Unlock contact lookup and deep evidence when you are ready.
              </h3>
              <p className="mt-2 text-sm text-slate-700">
                Upgrade for email lookup, public evidence deep dives, CSV export, and client-ready briefs on the candidates you choose.
              </p>
	              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
	                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{recommendedCount} recommended profiles</span>
	                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{lowerPriorityCount} lower-priority profiles</span>
	                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{clearLocationFitDisplayCount} with clear location fit</span>
	                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{mustHaveStrongDisplayCount} with strong must-have coverage</span>
	                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{firstContactConfidenceCount} high contact-confidence profiles</span>
	                <span className="rounded-full border border-amber-200 bg-white px-3 py-1">{contactUnlockCandidates} contact lookups available</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <PaddleCheckoutButton
                  checkout={{ type: "plan", planCode: "starter_monthly" }}
                  label="Upgrade to Starter"
                  onClick={() => handleUpgradeClick("results_first_use_strip")}
                  onError={(message) => setUpgradeError(message)}
                  className="inline-flex items-center justify-center rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300"
                />
                <p className="text-xs text-slate-600">
	                  You can review the ranked pool, fit reasons, risks, and recommended outreach drafts now.
                </p>
              </div>
            </div>
          )}
          {publicEvidenceError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {publicEvidenceError}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
	              <p className="text-sm text-muted">
	                {showOnlyWithEmail
	                  ? `${visibleCandidates.length} candidates with email available`
	                  : `${visibleCandidates.length} in ${selectedPoolLabel.toLowerCase()}`}
	              </p>
              <div className="hidden flex-wrap items-center gap-1.5 text-xs text-muted-light sm:flex">
                {visibleCandidates.length > 0 && (
                  <>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1">Avg {averageQuality}%</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1">Range {Math.min(...visibleCandidates.map((c) => c.match_score))}–{Math.max(...visibleCandidates.map((c) => c.match_score))}%</span>
                  </>
                )}
                {contactUnlockCandidates > 0 && (
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1">{contactUnlockCandidates} contact lookups</span>
                )}
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1">{risksFoundCount} risks flagged</span>
	                <span className="rounded-md border border-slate-200 bg-white px-2 py-1">
	                  {recommendedCount} recommended
	                </span>
                {billing?.usage.exportEnabled ? (
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1">
                      {`${allCandidates.filter((candidate) => candidate.email).length}/${allCandidates.length} with email`}
                  </span>
                ) : (
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1">Real LinkedIn profiles</span>
                )}
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1">Recruiter sorted</span>
              </div>
            </div>
	            {isReviewable && (
	              <div className="flex flex-wrap items-center gap-2">
	                <div className="inline-flex rounded-full border border-border bg-background p-1">
	                  <button
	                    onClick={() => setPoolView("recommended")}
	                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
	                      poolView === "recommended"
	                        ? "bg-slate-950 text-white"
	                        : "text-muted hover:text-foreground"
	                    }`}
	                  >
	                    Recommended ({recommendedCount})
	                  </button>
	                  <button
	                    onClick={() => setPoolView("full_pool")}
	                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
	                      poolView === "full_pool"
	                        ? "bg-slate-950 text-white"
	                        : "text-muted hover:text-foreground"
	                    }`}
	                  >
	                    Full pool ({allCandidates.length})
	                  </button>
	                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span>Sort by</span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as CandidateSortMode)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  >
                    <option value="overall">Overall score</option>
                    <option value="capability">Capability</option>
                    <option value="relevance">Role Fit</option>
                    <option value="join_likelihood">Reachability</option>
                  </select>
                </label>
                {billing?.usage.exportEnabled && allCandidates.some((candidate) => candidate.email) && (
                  <>
                    <button
                      onClick={() => setShowOnlyWithEmail(!showOnlyWithEmail)}
                      className="text-xs cursor-pointer text-muted hover:text-foreground transition-colors"
                    >
                      {showOnlyWithEmail ? "Show all" : "Only with email"}
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
                    <span className="text-xs text-muted">{selectedIds.size} selected</span>
                    {(["starred", "contacted", "submitted", "rejected"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => bulkStatusChange(s)}
                        className="rounded-md cursor-pointer bg-surface px-2 py-0.5 text-xs font-medium text-muted capitalize hover:bg-surface-dark hover:text-foreground transition-colors"
                      >
                        {CANDIDATE_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
	          {visibleCandidates.length > 0 && (
	            <>
	              {poolView === "full_pool" && (
	                <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
	                  <div className="grid grid-cols-[minmax(220px,1.8fr)_minmax(140px,1fr)_72px_72px_72px_92px_minmax(120px,0.9fr)_minmax(180px,1.2fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
	                    <span>Profile</span>
	                    <span>Location</span>
	                    <span>Overall</span>
	                    <span>Tech</span>
	                    <span>Role fit</span>
	                    <span>Reachability</span>
	                    <span>Bucket</span>
	                    <span>Main risk</span>
	                  </div>
	                  <div className="max-h-[560px] overflow-y-auto">
	                    {visibleCandidates.map((candidate) => {
	                      const currentRole = deriveCurrentRole(candidate);
	                      const currentCompany = deriveCurrentCompany(candidate);
	                      const risk =
	                        candidate.metadata?.primary_risk ||
	                        candidate.metadata?.suitability?.primary_risk ||
	                        candidate.metadata?.why_not_higher?.[0] ||
	                        candidate.metadata?.risk_flags?.[0] ||
	                        "Verify fit before outreach";
	                      return (
	                        <button
	                          key={candidate.id}
	                          type="button"
	                          onClick={() => {
	                            setActiveCandidateId(candidate.id);
	                            handleCandidateExpand(candidate);
	                          }}
	                          className={`grid w-full grid-cols-[minmax(220px,1.8fr)_minmax(140px,1fr)_72px_72px_72px_92px_minmax(120px,0.9fr)_minmax(180px,1.2fr)] gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
	                            candidate.id === activeCandidate?.id ? "bg-sky-50" : "bg-white"
	                          }`}
	                        >
	                          <span className="min-w-0">
	                            <span className="block truncate font-semibold text-slate-950">{candidate.name}</span>
	                            <span className="block truncate text-xs text-slate-500">
	                              {[currentRole, currentCompany].filter(Boolean).join(" at ") || candidate.headline || "LinkedIn profile"}
	                            </span>
	                          </span>
	                          <span className="truncate text-slate-600">{candidate.location || "Unknown"}</span>
	                          <span className="font-semibold text-slate-950">{getCandidateOverallScore(candidate)}</span>
	                          <span className="text-slate-700">{getCandidateCapabilityScore(candidate) || "—"}</span>
	                          <span className="text-slate-700">{getCandidateRelevanceScore(candidate) || "—"}</span>
	                          <span className="text-slate-700">{getCandidateJoinLikelihoodScore(candidate) || "—"}</span>
	                          <span className="truncate text-slate-700">{formatDeliveryBucketLabel(candidate)}</span>
	                          <span className="line-clamp-2 text-xs leading-5 text-slate-500">{risk}</span>
	                        </button>
	                      );
	                    })}
	                  </div>
	                </div>
	              )}
	              {activeCandidate && (
	                <div className={`hidden gap-4 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] ${poolView === "full_pool" ? "mt-4" : ""}`}>
                  <aside className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Candidate queue
                      </p>
	                      <h3 className="mt-2 text-lg font-semibold text-slate-950">
	                        {selectedPoolLabel} ({visibleCandidates.length})
	                      </h3>
	                      <p className="mt-1 text-sm text-slate-600">
	                        {poolView === "full_pool"
	                          ? "Scan the full ranked pool with lower-priority context preserved."
	                          : "Work from the recommended profiles first. The right panel defaults to the copy-ready selling kit."}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {visibleCandidates.map((candidate) => (
                        <CandidateWorkbenchListItem
                          key={candidate.id}
                          candidate={candidate}
                          selected={candidate.id === activeCandidate.id}
                          onSelect={() => {
                            setActiveCandidateId(candidate.id);
                            handleCandidateExpand(candidate);
                          }}
                          billingPlanCode={billing?.subscription.planCode || "free"}
                          isNew={isImprovingInBackground && newCandidateIds.has(candidate.id)}
                        />
                      ))}
                    </div>
                  </aside>
                  <CandidateWorkbenchDetail
                    candidate={activeCandidate}
                    requiredSkills={requiredSkills}
                    billingPlanCode={billing?.subscription.planCode || "free"}
                    clientBriefEnabled={billing?.usage.clientBriefEnabled ?? false}
                    enrichesRemaining={billing?.usage.enrichesRemaining ?? 0}
                    publicEvidenceDeepDivesRemaining={billing?.usage.publicEvidenceDeepDivesRemaining ?? 0}
                    publicEvidenceQueueing={publicEvidenceQueueingId === activeCandidate.id}
                    onPublicEvidenceDeepDive={() => handlePublicEvidenceDeepDive(activeCandidate)}
                    refreshBilling={refreshBilling}
                    onUpgradeClick={handleUpgradeClick}
                    onStatusChange={handleStatusChange}
                  />
                </div>
              )}

              <div className="space-y-3 lg:hidden">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
	                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
	                    {selectedPoolLabel}
	                  </p>
	                  <p className="mt-1 text-sm text-slate-700">
	                    {poolView === "full_pool"
	                      ? "Use the full ranked pool to compare the market and recover edge cases."
	                      : "Start with the strongest sellable profiles, then open each card for proof and outreach copy."}
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
                      requiredSkills={requiredSkills}
                      selected={selectedIds.has(c.id)}
                      onToggleSelect={() => toggleSelect(c.id)}
                      billingPlanCode={billing?.subscription.planCode || "free"}
                      enrichesRemaining={billing?.usage.enrichesRemaining ?? 0}
                      publicEvidenceDeepDivesRemaining={billing?.usage.publicEvidenceDeepDivesRemaining ?? 0}
                      publicEvidenceQueueing={publicEvidenceQueueingId === c.id}
                      onPublicEvidenceDeepDive={() => handlePublicEvidenceDeepDive(c)}
                      refreshBilling={refreshBilling}
                      onUpgradeClick={handleUpgradeClick}
                      isNew={isImprovingInBackground && newCandidateIds.has(c.id)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          {(excludedReasonCounts.length > 0 || widenPoolSuggestions.length > 0) && (
            <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                Pool diagnostics and widening levers
              </summary>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
	                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
	                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
	                    Why profiles landed lower
	                  </p>
	                  <p className="mt-2 text-sm text-slate-600">
	                    {ruledOutCount > 0
	                      ? `${ruledOutCount} deeply reviewed profiles were marked not recommended. They remain in the full pool for market coverage and manual review.`
	                      : "No lower-priority breakdown is available for this search yet."}
                  </p>
                  <div className="mt-4 space-y-3">
                    {(excludedReasonCounts as Array<{ reason: ExcludedReason; count: number }>).map((item) => (
                      <div key={item.reason}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-900">{formatExcludedReasonLabel(item.reason)}</span>
                          <span className="text-slate-500">{item.count}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-slate-800"
                            style={{
                              width: `${ruledOutCount > 0 ? Math.max(8, Math.round((item.count / ruledOutCount) * 100)) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    How to widen this pool
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    If you need more reviewable candidates, these are the first levers worth trying.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {widenPoolSuggestions.map((suggestion) => (
                      <li key={suggestion} className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          )}
        </div>
      )}

      {isReviewable && allCandidates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
	          <p className="text-muted">No candidates entered the ranked pool yet.</p>
	          <p className="mt-2 max-w-md text-center text-sm text-muted">
	            {excludedReasonCounts[0]
	              ? `Hirelix deeply reviewed ${formatDisplayCount(deepReviewCompletedCount)} profiles, but ${formatExcludedReasonLabel((excludedReasonCounts[0] as { reason: ExcludedReason; count: number }).reason).toLowerCase()} was the biggest blocker.`
	              : "Hirelix did not find enough sourced profiles to build a ranked pool yet."}
          </p>
          {widenPoolSuggestions.length > 0 && (
            <div className="mt-4 max-w-2xl space-y-2 px-4">
              {widenPoolSuggestions.map((suggestion) => (
                <p key={suggestion} className="text-center text-sm text-muted">
                  {suggestion}
                </p>
              ))}
            </div>
          )}
          <Link
            href={`/app/search/new?jd=${encodedJd}${analyticsContext.entry_mode === "workspace" ? "" : `&entry=${analyticsContext.entry_mode}`}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refine &amp; Retry
          </Link>
        </div>
      )}

      {isReviewable && (
        <p className="mt-8 text-center text-xs text-slate-500">
	          Built for technical recruiters and headhunters. If your candidate pool misses the mark or your billing looks wrong, email{" "}
          <a className="text-primary hover:underline" href="mailto:support@hirelix.online">
            support@hirelix.online
          </a>
          .
        </p>
      )}
    </div>
  );
}
