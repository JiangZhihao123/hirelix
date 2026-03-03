"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

type SearchRow = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  jd_text: string;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "done" | "processing" | "error">("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("hirelix_searches")
      .select("id, title, status, created_at, jd_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setSearches(data || []);
        setLoading(false);
      });
  }, [user]);

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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Searches</h1>
          <p className="mt-1 text-sm text-muted">
            Paste a job description and find matching candidates in minutes.
          </p>
        </div>
        <Link
          href="/app/search/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
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
          <FileText className="mb-4 h-12 w-12 text-muted-light" />
          <p className="mb-2 text-lg font-medium">No searches yet</p>
          <p className="mb-6 text-sm text-muted">
            Start by pasting a job description to find candidates.
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
          <div className="flex gap-1 rounded-lg bg-surface p-1">
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
          {searches.filter((s) => filter === "all" || s.status === filter).map((s) => (
            <Link
              key={s.id}
              href={`/app/search/${s.id}`}
              className="flex items-center gap-4 rounded-xl border border-border p-5 transition-colors hover:border-muted-light hover:bg-surface"
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
                <p className="mt-0.5 truncate text-xs text-muted">
                  {s.jd_text.slice(0, 120)}...
                </p>
              </div>
              <p className="shrink-0 text-xs text-muted-light">
                {new Date(s.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
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
