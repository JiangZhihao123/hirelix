"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Check,
  Copy,
  Github,
  GraduationCap,
  Loader2,
  Mail,
  Send,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status";
import { sanitizeDisplayName } from "@/lib/display-name";
import type { CandidateRow, PublicEvidenceItem } from "./types";
import {
  deriveCurrentCompany,
  deriveCurrentRole,
  fixSentenceSpacing,
  formatDimensionLabel,
  getCandidateGithubSignals,
  getCandidateOverallScore,
  getCandidatePublicEvidence,
  getCandidateSellingKit,
  getCandidateScoreMetrics,
  getEvidenceSourceLabel,
  formatRecruiterSellingHeadline,
  parseOutreach,
} from "./utils";
import { ActionabilityBadge, ContactActionStrip, InitialsAvatar, ScoreBadge } from "./ui";

function citationLabelForItem(item: { citation_label?: string | null }, index: number) {
  return item.citation_label || `[${index + 1}]`;
}

function formatPublicationLine(item: PublicEvidenceItem) {
  if (item.source_type !== "paper" || !item.publication) return null;
  return [
    item.publication.title,
    item.publication.venue,
    item.publication.year,
    typeof item.publication.citation_count === "number"
      ? `${item.publication.citation_count} citations`
      : null,
  ].filter(Boolean).join(" · ");
}

function formatPublicEvidenceCategory(item: PublicEvidenceItem) {
  switch (item.evidence_category) {
    case "official_project_credit":
      return "Official project credit";
    case "research_publication":
      return "Research publication";
    case "technical_writing":
      return "Technical writing";
    case "package_or_tool":
      return "Package or tool";
    case "identity_support":
      return "Identity support";
    case "risk_only":
      return "Risk only";
    case "engineering_proof":
      return "Engineering proof";
    default:
      return item.source_type ? item.source_type.replace(/_/g, " ") : "Public evidence";
  }
}

function isSellingEvidence(item: PublicEvidenceItem) {
  return (
    item.safe_to_use_in_client_brief === true ||
    item.safe_to_use_in_outreach === true ||
    item.selling_tier === "strong_selling_point" ||
    item.selling_tier === "supporting_point"
  );
}

