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
  created_at: string;
};

type WorkHistoryItem = {
  title: string | null;
  company: string | null;
  start_date: string | null;
  end_date: string | null;
};

type EducationItem = {
  school: string | null;
  degree: string | null;
  major: string | null;
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
  } | null;
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

function CandidateCard({
  candidate,
  onStatusChange,
  requiredSkills,
  selected,
  onToggleSelect,
}: {
  candidate: CandidateRow;
  onStatusChange: (id: string, status: string) => void;
  requiredSkills: string[];
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | false>(false);
  const [enriching, setEnriching] = useState(false);
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
      }
    } catch (err) {
      console.error("Enrich failed:", err);
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
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 cursor-pointer items-center gap-4 min-w-0"
        >
        <InitialsAvatar name={candidate.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-sm font-semibold">{candidate.name}</p>
            <ScoreBadge score={candidate.match_score} />
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

              {/* Work History */}
              {candidate.metadata?.work_history && candidate.metadata.work_history.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Work History
                  </p>
                  <div className="space-y-2">
                    {candidate.metadata.work_history.map((job, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-light" />
                        <div>
                          <p className="font-medium text-foreground">{job.title || "Unknown Role"}</p>
                          <p className="text-xs text-muted">
                            {job.company || "Unknown Company"}
                            {job.start_date && (
                              <span className="text-muted-light"> · {job.start_date}{job.end_date ? ` – ${job.end_date}` : " – Present"}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {candidate.metadata?.education && candidate.metadata.education.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-light">
                    Education
                  </p>
                  <div className="space-y-2">
                    {candidate.metadata.education.map((edu, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-light" />
                        <div>
                          <p className="font-medium text-foreground">{edu.school}</p>
                          {(edu.degree || edu.major) && (
                            <p className="text-xs text-muted">
                              {[edu.degree, edu.major].filter(Boolean).join(" in ")}
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
                // On-demand: show "Get Email & Draft" button
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
                  <Mail className="mb-3 h-8 w-8 text-muted-light" />
                  <p className="mb-1 text-sm font-medium text-foreground">Ready to reach out?</p>
                  <p className="mb-4 text-xs text-muted">Find their email and generate a personalized outreach message.</p>
                  <button
                    onClick={handleEnrich}
                    disabled={enriching}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {enriching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Finding email & drafting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Get Email & Draft
                      </>
                    )}
                  </button>
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

// Map pipeline_step values to step index
const STEP_ORDER = ["parsing", "parsed", "searching", "scoring", "scraping", "done"];

function ProcessingSteps({ pipelineStep, candidateCount }: { pipelineStep: string | null; candidateCount: number }) {
  const stepIdx = STEP_ORDER.indexOf(pipelineStep || "parsing");
  const steps = [
    { icon: FileText, label: "Parsing job description", doneAt: 1 },     // done after "parsed"
    { icon: Users, label: "Searching & screening candidates", doneAt: 3 },// done after "scoring" (pre-screen)
    { icon: Star, label: "Scraping full profiles & AI scoring", doneAt: 5 }, // done at "done"
  ];

  // Determine current active step based on pipeline_step
  let activeIdx = 0;
  for (let i = 0; i < steps.length; i++) {
    if (stepIdx >= steps[i].doneAt) activeIdx = i + 1;
    else break;
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
      {candidateCount > 0 ? (
        <p className="mt-4 text-xs text-primary font-medium">{candidateCount} candidates found — generating outreach emails...</p>
      ) : (
        <p className="mt-4 text-xs text-muted">This usually takes 30-60 seconds.</p>
      )}
    </div>
  );
}

export default function SearchResultPage() {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJd, setShowJd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [showOnlyWithEmail, setShowOnlyWithEmail] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
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
    if (candidatesData) {
      // Sort: candidates with email first, then by match score
      const sorted = candidatesData.sort((a, b) => {
        const aHasEmail = !!a.email;
        const bHasEmail = !!b.email;
        if (aHasEmail !== bHasEmail) return bHasEmail ? 1 : -1;
        return b.match_score - a.match_score;
      });
      setCandidates(sorted);
    }
    setLoading(false);
  }, [user, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fast poll while processing (1.5s for near real-time feel)
  useEffect(() => {
    if (search?.status !== "processing") return;
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [search?.status, fetchData]);

  async function handleRetry() {
    if (!session?.access_token || !id) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/search/${id}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        // Reset local state to show processing
        setSearch((prev) => prev ? { ...prev, status: "processing", pipeline_step: "queued", error_message: null } : prev);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            {search.title || "Untitled Search"}
          </h1>
          {search.status === "done" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowJd(!showJd)}
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:border-muted-light transition-colors"
              >
                {showJd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                <span className="hidden sm:inline">{showJd ? "Hide JD" : "View JD"}</span>
                <span className="sm:hidden">{showJd ? "Hide" : "JD"}</span>
              </button>
              {candidates.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:border-muted-light transition-colors"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">CSV</span>
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
        <ProcessingSteps pipelineStep={search.pipeline_step} candidateCount={candidates.length} />
      )}

      {/* Error state */}
      {search.status === "error" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">
                {search.error_message?.includes("API key") ? "PDL API Key Required" : "Something went wrong"}
              </p>
              <p className="text-xs text-red-600">
                {search.error_message || "We couldn\u0027t generate candidates for this search. Please try again."}
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
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted">
                {showOnlyWithEmail 
                  ? `${candidates.filter(c => c.email).length} candidates with email`
                  : `${candidates.length} candidates found`}
              </p>
              <div className="hidden items-center gap-1.5 text-xs text-muted-light sm:flex">
                <span>Avg: {Math.round(candidates.reduce((a, c) => a + c.match_score, 0) / candidates.length)}%</span>
                <span>·</span>
                <span>Range: {Math.min(...candidates.map((c) => c.match_score))}–{Math.max(...candidates.map((c) => c.match_score))}%</span>
                <span>·</span>
                <span>{candidates.filter(c => c.email).length}/{candidates.length} with email</span>
              </div>
            </div>
            {search.status === "done" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowOnlyWithEmail(!showOnlyWithEmail)}
                  className="text-xs cursor-pointer text-muted hover:text-foreground transition-colors"
                >
                  {showOnlyWithEmail ? "Show all" : "Only with email"}
                </button>
                <span className="text-muted-light">·</span>
                <button
                  onClick={toggleAll}
                  className="text-xs cursor-pointer text-muted hover:text-foreground transition-colors"
                >
                  {selectedIds.size === candidates.length ? "Deselect all" : "Select all"}
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
          {candidates
            .filter(c => !showOnlyWithEmail || c.email)
            .map((c, idx) => (
              <div
                key={c.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <CandidateCard
                  candidate={c}
                  onStatusChange={handleStatusChange}
                  requiredSkills={reqs && Array.isArray(reqs.required_skills) ? (reqs.required_skills as string[]) : []}
                  selected={selectedIds.has(c.id)}
                  onToggleSelect={() => toggleSelect(c.id)}
                />
              </div>
            ))}
        </div>
      )}

      {search.status === "done" && candidates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <p className="text-muted">No candidates found for this search.</p>
          <Link
            href={`/app/search/new?jd=${encodeURIComponent(search.jd_text)}`}
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
