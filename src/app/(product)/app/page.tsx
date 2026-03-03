"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Trash2,
  Users,
  Sparkles,
} from "lucide-react";

type SearchRow = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
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
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [candidateCounts, setCandidateCounts] = useState<Record<string, CandidateCount>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "done" | "processing" | "error">("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: searchData } = await supabase
      .from("hirelix_searches")
      .select("id, title, status, created_at, jd_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setSearches(searchData || []);
    setLoading(false);

    // Fetch candidate counts for done searches
    const doneIds = (searchData || []).filter((s) => s.status === "done").map((s) => s.id);
    if (doneIds.length > 0) {
      const { data: candidates } = await supabase
        .from("hirelix_candidates")
        .select("search_id, status")
        .in("search_id", doneIds);

      const counts: Record<string, CandidateCount> = {};
      for (const c of candidates || []) {
        if (!counts[c.search_id]) {
          counts[c.search_id] = { search_id: c.search_id, total: 0, starred: 0, contacted: 0 };
        }
        counts[c.search_id].total++;
        if (c.status === "starred") counts[c.search_id].starred++;
        if (c.status === "contacted") counts[c.search_id].contacted++;
      }
      setCandidateCounts(counts);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function deleteSearch(e: React.MouseEvent, searchId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this search and all its candidates?")) return;
    setDeleting(searchId);
    await supabase.from("hirelix_candidates").delete().eq("search_id", searchId);
    await supabase.from("hirelix_searches").delete().eq("id", searchId);
    setSearches((prev) => prev.filter((s) => s.id !== searchId));
    setDeleting(null);
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-light" />;
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Searches</h1>
          <p className="mt-1 text-sm text-muted">
            Paste a job description and find matching candidates in minutes.
          </p>
        </div>
        <Link
          href="/app/search/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" />
          New Search
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-light" />
        </div>
      ) : searches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <p className="mb-2 text-lg font-medium">Start your first search</p>
          <p className="mb-6 max-w-sm text-center text-sm text-muted">
            Paste a job description and Hirelix will find matching candidates with personalized outreach emails in under 5 minutes.
          </p>
          <Link
            href="/app/search/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            New Search
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Status filter tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg bg-surface p-1">
            {(["all", "done", "processing", "error"] as const).map((f) => {
              const count = f === "all" ? searches.length : searches.filter((s) => s.status === f).length;
              const labels = { all: "All", done: "Done", processing: "In Progress", error: "Failed" };
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
          {searches.filter((s) => filter === "all" || s.status === filter).map((s) => {
            const stats = candidateCounts[s.id];
            return (
              <Link
                key={s.id}
                href={`/app/search/${s.id}`}
                className="group flex items-center gap-4 rounded-xl border border-border p-4 sm:p-5 transition-colors hover:border-muted-light hover:bg-surface"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {s.title || "Untitled Search"}
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
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="hidden text-xs text-muted-light sm:block">
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                  <button
                    onClick={(e) => deleteSearch(e, s.id)}
                    disabled={deleting === s.id}
                    className="rounded-md p-1.5 text-muted-light opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Delete search"
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
          {searches.filter((s) => filter === "all" || s.status === filter).length === 0 && (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-10">
              <p className="text-sm text-muted">No searches with this status.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