export function CandidateWorkbenchDetail({
  candidate,
  requiredSkills,
  billingPlanCode,
  enrichesRemaining,
  refreshBilling,
  onUpgradeClick,
  onStatusChange,
}: {
  candidate: CandidateRow;
  requiredSkills: string[];
  billingPlanCode: import("@/lib/billing").BillingPlanCode;
  enrichesRemaining: number;
  refreshBilling: () => Promise<void>;
  onUpgradeClick: (surface: string) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<"sell" | "evidence" | "outreach" | "profile" | "score">("sell");
  const [copied, setCopied] = useState<string | false>(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [localCandidate, setLocalCandidate] = useState(candidate);
  const { user } = useAuth();

  useEffect(() => {
    setLocalCandidate(candidate);
  }, [candidate]);

  const displayableWorkHistory = (localCandidate.metadata?.work_history || []).filter(
    (job) => job.title || job.company || job.summary,
  );
  const displayableEducation = (localCandidate.metadata?.education || []).filter(
    (edu) => edu.school || edu.degree || edu.major,
  );
  const currentCompany = deriveCurrentCompany(localCandidate);
  const currentRole = deriveCurrentRole(localCandidate);
  const localDisplayName = sanitizeDisplayName(localCandidate.name);
  const suitability = localCandidate.metadata?.suitability;
  const githubSignals = getCandidateGithubSignals(localCandidate);
  const publicEvidence = getCandidatePublicEvidence(localCandidate);
  const sellingKit = getCandidateSellingKit(localCandidate);
  const recruiterHeadline = formatRecruiterSellingHeadline(localCandidate);
  const outreach = parseOutreach(localCandidate.outreach_draft);
  const hasRealEmail = !!(localCandidate.email && !localCandidate.email.includes("***"));
  const [outreachTab, setOutreachTab] = useState<"linkedin" | "email">(hasRealEmail ? "email" : "linkedin");
  const [editedSubject, setEditedSubject] = useState(outreach.subject);
  const [editedLinkedin, setEditedLinkedin] = useState(outreach.linkedin);
  const [editedEmail, setEditedEmail] = useState(outreach.email);

  useEffect(() => {
    const next = parseOutreach(localCandidate.outreach_draft);
    setEditedSubject(next.subject);
    setEditedLinkedin(next.linkedin);
    setEditedEmail(next.email);
    setOutreachTab(localCandidate.email ? "email" : "linkedin");
  }, [localCandidate.email, localCandidate.outreach_draft]);

  const overallScore = getCandidateOverallScore(localCandidate);
  const scoreMetrics = getCandidateScoreMetrics(localCandidate);
  const activeBody = outreachTab === "linkedin" ? editedLinkedin : editedEmail;
  const setActiveBody = outreachTab === "linkedin" ? setEditedLinkedin : setEditedEmail;
  const shortlistReason =
    localCandidate.metadata?.shortlist_reason ??
    suitability?.shortlist_reason ??
    null;
  const whyNotHigher = Array.isArray(localCandidate.metadata?.why_not_higher)
    ? localCandidate.metadata.why_not_higher
    : [];
  const riskFlags = Array.isArray(localCandidate.metadata?.risk_flags)
    ? localCandidate.metadata.risk_flags
    : [];
  const hasVerifiedGithub = githubSignals?.status === "verified";
  const evidenceSourceLabel = getEvidenceSourceLabel(githubSignals);
  const publicEvidenceItems: PublicEvidenceItem[] =
    publicEvidence?.items && publicEvidence.items.length > 0
      ? publicEvidence.items
      : hasVerifiedGithub && (githubSignals?.highlight || githubSignals?.recruiter_summary)
        ? [
            {
              source_type: "github",
              source_url: githubSignals.profile_url || localCandidate.github_url || null,
              title: githubSignals.profile_login || "GitHub",
              identity_confidence: githubSignals.discovery_confidence ?? null,
              relevance_score: githubSignals.github_signal_score ?? null,
              evidence_strength:
                githubSignals.evidence_strength === "strong" ||
                githubSignals.evidence_strength === "medium" ||
                githubSignals.evidence_strength === "weak"
                  ? githubSignals.evidence_strength
                  : "weak",
              citation_label: "[1]",
              evidence_summary: githubSignals.highlight || githubSignals.recruiter_summary,
              outreach_angle: githubSignals.outreach_angle,
            },
          ]
        : [];
  const sellingEvidenceItems = publicEvidenceItems.filter(isSellingEvidence);
  const identityEvidenceItems = publicEvidenceItems.filter(
    (item) => item.selling_tier === "identity_only" || item.evidence_category === "identity_support",
  );
  const primaryEvidenceItem =
    sellingEvidenceItems[0] ||
    publicEvidenceItems.find((item) => item.selling_tier !== "identity_only" && item.evidence_category !== "identity_support") ||
    publicEvidenceItems[0] ||
    null;
  const githubSignalCards = [
    {
      label: "Activity trend",
      value: hasVerifiedGithub
        ? githubSignals?.activity_trend || "No activity trend computed"
        : "No public GitHub data",
    },
    {
      label: "Real stack",
      value:
        hasVerifiedGithub && githubSignals?.top_languages && githubSignals.top_languages.length > 0
          ? githubSignals.top_languages.slice(0, 3).join(", ")
          : "Only LinkedIn evidence available",
    },
    {
      label: "Merged PRs",
      value:
        hasVerifiedGithub && typeof githubSignals?.merged_pr_count === "number"
          ? `${githubSignals.merged_pr_count}`
          : "Not available",
    },
    {
      label: "Commit hygiene",
      value: hasVerifiedGithub
        ? githubSignals?.commit_message_quality || "Not evaluated yet"
        : "Not evaluated yet",
    },
  ];
  const publicEvidenceCards =
    publicEvidenceItems.length > 0
      ? [
          {
            label: "Evidence score",
            value: typeof publicEvidence?.score === "number" ? `${publicEvidence.score}` : "Not scored",
          },
          {
            label: "Sources",
            value: Object.entries(publicEvidence?.source_counts || {})
              .filter(([, count]) => count > 0)
              .map(([source, count]) => `${source.replace(/_/g, " ")} ${count}`)
              .slice(0, 3)
              .join(", ") || (publicEvidenceItems[0]?.source_type?.replace(/_/g, " ") ?? "Public source"),
          },
          {
            label: "Top relevance",
            value:
              typeof primaryEvidenceItem?.relevance_score === "number"
                ? `${primaryEvidenceItem.relevance_score}`
                : "Not scored",
          },
          {
            label: "Identity confidence",
            value:
              typeof primaryEvidenceItem?.identity_confidence === "number"
                ? `${Math.round((primaryEvidenceItem.identity_confidence || 0) * 100)}%`
                : "Verified source",
          },
        ]
      : githubSignalCards;
  const whyContactSummary =
    publicEvidence?.summary ||
    githubSignals?.recruiter_summary ||
    shortlistReason ||
    localCandidate.match_reasons[0] ||
    `${localDisplayName} looks relevant based on current LinkedIn evidence.`;
  const proofToReference =
    primaryEvidenceItem?.evidence_summary ||
    githubSignals?.highlight ||
    githubSignals?.evidence_summary?.[0] ||
    localCandidate.match_reasons[0] ||
    "No specific proof line is ready yet.";
  const verificationChecklist = [
    ...(githubSignals?.verification_risks || []),
    ...riskFlags,
  ].slice(0, 5);
  const publicEvidenceSourceLabel = primaryEvidenceItem?.source_type
    ? `${primaryEvidenceItem.citation_label || "[1]"} ${formatPublicEvidenceCategory(primaryEvidenceItem)}`
    : evidenceSourceLabel;
  const bestOpeningAngle =
    sellingKit?.outreach_opener ||
    primaryEvidenceItem?.outreach_angle ||
    githubSignals?.outreach_angle ||
    (publicEvidenceItems.length > 0
      ? "Lead with the strongest verified public engineering evidence."
      : "No verified public engineering evidence found yet — reference their most relevant LinkedIn experience directly in the opening line.");

  async function handleEnrich(options: { regenerateOutreach?: boolean } = {}) {
    if (enriching || !user) return;
    setEnrichError(null);
    setEnriching(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/enrich`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: options.regenerateOutreach
          ? JSON.stringify({ regenerate_outreach: true })
          : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "We couldn't enrich this candidate.");
      }
      const data = await res.json();
      setLocalCandidate((prev) => ({
        ...prev,
        email: data.email || prev.email,
        github_url: data.github_url || prev.github_url,
        outreach_draft: data.outreach_draft || prev.outreach_draft,
        metadata: data.metadata || prev.metadata,
      }));
      await refreshBilling();
    } catch (error) {
      setEnrichError(error instanceof Error ? error.message : "We couldn't enrich this candidate.");
    } finally {
      setEnriching(false);
    }
  }

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

  const clientBriefText = sellingKit?.client_brief
    ? [
        sellingKit.client_brief.positioning,
        ...(sellingKit.client_brief.why_match || []).map((item) => `- ${item}`),
        ...(sellingKit.client_brief.evidence_refs && sellingKit.client_brief.evidence_refs.length > 0
          ? ["Evidence:", ...sellingKit.client_brief.evidence_refs.map((item) => `- ${item}`)]
          : []),
        ...(sellingKit.client_brief.risks_to_verify && sellingKit.client_brief.risks_to_verify.length > 0
          ? ["Risks to verify:", ...sellingKit.client_brief.risks_to_verify.map((item) => `- ${item}`)]
          : []),
      ].filter(Boolean).join("\n")
    : "";
  const citationLinks = new Map(
    publicEvidenceItems
      .filter((item) => item.citation_label && item.source_url)
      .map((item) => [item.citation_label as string, item.source_url as string]),
  );
  const linkedInBased = sellingKit?.evidence_basis === "linkedin_based";
  const canRegenerateWithPublicEvidence =
    Boolean(localCandidate.outreach_draft && sellingKit?.evidence_basis === "public_evidence");

  return (
    <>
      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <InitialsAvatar name={localDisplayName} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {localDisplayName}
                </h2>
                <ActionabilityBadge candidate={localCandidate} />
                <ScoreBadge score={overallScore} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {currentRole}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                {currentCompany && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {currentCompany}
                  </span>
                )}
                {localCandidate.location && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {localCandidate.location}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <label className="sr-only" htmlFor={`candidate-status-${localCandidate.id}`}>
              Candidate status
            </label>
            <select
              id={`candidate-status-${localCandidate.id}`}
              value={localCandidate.status}
              onChange={(event) => onStatusChange(localCandidate.id, event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold capitalize text-slate-700 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              {CANDIDATE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {CANDIDATE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 border-b border-slate-200">
          <div className="flex flex-wrap gap-1">
            {[
              ["sell", "Sell"],
              ["evidence", "Evidence"],
              ["outreach", "Outreach"],
              ["profile", "Profile"],
              ["score", "Score"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveDetailTab(key as typeof activeDetailTab)}
                className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition ${
                  activeDetailTab === key
                    ? "border border-b-white border-slate-200 bg-white text-slate-950"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {activeDetailTab === "sell" && (
            <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
              <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Candidate Selling Kit
                    </p>
                    <p className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      {linkedInBased
                        ? "LinkedIn-based pitch"
                        : sellingKit?.recommendation === "reach_out_first"
                          ? "Reach out first"
                          : sellingKit?.recommendation === "backup"
                            ? "Backup candidate"
                            : sellingKit?.recommendation === "do_not_pitch"
                              ? "Do not pitch yet"
                              : "LinkedIn-based pitch"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sellingKit?.outreach_opener && (
                      <button
                        onClick={() => copyText(sellingKit.outreach_opener || "", "opener")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        {copied === "opener" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy opener
                      </button>
                    )}
                    {clientBriefText && (
                      <button
                        onClick={() => copyText(clientBriefText, "brief")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        {copied === "brief" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy client brief
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-4 text-xl font-semibold leading-7 text-slate-950">
                  {recruiterHeadline || whyContactSummary}
                </p>
                {sellingKit?.outreach_opener && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Copy-ready opener
                    </p>
                    <p className="mt-2">{sellingKit.outreach_opener}</p>
                  </div>
                )}
                {sellingKit?.client_brief && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Client brief preview
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {sellingKit.client_brief.positioning}
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Best usable proof
                  </p>
                  {sellingEvidenceItems.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {sellingEvidenceItems.slice(0, 3).map((item, index) => (
                        <li key={`${item.source_url}-${item.evidence_summary}`} className="text-sm leading-6 text-slate-700">
                          {item.source_url ? (
                            <a href={item.source_url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:text-emerald-900">
                              {citationLabelForItem(item, index)}
                            </a>
                          ) : (
                            <span className="font-semibold text-emerald-700">{citationLabelForItem(item, index)}</span>
                          )}{" "}
                          {item.evidence_summary}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      No public engineering proof is safe enough to lead with yet. Use LinkedIn facts conservatively.
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    Verify before pitching
                  </p>
                  {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || verificationChecklist).length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || verificationChecklist).slice(0, 4).map((risk) => (
                        <li key={risk} className="text-sm leading-6 text-amber-900">{risk}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-amber-900">
                      Confirm current interest, compensation range, and role scope before submitting.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeDetailTab === "evidence" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Evidence source details
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Selling evidence is separated from identity support so recruiters do not overstate the proof.
              </p>
              <div className="mt-4 space-y-3">
                {publicEvidenceItems.length > 0 ? publicEvidenceItems.slice(0, 6).map((item, index) => (
                  <div key={`${item.source_url}-${item.evidence_summary}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-950">{citationLabelForItem(item, index)}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {formatPublicEvidenceCategory(item)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{item.evidence_summary}</p>
                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-sky-700 hover:text-sky-900">
                        Source
                      </a>
                    )}
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    No verified public engineering evidence found yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeDetailTab === "outreach" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Personalized outreach
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Current source: {publicEvidenceSourceLabel}
                  </p>
                </div>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Send className="h-4 w-4" />
                  Open outreach editor
                </button>
              </div>
              {!hasRealEmail && (
                <div className="mt-4">
                  <ContactActionStrip
                    billingPlanCode={billingPlanCode}
                    hasRealEmail={hasRealEmail}
                    enrichesRemaining={enrichesRemaining}
                    enriching={enriching}
                    onEnrich={handleEnrich}
                    onUpgradeClick={onUpgradeClick}
                    onError={(message) => setEnrichError(message)}
                  />
                </div>
              )}
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Best opening angle
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{bestOpeningAngle}</p>
              </div>
            </div>
          )}

          {activeDetailTab === "profile" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                LinkedIn resume
              </p>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Work history</p>
                  <div className="mt-3 space-y-3">
                    {displayableWorkHistory.length > 0 ? displayableWorkHistory.map((job, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{job.title || "Unknown role"}</p>
                          <p className="text-xs text-slate-500">{[job.company, job.start_date].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500">No work history available.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Education</p>
                  <div className="mt-3 space-y-3">
                    {displayableEducation.length > 0 ? displayableEducation.map((edu, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{edu.school || "Education"}</p>
                          <p className="text-xs text-slate-500">{[edu.degree, edu.major].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500">No education details available.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeDetailTab === "score" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Scorecard
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {scoreMetrics.map((metric) => (
                  <div key={metric.key} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {typeof metric.score === "number" ? metric.score : "—"} · {formatDimensionLabel(metric.score)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{metric.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Why contact this person</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{whyContactSummary}</p>
              </div>
            </div>
          )}
        </div>

        <div className="hidden">
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Candidate Selling Kit
                  </p>
                  <p className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {linkedInBased
                      ? "LinkedIn-based pitch"
                      : sellingKit?.recommendation === "reach_out_first"
                        ? "Reach out first"
                        : sellingKit?.recommendation === "backup"
                          ? "Backup candidate"
                          : sellingKit?.recommendation === "do_not_pitch"
                            ? "Do not pitch yet"
                            : "LinkedIn-based pitch"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canRegenerateWithPublicEvidence && (
                    <button
                      onClick={() => handleEnrich({ regenerateOutreach: true })}
                      disabled={enriching}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Regenerate with public evidence
                    </button>
                  )}
                  {sellingKit?.outreach_opener && (
                    <button
                      onClick={() => copyText(sellingKit.outreach_opener || "", "opener")}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {copied === "opener" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy opener
                    </button>
                  )}
                  {clientBriefText && (
                    <button
                      onClick={() => copyText(clientBriefText, "brief")}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {copied === "brief" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy brief
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xl font-semibold leading-7 text-slate-950">
                {recruiterHeadline || whyContactSummary}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-[1.05fr,0.95fr]">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Best usable proof
                  </p>
                  {sellingEvidenceItems.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {sellingEvidenceItems.slice(0, 2).map((item, index) => (
                          <li key={`${item.source_url}-${item.evidence_summary}`} className="text-sm leading-6 text-slate-700">
                            {item.source_url ? (
                              <a
                                href={item.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-emerald-700 hover:text-emerald-900"
                              >
                                {citationLabelForItem(item, index)}
                              </a>
                            ) : (
                              <span className="font-semibold text-emerald-700">
                                {citationLabelForItem(item, index)}
                              </span>
                            )}{" "}
                            {item.evidence_summary}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      No public engineering proof is safe enough to lead with yet. Use LinkedIn facts conservatively.
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    Verify before pitching
                  </p>
                  {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || []).length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || []).slice(0, 2).map((risk) => (
                        <li key={risk} className="text-sm leading-6 text-amber-900">
                          {risk}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-amber-900">
                      Confirm current interest, compensation range, and role scope before submitting.
                    </p>
                  )}
                </div>
              </div>
              {sellingKit?.outreach_opener && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Copy-ready opener
                  </p>
                  <p className="mt-2">{sellingKit.outreach_opener}</p>
                </div>
              )}
              {sellingKit?.client_brief && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Client brief preview
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {sellingKit.client_brief.positioning}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(sellingKit.evidence_badges || []).slice(0, 3).map((badge, index) => (
                        badge.citation_label && citationLinks.get(badge.citation_label) ? (
                          <a
                            key={`${badge.label}-${index}`}
                            href={citationLinks.get(badge.citation_label)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                          >
                            {[badge.label, badge.citation_label].filter(Boolean).join(" ")}
                          </a>
                        ) : (
                          <span key={`${badge.label}-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
                            {[badge.label, badge.citation_label].filter(Boolean).join(" ")}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                  {(sellingKit.client_brief.evidence_refs || []).slice(0, 2).map((ref) => {
                    const citation = ref.match(/^\[\d+\]/)?.[0] || null;
                    const href = citation ? citationLinks.get(citation) : null;
                    return href ? (
                      <a
                        key={ref}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block text-xs leading-5 text-emerald-700 hover:text-emerald-900"
                      >
                        {ref}
                      </a>
                    ) : (
                      <p key={ref} className="mt-2 text-xs leading-5 text-slate-600">
                        {ref}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Scorecard
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Overall ranks the shortlist; the three dimensions explain why.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                  {evidenceSourceLabel}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {scoreMetrics.map((metric) => (
                  <div key={metric.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {typeof metric.score === "number" ? metric.score : "—"} · {formatDimensionLabel(metric.score)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{metric.description}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                Verified public evidence can strengthen Technical Evidence and outreach confidence. Missing public evidence does not lower the score.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Why contact this person
              </p>
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                {whyContactSummary}
              </p>
              <ul className="mt-3 space-y-2">
                {localCandidate.match_reasons.map((reason, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Evidence source details
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Selling evidence is separated from identity support so recruiters do not overstate the proof.
                  </p>
                </div>
                <Github className="h-5 w-5 text-slate-400" />
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-slate-800">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  {primaryEvidenceItem
                    ? `${primaryEvidenceItem.citation_label || "[1]"} ${formatPublicEvidenceCategory(primaryEvidenceItem)}`
                    : evidenceSourceLabel}
                </p>
                <p className="mt-2">{proofToReference}</p>
              </div>
              {sellingEvidenceItems.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {sellingEvidenceItems.slice(0, 3).map((item, index) => (
                    <li key={`${item.source_url}-${item.evidence_summary}`} className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                      <span className="mt-0.5 inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700">
                        {citationLabelForItem(item, index)}
                      </span>
                      <span>
                        <span className="mr-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {formatPublicEvidenceCategory(item)}
                        </span>
                        {item.evidence_summary}
                        {formatPublicationLine(item) && (
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {formatPublicationLine(item)}
                          </span>
                        )}
                        {item.source_url && (
                          <a href={item.source_url} target="_blank" rel="noreferrer" className="ml-2 font-medium text-sky-700 hover:text-sky-900">
                            Source
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {identityEvidenceItems.length > 0 && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Identity support only
                  </p>
                  <ul className="mt-2 space-y-1">
                    {identityEvidenceItems.slice(0, 3).map((item, index) => (
                      <li key={`${item.source_url}-${item.evidence_summary}-${index}`} className="text-sm leading-6 text-slate-600">
                        {item.source_url ? (
                          <a href={item.source_url} target="_blank" rel="noreferrer" className="font-semibold text-slate-700 hover:text-slate-950">
                            {citationLabelForItem(item, index)}
                          </a>
                        ) : (
                          <span className="font-semibold text-slate-700">{citationLabelForItem(item, index)}</span>
                        )}{" "}
                        {item.evidence_summary || "Useful for identity corroboration, not for a technical selling claim."}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {publicEvidenceItems.some((item) => item.source_url) && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Sources
                  </p>
                  <ol className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                    {publicEvidenceItems.slice(0, 5).map((item, index) => item.source_url ? (
                      <li key={`${item.source_url}-${index}`} className="flex gap-2">
                        <span className="font-semibold text-slate-800">{citationLabelForItem(item, index)}</span>
                        <a href={item.source_url} target="_blank" rel="noreferrer" className="break-all text-sky-700 hover:text-sky-900">
                          {item.title || item.source_url}
                        </a>
                      </li>
                    ) : null)}
                  </ol>
                </div>
              )}
              {primaryEvidenceItem?.outreach_angle && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Outreach angle
                  </p>
                  <p className="mt-2">{primaryEvidenceItem.outreach_angle}</p>
                </div>
              )}
              {publicEvidenceItems.length === 0 && githubSignals?.evidence_summary && githubSignals.evidence_summary.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {githubSignals.evidence_summary.slice(0, 3).map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-sky-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {publicEvidenceCards.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
              {publicEvidenceItems.length === 0 && (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  {publicEvidence?.status === "queued" || publicEvidence?.status === "running"
                    ? "Public evidence review is pending. Current ranking stays based on LinkedIn evidence until the background check finishes."
                    : "No verified public engineering evidence found yet. Current ranking stays based on LinkedIn evidence only."}
                </p>
              )}
            </div>

            {whyNotHigher.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Why not higher
                </p>
                <ul className="mt-3 space-y-2">
                  {whyNotHigher.map((reason) => (
                    <li key={reason} className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                      <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                LinkedIn resume
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Work history</p>
                  <div className="mt-3 space-y-3">
                    {displayableWorkHistory.length > 0 ? displayableWorkHistory.map((job, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {job.title || "Unknown role"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[job.company, job.start_date].filter(Boolean).join(" · ")}
                          </p>
                          {job.summary && (
                            <ul className="mt-1 space-y-1">
                              {job.summary.split("\uF0D8").map((s) => s.trim()).filter(Boolean).map((segment, si) => (
                                <li key={si} className="text-sm leading-6 text-slate-600">{fixSentenceSpacing(segment)}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500">No work history available.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Education</p>
                  <div className="mt-3 space-y-3">
                    {displayableEducation.length > 0 ? displayableEducation.map((edu, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {edu.school || "Education"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[edu.degree, edu.major].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500">No education details available.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Personalized outreach
              </p>
              <div className="mt-3 grid gap-3">
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Evidence source
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{publicEvidenceSourceLabel}</p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Best opening angle
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {bestOpeningAngle}
                  </p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Overall score
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {overallScore} · {formatDimensionLabel(overallScore)}
                  </p>
                </div>
              </div>
            </div>

            {(verificationChecklist.length > 0 || requiredSkills.length > 0) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                  What to verify before outreach
                </p>
                <ul className="mt-3 space-y-2">
                  {verificationChecklist.map((reason) => (
                    <li key={reason} className="flex items-start gap-2 text-sm leading-6 text-amber-900">
                      <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
                      {reason}
                    </li>
                  ))}
                </ul>
                {requiredSkills.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {requiredSkills.slice(0, 6).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] text-amber-800"
                      >
                        Check {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setDrawerOpen(true)}
          className="absolute bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
        >
          <Send className="h-4 w-4" />
          Generate outreach
        </button>
      </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/20 backdrop-blur-[1px]">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Personalized outreach
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">{localDisplayName}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Leads with verified public engineering evidence when available; falls back to LinkedIn highlights when public evidence is missing.
                </p>
                <p className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                  Current source: {publicEvidenceSourceLabel}
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!localCandidate.outreach_draft ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                <Mail className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-4 text-sm font-medium text-slate-900">
                  Outreach copy is not ready yet
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {billingPlanCode === "free"
                    ? enrichesRemaining > 0
                      ? "Use a contact unlock when you want contact details and personalized outreach."
                      : "Upgrade when you need more contact unlocks and personalized outreach."
                    : "Generate the email and contact details when you're ready to act on this candidate."}
                </p>
                {enrichesRemaining <= 0 && billingPlanCode === "free" ? (
                  <PaddleCheckoutButton
                    checkout={{ type: "plan", planCode: "pro_annual" }}
                    label="Unlock outreach"
                    onClick={() => onUpgradeClick("workbench_outreach_drawer")}
                    onError={(message) => setEnrichError(message)}
                    className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  />
                ) : enrichesRemaining <= 0 ? (
                  <PaddleCheckoutButton
                    checkout={{ type: "add_on", addOn: "contact_pack" }}
                    label="Buy Contact Pack"
                    onClick={() => onUpgradeClick("workbench_contact_pack")}
                    onError={(message) => setEnrichError(message)}
                    className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  />
                ) : (
                  <button
                    onClick={() => handleEnrich()}
                    disabled={enriching}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Generate outreach
                  </button>
                )}
                {enrichError && (
                  <p className="mt-3 text-sm text-red-500">{enrichError}</p>
                )}
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOutreachTab("linkedin")}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      outreachTab === "linkedin"
                        ? "bg-[#0077B5]/10 text-[#0077B5]"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    LinkedIn
                  </button>
                  {hasRealEmail && (
                    <button
                      onClick={() => setOutreachTab("email")}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        outreachTab === "email"
                          ? "bg-slate-950 text-white"
                          : "text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Email
                    </button>
                  )}
                  <button
                    onClick={copyAll}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    {copied === "all" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copied === "all" ? "Copied" : "Copy all"}
                  </button>
                  {canRegenerateWithPublicEvidence && (
                    <button
                      onClick={() => handleEnrich({ regenerateOutreach: true })}
                      disabled={enriching}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Regenerate
                    </button>
                  )}
                </div>

                {outreachTab === "email" && (
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(event) => setEditedSubject(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Message
                  </label>
                  <textarea
                    value={activeBody}
                    onChange={(event) => setActiveBody(event.target.value)}
                    rows={12}
                    className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </div>

                {localCandidate.email && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {localCandidate.email}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
