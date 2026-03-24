"use client";

import { useEffect, useState, useCallback, useMemo, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { DashboardPageSkeleton } from "@/components/ProductSkeletons";
import { supabase } from "@/lib/supabase";
import { useBilling } from "@/lib/use-billing";
import { getSearchDisplayTitle } from "@/lib/search-title";
import {
  getSearchStatusBucket,
  getStalledSearchMessage,
  isReviewableSearchStatus,
  isStaleProcessingSearch,
} from "@/lib/search-state";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromParams,
  trackEvent,
} from "@/lib/analytics";
import {
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Users,
  Sparkles,
  ArrowRight,
} from "lucide-react";

type SearchRow = {
  id: string;
  title: string | null;
  status: string;
  pipeline_step?: string | null;
  created_at: string;
  updated_at: string;
  error_message?: string | null;
  warning_message?: string | null;
  jd_text: string;
};

type CandidateCount = {
  search_id: string;
  total: number;
  starred: number;
  contacted: number;
};

export default function DashboardPage() {
  const { user, session } = useAuth();
  const { billing } = useBilling();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [candidateCounts, setCandidateCounts] = useState<Record<string, CandidateCount>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "done" | "processing" | "error">("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const hasTrackedDashboardViewRef = useRef(false);
  const hasTrackedWorkspaceContextRef = useRef(false);

  const fetchCandidateCounts = useCallback(async (rows: SearchRow[]) => {
    const doneIds = rows
      .filter((search) => isReviewableSearchStatus(search.status))
      .map((search) => search.id);

    if (doneIds.length === 0) {
      setCandidateCounts({});
      return;
    }

    const { data: candidates } = await supabase
      .from("hirelix_candidates")
      .select("search_id, status")
      .in("search_id", doneIds);

    const counts: Record<string, CandidateCount> = {};
    for (const candidate of candidates || []) {
      if (!counts[candidate.search_id]) {
        counts[candidate.search_id] = {
          search_id: candidate.search_id,
          total: 0,
          starred: 0,
          contacted: 0,
        };
      }
      counts[candidate.search_id].total++;
      if (candidate.status === "starred") counts[candidate.search_id].starred++;
      if (candidate.status === "contacted") counts[candidate.search_id].contacted++;
    }
    setCandidateCounts(counts);
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: searchData } = await supabase
      .from("hirelix_searches")
      .select("id, title, status, pipeline_step, created_at, updated_at, error_message, warning_message, jd_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const nextSearches = searchData || [];
    setSearches(nextSearches);
    setLoading(false);
    void fetchCandidateCounts(nextSearches);

    const staleSearchIds = (searchData || [])
      .filter((search) =>
        isStaleProcessingSearch(search.status, search.updated_at),
      )
      .map((search) => search.id);

    if (staleSearchIds.length > 0) {
      void (async () => {
        await supabase
          .from("hirelix_searches")
          .update({
            status: "error",
            pipeline_step: "error",
            error_message: getStalledSearchMessage(),
            updated_at: new Date().toISOString(),
          })
          .in("id", staleSearchIds)
          .eq("user_id", user.id);

        const { data: refreshedSearches } = await supabase
          .from("hirelix_searches")
          .select("id, title, status, pipeline_step, created_at, updated_at, error_message, warning_message, jd_text")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const nextRefreshedSearches = refreshedSearches || [];
        setSearches(nextRefreshedSearches);
        void fetchCandidateCounts(nextRefreshedSearches);
      })();
    }
  }, [fetchCandidateCounts, user]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void fetchData();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fetchData]);

  useEffect(() => {
    setPendingHref(null);
  }, [searches]);

  const analyticsContext = useMemo(
    () => getAnalyticsContextFromParams(searchParams),
    [searchParams],
  );

  const partialReadySearch = useMemo(
    () =>
      searches.find(
        (search) => search.status === "deep_scoring",
      ) ?? null,
    [searches],
  );
  const activeProcessingSearch = useMemo(
    () =>
      searches.find((search) =>
        ["queued", "parsing", "searching", "screening"].includes(search.status),
      ) ?? null,
    [searches],
  );
  const latestFailedSearch = useMemo(
    () => searches.find((search) => search.status === "error") ?? null,
    [searches],
  );
  const latestCompletedSearch = useMemo(
    () => searches.find((search) => isReviewableSearchStatus(search.status)) ?? null,
    [searches],
  );
  const filteredSearches = searches.filter(
    (search) => filter === "all" || getSearchStatusBucket(search.status) === filter,
  );
  const primaryContext = useMemo(() => {
    if (partialReadySearch) {
      return {
        kind: "done" as const,
        search: partialReadySearch,
        eyebrow: "Best next move",
        title: "Review the shortlist that's already usable.",
        body:
          partialReadySearch.status === "deep_scoring"
            ? "Your first ranked candidates are ready now, and Hirelix is still refining the final order in the background."
            : "You already have a shortlist to review. Start there before you create another one.",
        ctaLabel: "Review shortlist",
      };
    }
    if (activeProcessingSearch) {
      return {
        kind: "processing" as const,
        search: activeProcessingSearch,
        eyebrow: "Next best move",
        title: "Check the shortlist that's still running.",
        body: "Your shortlist is still running. Open it to see live progress before you decide whether you need anything new.",
        ctaLabel: "Check progress",
      };
    }
    if (latestFailedSearch) {
      return {
        kind: "error" as const,
        search: latestFailedSearch,
        eyebrow: "Next best move",
        title: "Retry the shortlist run that didn't finish.",
        body: "This run did not complete, but you do not need to start over elsewhere. Retry it here or refine the JD after you review what happened.",
        ctaLabel: "Retry shortlist run",
      };
    }
    if (latestCompletedSearch) {
      return {
        kind: "done" as const,
        search: latestCompletedSearch,
        eyebrow: "Next best move",
        title: "Review the shortlist that's already ready.",
        body: "You already have ranked candidates to review. Start there before you create another shortlist.",
        ctaLabel: "Review shortlist",
      };
    }
    return {
      kind: "empty" as const,
      search: null,
      eyebrow: "START WITH ONE JD",
      title: "Paste one JD and build your first shortlist",
      body: "Start with the real role. Hirelix searches LinkedIn and live professional profile data, compares fit signals, and turns the strongest matches into a ranked shortlist you can review before upgrading.",
      ctaLabel: "Build your first shortlist",
    };
  }, [activeProcessingSearch, latestCompletedSearch, latestFailedSearch, partialReadySearch]);

  useEffect(() => {
    if (loading || hasTrackedDashboardViewRef.current) return;

    hasTrackedDashboardViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.dashboardView, {
      ...analyticsContext,
      search_count: searches.length,
      has_existing_processing_search: Boolean(activeProcessingSearch),
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
    });
  }, [activeProcessingSearch, analyticsContext, billing, loading, searches.length]);

  useEffect(() => {
    if (loading || hasTrackedWorkspaceContextRef.current) return;

    hasTrackedWorkspaceContextRef.current = true;
    trackEvent(ANALYTICS_EVENTS.dashboardPrimaryContextShown, {
      ...analyticsContext,
      has_existing_processing_search: Boolean(activeProcessingSearch),
      search_count: searches.length,
      context_type: primaryContext.kind,
      search_status: primaryContext.search?.status ?? "empty",
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
    });
  }, [
    activeProcessingSearch,
    analyticsContext,
    billing,
    loading,
    primaryContext.kind,
    primaryContext.search?.status,
    searches.length,
  ]);

  useEffect(() => {
    if (loading || searches.length > 0 || analyticsContext.entry_mode !== "signin") return;

    startTransition(() => {
      router.replace("/app/search/new?entry=signin");
    });
  }, [analyticsContext.entry_mode, loading, router, searches.length]);


  async function deleteSearch(e: React.MouseEvent, searchId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this shortlist and all its candidates?")) return;
    setDeleting(searchId);
    await supabase.from("hirelix_candidates").delete().eq("search_id", searchId);
    await supabase.from("hirelix_searches").delete().eq("id", searchId);
    setSearches((prev) => prev.filter((s) => s.id !== searchId));
    setDeleting(null);
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "done":
      case "deep_scoring":
      case "degraded":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "queued":
      case "parsing":
      case "searching":
      case "screening":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-light" />;
    }
  };

  const formatRelativeTime = (value: string) => {
    const date = new Date(value).getTime();
    const diffMinutes = Math.max(1, Math.round((Date.now() - date) / 60000));
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getSearchContextLabel = (status: string, createdAt: string, updatedAt: string) => {
    if (["queued", "parsing", "searching", "screening"].includes(status)) {
      return `Still running · started ${formatRelativeTime(createdAt)}`;
    }
    if (status === "deep_scoring") {
      return `Review now, refining in background · updated ${formatRelativeTime(updatedAt)}`;
    }
    if (status === "degraded") {
      return `Reviewable with a warning · updated ${formatRelativeTime(updatedAt)}`;
    }
    if (status === "done") return `Ready to review · created ${formatRelativeTime(createdAt)}`;
    if (status === "error") return `Needs retry · updated ${formatRelativeTime(updatedAt)}`;
    return `Started ${formatRelativeTime(createdAt)}`;
  };

  const handlePrimaryCtaClick = (surface: string, searchId?: string | null) => {
    trackEvent(ANALYTICS_EVENTS.primaryProductCtaClick, {
      ...analyticsContext,
      search_count: searches.length,
      has_existing_processing_search: Boolean(activeProcessingSearch),
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      search_id: searchId ?? null,
      search_status: primaryContext.search?.status ?? primaryContext.kind,
      cta_surface: surface,
      primary_context: primaryContext.kind,
    });
  };

  const navigateTo = (href: string, surface: string, searchId?: string | null) => {
    setPendingHref(href);
    handlePrimaryCtaClick(surface, searchId);
    startTransition(() => {
      router.push(href);
    });
  };

  async function handleRetrySearch(searchId: string) {
    if (!session?.access_token) return;

    setRetrying(searchId);
    trackEvent(ANALYTICS_EVENTS.retrySearchClick, {
      ...analyticsContext,
      search_id: searchId,
      search_status: "error",
      search_count: searches.length,
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
    });

    try {
      const res = await fetch(`/api/search/${searchId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        await fetchData();
      }
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className={`mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between ${primaryContext.kind === "empty" ? "rounded-[30px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.20),_transparent_28%),linear-gradient(180deg,#fbfdff_0%,#f4f9ff_100%)] p-6 shadow-[0_18px_48px_rgba(14,165,233,0.08)]" : ""}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            {primaryContext.eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-slate-950">
            {primaryContext.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            {primaryContext.body}
          </p>
          {primaryContext.search && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              <span className="font-medium text-slate-900">
                {getSearchDisplayTitle({
                  title: primaryContext.search.title,
                  jdText: primaryContext.search.jd_text,
                  fallback: "Untitled shortlist",
                })}
              </span>
              <span className="text-slate-300">·</span>
              <span>{getSearchContextLabel(primaryContext.search.status, primaryContext.search.created_at, primaryContext.search.updated_at)}</span>
            </div>
          )}
        </div>
        <div className="shrink-0">
          {primaryContext.kind === "processing" && primaryContext.search ? (
            <button
              type="button"
              onClick={() => navigateTo(`/app/search/${primaryContext.search!.id}`, "dashboard_processing", primaryContext.search?.id)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              {isNavigating && pendingHref === `/app/search/${primaryContext.search.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {primaryContext.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : primaryContext.kind === "error" && primaryContext.search ? (
            <button
              type="button"
              onClick={() => void handleRetrySearch(primaryContext.search!.id)}
              disabled={retrying === primaryContext.search.id}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {retrying === primaryContext.search.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {primaryContext.ctaLabel}
            </button>
          ) : primaryContext.kind === "done" && primaryContext.search ? (
            <button
              type="button"
              onClick={() => navigateTo(`/app/search/${primaryContext.search!.id}`, "dashboard_done", primaryContext.search?.id)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              {isNavigating && pendingHref === `/app/search/${primaryContext.search.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {primaryContext.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigateTo("/app/search/new", "dashboard_empty", null)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              {isNavigating && pendingHref === "/app/search/new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {primaryContext.ctaLabel}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <DashboardPageSkeleton />
    ) : searches.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">What you&apos;ll get in your first shortlist</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Start with one full JD. Hirelix searches broadly, narrows the strongest matches, and gives you a shortlist you can review before paying for contact unlocks.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">Search across LinkedIn</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">AI-ranked matches</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">3 free shortlist runs</span>
              </div>
              <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs text-slate-600">
                Next step: paste the real role, build the shortlist, then review candidates before deciding whether to unlock outreach.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Your shortlists</h2>
              <p className="mt-1 text-sm text-muted">
                Review what is ready now, retry what stalled, or create another shortlist when you are ready.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo("/app/search/new", "dashboard_new_search")}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              {isNavigating && pendingHref === "/app/search/new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create another shortlist
            </button>
          </div>
          {/* Status filter tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg bg-surface p-1">
            {(["all", "done", "processing", "error"] as const).map((f) => {
              const count = f === "all" ? searches.length : searches.filter((s) => getSearchStatusBucket(s.status) === f).length;
              const labels = { all: "All", done: "Ready", processing: "In Progress", error: "Failed" };
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex items-center gap-1.5 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {labels[f]}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    filter === f ? "bg-primary/10 text-primary" : "bg-gray-100 text-muted-light"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {filteredSearches.map((s) => {
            const stats = candidateCounts[s.id];
            const isPrimarySearch = primaryContext.search?.id === s.id;
            return (
              <Link
                key={s.id}
                href={`/app/search/${s.id}`}
                onClick={() => {
                  if (getSearchStatusBucket(s.status) === "processing") {
                    handlePrimaryCtaClick("dashboard_list_processing", s.id);
                  } else if (getSearchStatusBucket(s.status) === "done") {
                    handlePrimaryCtaClick("dashboard_list_done", s.id);
                  } else if (s.status === "error") {
                    handlePrimaryCtaClick("dashboard_list_error", s.id);
                  }
                }}
                className={`group flex items-center gap-4 rounded-xl border p-4 sm:p-5 transition-colors hover:border-muted-light hover:bg-surface ${
                  isPrimarySearch ? "border-primary/30 bg-primary/[0.03]" : "border-border"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  isPrimarySearch ? "bg-primary/15" : "bg-primary/10"
                }`}>
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {getSearchDisplayTitle({
                        title: s.title,
                        jdText: s.jd_text,
                        fallback: "Untitled shortlist",
                      })}
                    </p>
                    {statusIcon(s.status)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3">
                    <p className="truncate text-xs text-muted">
                      {s.jd_text.slice(0, 80)}...
                    </p>
                    {stats && (
                      <div className="hidden shrink-0 items-center gap-2 text-[10px] text-muted-light sm:flex">
                        <span className="flex items-center gap-0.5">
                          <Users className="h-3 w-3" />
                          {stats.total}
                        </span>
                        {stats.starred > 0 && (
                          <span className="text-amber-500">★ {stats.starred}</span>
                        )}
                        {stats.contacted > 0 && (
                          <span className="text-blue-500">✉ {stats.contacted}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-light">
                    <span>{getSearchContextLabel(s.status, s.created_at, s.updated_at)}</span>
                    <span>·</span>
                    <span>{new Date(s.created_at).toLocaleDateString()}</span>
                    {isPrimarySearch && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-primary">Best next step</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {["queued", "parsing", "searching", "screening"].includes(s.status) && (
                    <span className="hidden rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 sm:block">
                      Still running
                    </span>
                  )}
                  {s.status === "deep_scoring" && (
                    <span className="hidden rounded-full bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700 sm:block">
                      Refining live
                    </span>
                  )}
                  {s.status === "done" && (
                    <span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 sm:block">
                      Ready to review
                    </span>
                  )}
                  {s.status === "degraded" && (
                    <span className="hidden rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 sm:block">
                      Review with warning
                    </span>
                  )}
                  {s.status === "error" && (
                    <span className="hidden rounded-full bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 sm:block">
                      Needs retry
                    </span>
                  )}
                  <button
                    onClick={(e) => deleteSearch(e, s.id)}
                    disabled={deleting === s.id}
                    className="rounded-md p-1.5 cursor-pointer text-muted-light opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Delete shortlist"
                  >
                    {deleting === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </Link>
            );
          })}
          {filteredSearches.length === 0 && (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-10">
              <p className="text-sm text-muted">No shortlists with this status.</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
