"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
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
  User,
  Search,
  RotateCcw,
  FileText,
  Users,
  Star,
  Send,
  Download,
  Eye,
  EyeOff,
} from "lucide-react";

type SearchRow = {
  id: string;
  title: string | null;
  jd_text: string;
  parsed_requirements: Record<string, unknown> | null;
  status: string;
  created_at: string;
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
  email: string | null;
  outreach_draft: string | null;
  status: string;
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
      {score}% match
    </span>
  );
}

function CandidateCard({
  candidate,
  onStatusChange,
}: {
  candidate: CandidateRow;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editedEmail, setEditedEmail] = useState(
    candidate.outreach_draft || "",
  );

  function copyEmail() {
    navigator.clipboard.writeText(editedEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusColors: Record<string, string> = {
    new: "text-muted-light",
    starred: "text-amber-500",
    contacted: "text-blue-600",
    replied: "text-green-600",
    rejected: "text-red-500",
  };

  return (
    <div className="rounded-xl border border-border bg-background transition-colors hover:border-muted-light">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-5 text-left"
      >
        <InitialsAvatar name={candidate.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-sm font-semibold">{candidate.name}</p>
            <ScoreBadge score={candidate.match_score} />
            {candidate.status !== "new" && (
              <span
                className={`text-xs font-medium capitalize ${statusColors[candidate.status] || ""}`}
              >
                {candidate.status}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {candidate.headline}
          </p>
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
                      href={candidate.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Profile
                    </a>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                  Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-surface px-2 py-1 text-xs text-foreground"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                  Why This Candidate
                </p>
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
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                  Status
                </p>
                <div className="flex gap-2">
                  {["new", "starred", "contacted", "replied", "rejected"].map((s) => (
                    <button
                      key={s}
                      onClick={() => onStatusChange(candidate.id, s)}
                      className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
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

            {/* Right: Outreach email */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-light">
                  Outreach Email
                </p>
                <button
                  onClick={copyEmail}
                  className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-dark hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={editedEmail}
                onChange={(e) => setEditedEmail(e.target.value)}
                rows={12}
                className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProcessingSteps({ hasTitle, hasCandidates }: { hasTitle: boolean; hasCandidates: boolean }) {
  const steps = [
    { icon: FileText, label: "Parsing job description", done: hasTitle },
    { icon: Users, label: "Searching candidate database", done: hasCandidates },
    { icon: Star, label: "AI scoring & ranking", done: false },
    { icon: Send, label: "Generating outreach emails", done: false },
  ];

  // Determine current active step
  let activeIdx = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].done) activeIdx = i + 1;
  }

  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-sm font-medium">Processing your search...</p>
      </div>
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
      <p className="mt-4 text-xs text-muted">This usually takes 30-60 seconds.</p>
    </div>
  );
}

export default function SearchResultPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJd, setShowJd] = useState(false);

  function exportCSV() {
    if (candidates.length === 0) return;
    const headers = ["Name", "Headline", "Location", "Match Score", "Skills", "Experience Years", "Profile URL", "Email", "Status", "Match Reasons"];
    const rows = candidates.map((c) => [
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
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
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

    const [{ data: searchData }, { data: candidatesData }] = await Promise.all([
      supabase.from("hirelix_searches").select("*").eq("id", id).single(),
      supabase
        .from("hirelix_candidates")
        .select("*")
        .eq("search_id", id)
        .order("match_score", { ascending: false }),
    ]);

    if (searchData) setSearch(searchData);
    if (candidatesData) setCandidates(candidatesData);
    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while processing
  useEffect(() => {
    if (search?.status !== "processing") return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [search?.status, fetchData]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-light" />
      </div>
    );
  }

  if (!search) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted">Search not found</p>
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

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/app"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to searches
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            {search.title || "Untitled Search"}
          </h1>
          {search.status === "done" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowJd(!showJd)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:border-muted-light transition-colors"
              >
                {showJd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showJd ? "Hide JD" : "View JD"}
              </button>
              {candidates.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:border-muted-light transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Export CSV
                </button>
              )}
              <Link
                href="/app/search/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
              >
                <Search className="h-3 w-3" />
                New Search
              </Link>
            </div>
          )}
        </div>
        {reqs && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {Array.isArray(reqs.required_skills) &&
              (reqs.required_skills as string[]).slice(0, 6).map((skill) => (
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
            {typeof reqs.location === "string" && reqs.location && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <MapPin className="h-3 w-3" />
                {reqs.location}
              </span>
            )}
          </div>
        )}
      </div>

      {/* JD original text toggle */}
      {showJd && search.jd_text && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">Original Job Description</p>
          <pre className="whitespace-pre-wrap text-sm text-muted leading-relaxed">{search.jd_text}</pre>
        </div>
      )}

      {/* Processing state with step progress */}
      {search.status === "processing" && (
        <ProcessingSteps hasTitle={!!search.title} hasCandidates={candidates.length > 0} />
      )}

      {/* Error state */}
      {search.status === "error" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">
                Something went wrong
              </p>
              <p className="text-xs text-red-600">
                We couldn&apos;t generate candidates for this search. Please try
                again.
              </p>
            </div>
            <Link
              href="/app/search/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Try Again
            </Link>
          </div>
        </div>
      )}

      {/* Results */}
      {candidates.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {candidates.length} candidates found — sorted by match score
          </p>
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {search.status === "done" && candidates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <p className="text-muted">No candidates found for this search.</p>
        </div>
      )}
    </div>
  );
}
