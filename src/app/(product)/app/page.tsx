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
  getSearchTaskEtaCopy,
  getSearchTaskStage,
  getSearchTaskStageLabel,
  isSearchTaskProcessingStatus,
} from "@/lib/search-task";
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
} from "lucide-react";

type SearchRow = {
  id: string;
  title: string | null;
  parsed_requirements?: Record<string, unknown> | null;
  status: string;
  pipeline_step?: string | null;
  parse_completed_at?: string | null;
  partial_ready_at?: string | null;
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
  const { user } = useAuth();
  const { billing } = useBilling();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [candidateCounts, setCandidateCounts] = useState<Record<string, CandidateCount>>({});
  const [loading, setLoading] = useState(true);
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<"active" | "ready" | "running" | "issues" | "archived">("active");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const hasTrackedDashboardViewRef = useRef(false);
  const hasTrackedActiveSearchesViewRef = useRef(false);

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
      .select("id, title, parsed_requirements, status, pipeline_step, parse_completed_at, partial_ready_at, created_at, updated_at, error_message, warning_message, jd_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const nextSearches = searchData || [];
    setSearches(nextSearches);
    setLoading(false);
    setRelativeTimeNow(Date.now());
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
          .select("id, title, parsed_requirements, status, pipeline_step, parse_completed_at, partial_ready_at, created_at, updated_at, error_message, warning_message, jd_text")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const nextRefreshedSearches = refreshedSearches || [];
        setSearches(nextRefreshedSearches);
        setRelativeTimeNow(Date.now());
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
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData]);

  const analyticsContext = useMemo(
    () => getAnalyticsContextFromParams(searchParams),
    [searchParams],
  );

  const activeProcessingSearch = useMemo(
    () =>
      [...searches]
        .filter((search) => isSearchTaskProcessingStatus(search.status))
        .sort((left, right) => {
          const order = { screening: 0, searching: 1, parsing: 2, queued: 3 } as const;
          const leftRank = order[left.status as keyof typeof order] ?? 99;
          const rightRank = order[right.status as keyof typeof order] ?? 99;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return Date.parse(right.updated_at) - Date.parse(left.updated_at);
        })[0] ?? null,
    [searches],
  );
  const activeSearches = useMemo(
    () =>
      [...searches]
        .filter((search) => isSearchTaskProcessingStatus(search.status))
        .sort((left, right) => {
          const order = { screening: 0, searching: 1, parsing: 2, queued: 3 } as const;
          const leftRank = order[left.status as keyof typeof order] ?? 99;
          const rightRank = order[right.status as keyof typeof order] ?? 99;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return Date.parse(right.updated_at) - Date.parse(left.updated_at);
        })
        .slice(0, 3),
    [searches],
  );
  const getDashboardBucket = (status: string): "ready" | "running" | "issues" | "archived" => {
    if (getSearchStatusBucket(status) === "processing") return "running";
    if (getSearchStatusBucket(status) === "error") return "issues";
    if (isReviewableSearchStatus(status)) return "ready";
    return "archived";
  };

  const filteredSearches = searches.filter((search) => {
    const bucket = getDashboardBucket(search.status);
    if (filter === "active" && bucket === "issues") return false;
    if (filter !== "active" && bucket !== filter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const title = (search.title ?? "").toLowerCase();
      const jd = (search.jd_text ?? "").toLowerCase();
      if (!title.includes(q) && !jd.includes(q)) return false;
    }
    return true;
  });
  const listSearches = filteredSearches;
  const dashboardCounts = {
    active: searches.filter((search) => getDashboardBucket(search.status) !== "issues").length,
    ready: searches.filter((search) => getDashboardBucket(search.status) === "ready").length,
    running: searches.filter((search) => getDashboardBucket(search.status) === "running").length,
    issues: searches.filter((search) => getDashboardBucket(search.status) === "issues").length,
    archived: searches.filter((search) => getDashboardBucket(search.status) === "archived").length,
  };

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
    if (activeSearches.length === 0 || hasTrackedActiveSearchesViewRef.current) return;
    hasTrackedActiveSearchesViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.activeSearchesView, {
      ...analyticsContext,
      active_search_count: activeSearches.length,
      active_search_ids: activeSearches.map((search) => search.id).join(","),
    });
  }, [activeSearches, analyticsContext]);

  useEffect(() => {
    if (activeSearches.length === 0) return;
    let intervalId: number | null = null;
    const tick = () => {
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    };
    intervalId = window.setInterval(tick, 5000);
    return () => {
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [activeSearches.length, fetchData]);

  useEffect(() => {
    if (loading || searches.length > 0 || analyticsContext.entry_mode !== "signin") return;

    startTransition(() => {
      router.replace("/app/search/new?entry=signin");
    });
  }, [analyticsContext.entry_mode, loading, router, searches.length]);


  async function deleteSearch(e: React.MouseEvent, searchId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this sourcing task and all its candidates?")) return;
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
    const diffMinutes = Math.max(1, Math.round((relativeTimeNow - date) / 60000));
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const buildSearchPreview = (title: string, jdText: string) => {
    // First, replace any literal escape sequences (\n, \r, \t) that may have
    // leaked into the stored JD text — these render as visible characters and
    // produce ugly previews like "\\n\\nWe are hiring...".
    const withoutEscapeLiterals = jdText.replace(/\\[nrt]/g, " ");
    const normalizedJd = withoutEscapeLiterals.replace(/\s+/g, " ").trim();
    if (!normalizedJd) return "No job description preview available.";

    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const deduped = normalizedJd.replace(new RegExp(`^${escapedTitle}[\\s:,.\\-–—|]*`, "i"), "").trim();
    return (deduped || normalizedJd).slice(0, 80);
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
    if (status === "error") return `Failed · updated ${formatRelativeTime(updatedAt)}`;
    return `Started ${formatRelativeTime(createdAt)}`;
  };

  const handlePrimaryCtaClick = (surface: string, searchId?: string | null) => {
    trackEvent(ANALYTICS_EVENTS.primaryProductCtaClick, {
      ...analyticsContext,
      search_count: searches.length,
      has_existing_processing_search: Boolean(activeProcessingSearch),
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      search_id: searchId ?? null,
      search_status: searchId ? searches.find((search) => search.id === searchId)?.status ?? "unknown" : "workspace",
      cta_surface: surface,
      primary_context: "none",
    });
  };

  const navigateTo = (href: string, surface: string, searchId?: string | null) => {
    setPendingHref(href);
    handlePrimaryCtaClick(surface, searchId);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="mx-auto max-w-5xl">
      {activeSearches.length > 0 && (
        <div className="mb-8 rounded-3xl border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#f5faff_100%)] p-5 shadow-[0_16px_40px_rgba(14,165,233,0.08)]">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                Active searches
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                These tasks are still running in the background.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Open any task to see the brief, the current stage, and when to come back. You do not need to keep the page open.
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Auto-refreshes every 5 seconds while this page is visible.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {activeSearches.map((search) => {
              const stage = getSearchTaskStage(search);
              const displayTitle = getSearchDisplayTitle({
                title: search.title,
                parsedRequirements: search.parsed_requirements,
                fallback: "Untitled sourcing task",
              });
              return (
                <Link
                  key={search.id}
                  href={`/app/search/${search.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-sky-300 hover:bg-sky-50/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{displayTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Started {formatRelativeTime(search.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                      {getSearchTaskStageLabel(stage)}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>{getSearchTaskEtaCopy(search.status, stage)}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                        {search.parse_completed_at ? "Brief ready" : "Brief pending"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                        Open task
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <DashboardPageSkeleton />
    ) : searches.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">What your first sourcing task includes</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Start with one full JD. Hirelix parses the brief, finds the best-fit technical candidates, and opens a recruiter workbench you can review before unlocking contact actions.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">JD parsing + editable brief</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">LinkedIn ranking</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">2 free sourcing runs each month</span>
              </div>
              <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs text-slate-600">
                Next step: paste the real role, confirm the brief, then open the workbench and review candidates.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Sourcing cockpit
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Active Shortlists</h2>
              <p className="mt-1 text-sm text-muted">
                Pick the roles that need review, outreach, or cleanup today.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo("/app/search/new", "dashboard_new_search")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              {isNavigating && pendingHref === "/app/search/new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New Search
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Ready to contact", value: dashboardCounts.ready },
              { label: "Needs review", value: Math.max(dashboardCounts.active - dashboardCounts.ready - dashboardCounts.running, 0) },
              { label: "Running", value: dashboardCounts.running },
              { label: "Issues", value: dashboardCounts.issues },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.label === "Ready to contact") setFilter("ready");
                  else if (item.label === "Running") setFilter("running");
                  else if (item.label === "Issues") setFilter("issues");
                  else setFilter("active");
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
              </button>
            ))}
          </div>

          {/* Search + status filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-light pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by role or JD..."
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-light focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-surface p-1">
            {(["active", "ready", "running", "issues", "archived"] as const).map((f) => {
              const count = dashboardCounts[f];
              const labels = {
                active: "Active",
                ready: "Ready",
                running: "Running",
                issues: "Issues",
                archived: "Archived",
              };
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
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_130px_110px_120px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 max-lg:hidden">
              <span>Role</span>
              <span>Next action</span>
              <span>Evidence</span>
              <span className="text-right">Updated</span>
            </div>
          {listSearches.map((s) => {
            const stats = candidateCounts[s.id];
            const displayTitle = getSearchDisplayTitle({
              title: s.title,
              fallback: "Untitled sourcing task",
            });
            const previewText = buildSearchPreview(displayTitle, s.jd_text);
            const bucket = getDashboardBucket(s.status);
            const nextAction =
              bucket === "ready"
                ? "Open workbench"
                : bucket === "running"
                  ? getSearchTaskStageLabel(getSearchTaskStage(s))
                  : bucket === "issues"
                    ? "Needs cleanup"
                    : "Review later";
            const evidenceLabel = stats
              ? `${stats.total} candidates`
              : bucket === "running"
                ? "Pending"
                : bucket === "ready"
                  ? "Ready pool"
                  : "No pool yet";
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
                className="group grid gap-4 border-b border-slate-100 p-4 transition-colors last:border-b-0 hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_130px_110px_120px] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Search className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {displayTitle}
                    </p>
                    {statusIcon(s.status)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3">
                    <p className="truncate text-xs text-muted">
                      {previewText}...
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
                    </div>
                  </div>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  bucket === "ready"
                    ? "bg-emerald-50 text-emerald-700"
                    : bucket === "running"
                      ? "bg-sky-50 text-sky-700"
                      : bucket === "issues"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                }`}>
                  {nextAction}
                </span>
                <span className="text-xs text-slate-500">{evidenceLabel}</span>
                <div className="flex items-center justify-between gap-2 lg:justify-end">
                  <span className="text-xs text-slate-500">{formatRelativeTime(s.updated_at)}</span>
                  <button
                    onClick={(e) => deleteSearch(e, s.id)}
                    disabled={deleting === s.id}
                    className="rounded-md p-1.5 cursor-pointer text-muted-light opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Delete sourcing task"
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
          </div>
          {listSearches.length === 0 && (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-10">
              <p className="text-sm text-muted">
                No shortlists match this view.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
