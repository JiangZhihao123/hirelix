"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Github,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Send,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import { sanitizeDisplayName } from "@/lib/display-name";
import type { CandidateRow } from "./types";
import {
  deriveCurrentCompany,
  deriveCurrentRole,
  fixSentenceSpacing,
  formatConstraintValue,
  formatDimensionLabel,
  formatEvidenceStrength,
  getCandidateGithubSignals,
  getCandidateOverallScore,
  getCandidateScoreMetrics,
  getCandidateScoringBreakdown,
  getGithubBadge,
  parseOutreach,
} from "./utils";
import { ActionabilityBadge, ContactActionStrip, InitialsAvatar, ScoreBadge } from "./ui";

export function CandidateCard({
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
  isNew?: boolean;
}) {
  const displayName = sanitizeDisplayName(candidate.name);
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
          github_url: data.github_url || prev.github_url,
          outreach_draft: data.outreach_draft || prev.outreach_draft,
          metadata: data.metadata || prev.metadata,
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
  const scoreMetrics = getCandidateScoreMetrics(candidate);
  const suitability = candidate.metadata?.suitability;
  const overallScore = getCandidateOverallScore(candidate);
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
  const githubSignals = getCandidateGithubSignals(candidate);
  const githubBadge = getGithubBadge(githubSignals);
  const currentCompany = deriveCurrentCompany(candidate);
  const currentRole = deriveCurrentRole(candidate);

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
      className="rounded-xl border border-border bg-background transition-colors hover:border-muted-light"
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
        <InitialsAvatar name={displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {isNew && (
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                New
              </span>
            )}
            <ActionabilityBadge candidate={candidate} />
            <ScoreBadge score={overallScore} />
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${githubBadge.className}`}>{githubBadge.text}</span>
            {candidate.status !== "new" && (
              <span
                className={`text-xs font-medium capitalize ${statusColors[candidate.status] || ""}`}
              >
                {candidate.status}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {currentRole || (candidate.skills.length > 0 ? candidate.skills.slice(0, 3).join(" · ") : "Professional")}
          </p>
          {currentCompany && (
            <p className="mt-1 truncate text-[11px] text-muted-light">{currentCompany}</p>
          )}
          {scoringBreakdown && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scoreMetrics.map((metric) => (
                <span
                  key={metric.key}
                  title={metric.description}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    metric.key === "overall"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {metric.shortLabel} {typeof metric.score === "number" ? metric.score : "—"}
                </span>
              ))}
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
        {canUnlockAction && !hasRealEmail && (
          <PaddleCheckoutButton
            checkout={{ type: "plan", planCode: "pro_monthly" }}
            label="Get email"
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
                    Scorecard
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {scoreMetrics.map((metric) => (
                      <div key={metric.key} className="rounded-lg border border-border bg-surface px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-light">{metric.label}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {typeof metric.score === "number" ? metric.score : "—"} · {formatDimensionLabel(metric.score)}
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-muted">{metric.description}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
                    <span className="font-semibold">{githubBadge.text}</span>
                    <span> · {formatEvidenceStrength(githubSignals?.evidence_strength)}. Verified GitHub can strengthen Technical Evidence; possible matches are not used in scoring.</span>
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
                      Why contact this person
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
                    Why not higher
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
                            <p className="mt-1 text-xs text-muted">{fixSentenceSpacing(job.summary.split("\uF0D8")[0].trim())}</p>
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
                      ? enrichesRemaining > 0
                        ? "Use one of your free contact unlocks when you decide this candidate is worth reaching out to."
                        : "You already have the ranked candidate list and draft copy. Upgrade when you need more contact unlocks."
                      : "The outreach copy is ready. Find contact details when you are ready to act on this candidate."}
                  </p>
                  {enrichesRemaining <= 0 && billingPlanCode === "free" ? (
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
                  <ContactActionStrip
                    billingPlanCode={billingPlanCode}
                    hasRealEmail={hasRealEmail}
                    enrichesRemaining={enrichesRemaining}
                    enriching={enriching}
                    onEnrich={handleEnrich}
                    onUpgradeClick={onUpgradeClick}
                    onError={(message) => setEnrichError(message)}
                    compact
                  />
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
