"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Zap,
  TrendingUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";

// ─── 类型定义 ───────────────────────────────────────────────────────────────

type Overview = {
  totalUsers: number;
  proUsers: number;
  activeUsersThisMonth: number;
  searchesThisMonth: number;
  enrichesThisMonth: number;
};

type RecentSearch = {
  id: string;
  user_id: string;
  title: string | null;
  status: string;
  pipeline_step: string | null;
  error_message: string | null;
  created_at: string;
};

type StatsData = {
  overview: Overview;
  planDistribution: Record<string, number>;
  recentSearches: RecentSearch[];
  recentErrors: RecentSearch[];
  schedulerHealth: Record<string, number>;
};

type UserRow = {
  userId: string;
  email: string;
  plan: string;
  status: string;
  renewsAt: string | null;
  extraSearchCredits: number;
  extraEnrichCredits: number;
  joinedAt: string;
  usage: { searches: number; enriches: number };
};

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

function planBadge(plan: string, status: string) {
  const isPro =
    (plan === "pro_monthly" || plan === "pro_annual") && status === "active";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isPro
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {isPro ? (plan === "pro_annual" ? "Pro Annual" : "Pro Monthly") : "Free"}
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    done: "bg-emerald-100 text-emerald-800",
    completed: "bg-emerald-100 text-emerald-800",
    error: "bg-red-100 text-red-800",
    failed: "bg-red-100 text-red-800",
    processing: "bg-sky-100 text-sky-800",
    running: "bg-sky-100 text-sky-800",
    pending: "bg-slate-100 text-slate-600",
    queued: "bg-slate-100 text-slate-600",
    degraded: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        map[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "users" | "searches">("overview");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingCredits, setEditingCredits] = useState<{
    userId: string;
    searches: number;
    enriches: number;
  } | null>(null);
  const [savingCredits, setSavingCredits] = useState(false);

  const getToken = useCallback(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const fetchStats = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setError("forbidden");
        return;
      }
      const data = await res.json();
      setStats(data);
    } catch {
      setError("fetch_failed");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const fetchUsers = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setUsersLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchStats();
    }
  }, [authLoading, user, fetchStats]);

  useEffect(() => {
    if (tab === "users" && users === null) {
      fetchUsers();
    }
  }, [tab, users, fetchUsers]);

  const saveCredits = async () => {
    if (!editingCredits) return;
    setSavingCredits(true);
    const token = await getToken();
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: editingCredits.userId,
          extraSearchCredits: editingCredits.searches,
          extraEnrichCredits: editingCredits.enriches,
        }),
      });
      setEditingCredits(null);
      await fetchUsers();
    } finally {
      setSavingCredits(false);
    }
  };

  // 权限检查
  if (!authLoading && !user) {
    router.replace("/app");
    return null;
  }

  if (!authLoading && user && error === "forbidden") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-lg font-semibold">Access Denied</p>
        <p className="text-sm text-muted">This page is restricted to admins.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="mt-0.5 text-sm text-muted">Platform overview</p>
        </div>
        <button
          onClick={() => {
            fetchStats();
            if (tab === "users") fetchUsers();
          }}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 border-b border-border">
        {(["overview", "users", "searches"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`cursor-pointer px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && tab === "overview" ? (
        <div className="flex items-center gap-2 text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error === "fetch_failed" ? (
        <p className="text-sm text-red-500">Failed to load data. Check console.</p>
      ) : (
        <>
          {/* ── Overview Tab ─────────────────────────────────────────────── */}
          {tab === "overview" && stats && (
            <div className="space-y-6">
              {/* 指标卡片 */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  { label: "Total Users", value: stats.overview.totalUsers, icon: Users },
                  { label: "Pro Users", value: stats.overview.proUsers, icon: TrendingUp },
                  {
                    label: "Active This Month",
                    value: stats.overview.activeUsersThisMonth,
                    icon: Zap,
                  },
                  {
                    label: "Searches (MTD)",
                    value: stats.overview.searchesThisMonth,
                    icon: Search,
                  },
                  {
                    label: "Enriches (MTD)",
                    value: stats.overview.enrichesThisMonth,
                    icon: CheckCircle2,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="flex items-center gap-2 text-muted">
                      <Icon className="h-4 w-4" />
                      <span className="text-xs">{label}</span>
                    </div>
                    <p className="mt-2 text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>

              {/* 计划分布 + 调度器健康 */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold">Plan Distribution</h3>
                  <div className="space-y-1.5">
                    {Object.entries(stats.planDistribution)
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, count]) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <span className="font-mono text-xs text-muted">{key}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold">Scheduler Health</h3>
                  <div className="space-y-1.5">
                    {Object.entries(stats.schedulerHealth)
                      .sort((a, b) => b[1] - a[1])
                      .map(([status, count]) => (
                        <div
                          key={status}
                          className="flex items-center justify-between text-sm"
                        >
                          {statusBadge(status)}
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))}
                    {Object.keys(stats.schedulerHealth).length === 0 && (
                      <p className="text-xs text-muted">No jobs found</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 最近失败 */}
              {stats.recentErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    Recent Errors ({stats.recentErrors.length})
                  </h3>
                  <div className="space-y-2">
                    {stats.recentErrors.map((s) => (
                      <div key={s.id} className="rounded-lg bg-white p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">
                            {s.title ?? "(untitled)"}
                          </span>
                          <span className="text-muted ml-2 flex-shrink-0">
                            {timeAgo(s.created_at)}
                          </span>
                        </div>
                        {s.error_message && (
                          <p className="mt-1 text-red-600 line-clamp-2">
                            {s.error_message}
                          </p>
                        )}
                        <p className="mt-1 font-mono text-muted">{s.user_id.slice(0, 8)}…</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Users Tab ────────────────────────────────────────────────── */}
          {tab === "users" && (
            <div className="space-y-4">
              {usersLoading ? (
                <div className="flex items-center gap-2 text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading users…
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-surface">
                      <tr>
                        {["Email", "Plan", "Searches MTD", "Enriches MTD", "Extra Credits", "Joined", ""].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-left text-xs font-medium text-muted"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(users ?? []).map((u) => (
                        <>
                          <tr key={u.userId} className="bg-surface hover:bg-background">
                            <td className="px-4 py-3 font-medium">{u.email}</td>
                            <td className="px-4 py-3">{planBadge(u.plan, u.status)}</td>
                            <td className="px-4 py-3 tabular-nums">{u.usage.searches}</td>
                            <td className="px-4 py-3 tabular-nums">{u.usage.enriches}</td>
                            <td className="px-4 py-3 text-xs text-muted">
                              +{u.extraSearchCredits}s / +{u.extraEnrichCredits}e
                            </td>
                            <td className="px-4 py-3 text-xs text-muted">
                              {new Date(u.joinedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() =>
                                  setExpandedUser(
                                    expandedUser === u.userId ? null : u.userId,
                                  )
                                }
                                className="cursor-pointer text-muted hover:text-foreground"
                              >
                                {expandedUser === u.userId ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                          </tr>
                          {expandedUser === u.userId && (
                            <tr key={`${u.userId}-expanded`} className="bg-background">
                              <td colSpan={7} className="px-4 py-4">
                                <div className="space-y-3">
                                  <p className="text-xs text-muted font-mono">
                                    user_id: {u.userId}
                                  </p>
                                  {u.renewsAt && (
                                    <p className="text-xs text-muted">
                                      Renews: {new Date(u.renewsAt).toLocaleDateString()}
                                    </p>
                                  )}
                                  {/* 手动调额 */}
                                  {editingCredits?.userId === u.userId ? (
                                    <div className="flex items-center gap-3">
                                      <label className="text-xs text-muted">
                                        Extra searches:
                                        <input
                                          type="number"
                                          min={0}
                                          value={editingCredits.searches}
                                          onChange={(e) =>
                                            setEditingCredits((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    searches: Number(e.target.value),
                                                  }
                                                : null,
                                            )
                                          }
                                          className="ml-1 w-16 rounded border border-border bg-surface px-1 py-0.5 text-xs"
                                        />
                                      </label>
                                      <label className="text-xs text-muted">
                                        Extra enriches:
                                        <input
                                          type="number"
                                          min={0}
                                          value={editingCredits.enriches}
                                          onChange={(e) =>
                                            setEditingCredits((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    enriches: Number(e.target.value),
                                                  }
                                                : null,
                                            )
                                          }
                                          className="ml-1 w-16 rounded border border-border bg-surface px-1 py-0.5 text-xs"
                                        />
                                      </label>
                                      <button
                                        onClick={saveCredits}
                                        disabled={savingCredits}
                                        className="rounded bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50 cursor-pointer"
                                      >
                                        {savingCredits ? "Saving…" : "Save"}
                                      </button>
                                      <button
                                        onClick={() => setEditingCredits(null)}
                                        className="text-xs text-muted hover:text-foreground cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setEditingCredits({
                                          userId: u.userId,
                                          searches: u.extraSearchCredits,
                                          enriches: u.extraEnrichCredits,
                                        })
                                      }
                                      className="rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground cursor-pointer"
                                    >
                                      Adjust extra credits
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                  {(users ?? []).length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-muted">No users yet</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Searches Tab ─────────────────────────────────────────────── */}
          {tab === "searches" && stats && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface">
                  <tr>
                    {["Title", "Status", "Step", "User", "Created", "Error"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.recentSearches.map((s) => (
                    <tr key={s.id} className="bg-surface hover:bg-background">
                      <td className="max-w-[180px] truncate px-4 py-3 font-medium">
                        {s.title ?? <span className="text-muted">(untitled)</span>}
                      </td>
                      <td className="px-4 py-3">{statusBadge(s.status)}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {s.pipeline_step ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {s.user_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <span title={s.created_at}>{timeAgo(s.created_at)}</span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-xs text-red-500">
                        {s.error_message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.recentSearches.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted">No searches yet</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
