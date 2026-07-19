"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Check,
  Copy,
  GraduationCap,
  Loader2,
  Mail,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status";
import { sanitizeDisplayName } from "@/lib/display-name";
import { PUBLIC_CANDIDATE_ENRICH_ERROR_MESSAGE } from "@/lib/public-errors";
import type { CandidateRow, PublicEvidenceItem } from "./types";
import {
  deriveCurrentCompany,
  deriveCurrentRole,
  fixSentenceSpacing,
  formatDeliveryBucketLabel,
  formatDimensionLabel,
  getCandidateDeliveryBucket,
  getCandidateDecisionAudit,
  getCandidateOverallScore,
  getCandidatePublicEvidence,
  getCandidateSellingKit,
  getCandidateScoreMetrics,
  formatRecruiterSellingHeadline,
  hidePublicEvidenceLine,
  parseOutreach,
} from "./utils";
import { ContactActionStrip, InitialsAvatar } from "./ui";

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
      return item.source_type ? item.source_type.replace(/_/g, " ") : "Research source";
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
  queueRank,
  requiredSkills,
  billingPlanCode,
  clientBriefEnabled,
  enrichesRemaining,
  publicEvidenceDeepDivesRemaining,
  publicEvidenceQueueing,
  onPublicEvidenceDeepDive,
  refreshBilling,
  onUpgradeClick,
  onStatusChange,
}: {
  candidate: CandidateRow;
  queueRank: number;
  requiredSkills: string[];
  billingPlanCode: import("@/lib/billing").BillingPlanCode;
  clientBriefEnabled: boolean;
  enrichesRemaining: number;
  publicEvidenceDeepDivesRemaining: number;
  publicEvidenceQueueing: boolean;
  onPublicEvidenceDeepDive: () => void;
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
  const requiresEmailUpgrade = billingPlanCode === "free";
  const requiresPublicEvidenceUpgrade = billingPlanCode === "free";

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
  const rawPublicEvidence = getCandidatePublicEvidence(localCandidate);
  const publicEvidence = requiresPublicEvidenceUpgrade ? null : rawPublicEvidence;
  const sellingKit = getCandidateSellingKit(localCandidate);
  const audit = getCandidateDecisionAudit(localCandidate, undefined, {
    hidePublicEvidence: requiresPublicEvidenceUpgrade,
  });
  const recruiterHeadline = formatRecruiterSellingHeadline(localCandidate, {
    hidePublicEvidence: requiresPublicEvidenceUpgrade,
  });
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
  const moveLikelihoodReasons = Array.from(new Set([
    ...(localCandidate.metadata?.join_likelihood_reasons || []),
    ...(localCandidate.metadata?.scoring_breakdown?.join_likelihood_reasons || []),
    ...(suitability?.scoring_breakdown?.join_likelihood_reasons || []),
  ].filter(Boolean))).slice(0, 3);
  const blockingConstraints =
    localCandidate.metadata?.blocking_constraints ??
    suitability?.blocking_constraints ??
    [];
  const publicEvidenceItems: PublicEvidenceItem[] = publicEvidence?.items || [];
  const sellingEvidenceItems = publicEvidenceItems.filter(isSellingEvidence);
  const identityEvidenceItems = publicEvidenceItems.filter(
    (item) => item.selling_tier === "identity_only" || item.evidence_category === "identity_support",
  );
  const primaryEvidenceItem =
    sellingEvidenceItems[0] ||
    publicEvidenceItems.find((item) => item.selling_tier !== "identity_only" && item.evidence_category !== "identity_support") ||
    publicEvidenceItems[0] ||
    null;
  const baselineEvidenceCards = [
    {
      label: "Evidence status",
      value:
        publicEvidence?.status === "queued" || publicEvidence?.status === "running"
          ? "Research pending"
          : "Not researched yet",
    },
    {
      label: "Current basis",
      value: "Profile fit and risk signals",
    },
    {
      label: "Sources",
      value: "Research candidate to collect sources",
    },
    {
      label: "Identity confidence",
      value: "Not researched yet",
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
      : baselineEvidenceCards;
  const safeShortlistReason = hidePublicEvidenceLine(shortlistReason);
  const safeFirstMatchReason = hidePublicEvidenceLine(localCandidate.match_reasons[0]);
  const whyContactSummary =
    publicEvidence?.summary ||
    safeShortlistReason ||
    safeFirstMatchReason ||
    `${localDisplayName} looks relevant based on profile fit and risk signals.`;
  const proofToReference =
    primaryEvidenceItem?.evidence_summary ||
    safeFirstMatchReason ||
    "No specific proof line is ready yet.";
  const verificationChecklist = riskFlags.slice(0, 5);
  const publicEvidenceSourceLabel = primaryEvidenceItem?.source_type
    ? `${primaryEvidenceItem.citation_label || "[1]"} ${formatPublicEvidenceCategory(primaryEvidenceItem)}`
    : publicEvidence?.status === "queued" || publicEvidence?.status === "running"
      ? "Research pending"
      : "Profile fit";
  const bestOpeningAngle =
    sellingKit?.outreach_opener ||
    primaryEvidenceItem?.outreach_angle ||
    (publicEvidenceItems.length > 0
      ? "Lead with the strongest verified public engineering evidence."
      : "Use the most relevant profile experience in the opening line, or research the candidate before citing outside proof.");

  async function handleEnrich(options: { regenerateOutreach?: boolean } = {}) {
    if (enriching || !user) return;
    if (!options.regenerateOutreach && requiresEmailUpgrade) {
      onUpgradeClick("workbench_email_lookup");
      setEnrichError("Start a subscription to unlock email lookup.");
      return;
    }
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
        throw new Error(PUBLIC_CANDIDATE_ENRICH_ERROR_MESSAGE);
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
      setEnrichError(error instanceof Error ? error.message : PUBLIC_CANDIDATE_ENRICH_ERROR_MESSAGE);
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
  const canCopyClientBrief = clientBriefEnabled && Boolean(clientBriefText);
  const canRegenerateWithPublicEvidence =
    Boolean(localCandidate.outreach_draft && sellingKit?.evidence_basis === "public_evidence");
  const deliveryBucket = getCandidateDeliveryBucket(localCandidate);
  const isRecommendedCandidate = deliveryBucket === "reach_first" || deliveryBucket === "review_next";
  const deliveryBucketLabel = formatDeliveryBucketLabel(localCandidate);
  const deliveryBucketTone =
    deliveryBucket === "reach_first"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : deliveryBucket === "review_next"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  const lowerPriorityReason =
    whyNotHigher[0] ||
    blockingConstraints[0] ||
    riskFlags[0] ||
    safeShortlistReason ||
    "This profile ranked lower after fit, risk, and reachability review.";

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
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${deliveryBucketTone}`}>
                    {deliveryBucketLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    Rank #{queueRank}
                  </span>
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

        {localCandidate.evidence_pack?.final_judgment && (
          <div className="mt-4 grid gap-3 border-y border-slate-200 py-4 md:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Decision</p>
              <p className="mt-1 text-sm font-semibold capitalize text-slate-950">
                {localCandidate.final_decision || "hold"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Evidence</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">
                {localCandidate.evidence_pack.final_judgment.evidence?.[0] || localCandidate.match_reasons[0] || "Evidence pending"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Risk to verify</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">
                {localCandidate.evidence_pack.final_judgment.risks?.[0] || localCandidate.evidence_pack.final_judgment.missingInformation?.[0] || "No material risk recorded"}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 border-b border-slate-200">
          <div className="flex flex-wrap gap-1">
            {[
              ["sell", isRecommendedCandidate ? "Brief" : "Review"],
              ["evidence", "Evidence"],
              ["outreach", "Outreach"],
              ["profile", "Profile"],
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
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      {isRecommendedCandidate ? "Recommendation" : "Pool Review"}
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
                    {clientBriefText && canCopyClientBrief && (
                      <button
                        onClick={() => copyText(clientBriefText, "brief")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        {copied === "brief" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy client brief
                      </button>
                    )}
                    {clientBriefText && !canCopyClientBrief && (
                      <PaddleCheckoutButton
                        checkout={{ type: "plan", planCode: "starter_monthly" }}
                        label="Upgrade to Starter for client brief"
                        onClick={() => onUpgradeClick("workbench_client_brief_button")}
                        onError={(message) => setEnrichError(message)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      />
                    )}
                  </div>
                </div>
                <p className="mt-4 text-xl font-semibold leading-7 text-slate-950">
                  {isRecommendedCandidate ? recruiterHeadline || whyContactSummary : lowerPriorityReason}
                </p>
                {isRecommendedCandidate && sellingKit?.outreach_opener && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Copy-ready opener
                    </p>
                    <p className="mt-2">{sellingKit.outreach_opener}</p>
                  </div>
                )}
                {isRecommendedCandidate && sellingKit?.client_brief && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Client brief preview
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {sellingKit.client_brief.positioning}
                    </p>
                    {!clientBriefEnabled && (
                      <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                        Full client-ready brief export is included on Pro.
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Why this candidate
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {audit.rankingReason}
                  </p>
                </div>
                {isRecommendedCandidate && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Why they may move
                    </p>
                    {moveLikelihoodReasons.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {moveLikelihoodReasons.map((reason) => (
                          <li key={reason} className="text-sm leading-6 text-slate-700">{reason}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        No reliable movement signal appears in the profile. Confirm motivation during first contact.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    Assessment basis
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {audit.trust.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {audit.trust.description}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {isRecommendedCandidate
                      ? sellingEvidenceItems.length > 0 ? "Research evidence" : "Profile evidence"
                      : "Why this is not higher"}
                  </p>
                  {!isRecommendedCandidate ? (
                    <ul className="mt-2 space-y-2">
                      {[lowerPriorityReason, ...whyNotHigher, ...blockingConstraints]
                        .filter(Boolean)
                        .slice(0, 4)
                        .map((reason) => (
                          <li key={reason} className="text-sm leading-6 text-slate-700">
                            {reason}
                          </li>
                        ))}
                    </ul>
                  ) : sellingEvidenceItems.length > 0 ? (
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
                    <ul className="mt-2 space-y-2">
                      {audit.proofLines.slice(0, 3).map((proof) => (
                        <li key={proof} className="text-sm leading-6 text-slate-700">{proof}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    {isRecommendedCandidate ? "Verify before pitching" : "Manual review notes"}
                  </p>
                  {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || verificationChecklist).length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {(sellingKit?.client_brief?.risks_to_verify || sellingKit?.risk_flags || verificationChecklist).slice(0, 4).map((risk) => (
                        <li key={risk} className="text-sm leading-6 text-amber-900">{risk}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-amber-900">
                      {isRecommendedCandidate
                        ? "No material profile-specific risk was identified. Confirm availability during outreach."
                        : "Keep this profile as market coverage unless a recruiter manually promotes it."}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Next action
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                    {audit.nextAction}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeDetailTab === "evidence" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Research sources
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
                    Candidate research has not been run for this candidate yet.
                  </p>
                )}
                {publicEvidenceItems.length === 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="flex-1 text-sm text-slate-600">
                        {requiresPublicEvidenceUpgrade
                          ? "Upgrade to research the candidates you choose."
                          : "Research this candidate when they are worth a closer look."}
                      </p>
                      {requiresPublicEvidenceUpgrade ? (
                        <PaddleCheckoutButton
                          checkout={{ type: "plan", planCode: "starter_monthly" }}
                          label="Upgrade to Starter"
                          onClick={() => onUpgradeClick("workbench_public_evidence_gate")}
                          onError={(message) => setEnrichError(message)}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        />
                      ) : publicEvidenceDeepDivesRemaining <= 0 ? (
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                          Limit reached
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={onPublicEvidenceDeepDive}
                          disabled={publicEvidenceQueueing}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {publicEvidenceQueueing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {publicEvidenceQueueing ? "Queued" : "Research"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeDetailTab === "outreach" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {isRecommendedCandidate ? "Personalized outreach" : "Outreach not prepared by default"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {isRecommendedCandidate
                      ? `Current basis: ${publicEvidenceSourceLabel}`
                      : "Lower-priority profiles stay available for review, but Hirelix does not treat them as ready-to-contact recommendations."}
                  </p>
                </div>
                {isRecommendedCandidate ? (
                  <button
                    onClick={() => setDrawerOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    <Send className="h-4 w-4" />
                    Open outreach editor
                  </button>
                ) : (
                  <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                    Review first
                  </span>
                )}
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
                      {deliveryBucketLabel}
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
                      Regenerate with research
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
                  {clientBriefText && canCopyClientBrief && (
                    <button
                      onClick={() => copyText(clientBriefText, "brief")}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {copied === "brief" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy brief
                    </button>
                  )}
                  {clientBriefText && !canCopyClientBrief && (
                    <PaddleCheckoutButton
                      checkout={{ type: "plan", planCode: "starter_monthly" }}
                      label="Upgrade to Starter for brief"
                      onClick={() => onUpgradeClick("workbench_client_brief_button_compact")}
                      onError={(message) => setEnrichError(message)}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    />
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
                      Candidate research has not been run yet. Use the profile fit notes, or research this candidate before citing outside sources.
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
                  {!clientBriefEnabled && (
                    <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                      Start a subscription when you need the full client-ready brief.
                    </p>
                  )}
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
                      Overall ranks the candidate pool; the three dimensions explain why.
                    </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                  {publicEvidenceSourceLabel}
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
                Candidate research can strengthen technical fit and outreach confidence when you choose to run it.
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
                    Research sources
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Selling evidence is separated from identity support so recruiters do not overstate the proof.
                  </p>
                </div>
                <Sparkles className="h-5 w-5 text-slate-400" />
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-slate-800">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  {primaryEvidenceItem
                    ? `${primaryEvidenceItem.citation_label || "[1]"} ${formatPublicEvidenceCategory(primaryEvidenceItem)}`
                    : publicEvidenceSourceLabel}
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
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-3">
                  <p className="text-sm text-slate-500">
                    {publicEvidence?.status === "queued" || publicEvidence?.status === "running"
                      ? "Candidate research is pending. Current ranking stays based on profile fit and risk signals until the background check finishes."
                      : requiresPublicEvidenceUpgrade
                        ? "Upgrade to research selected candidates. The current ranking is based on profile fit and risk signals."
                        : "Candidate research has not been run yet. Current ranking stays based on profile fit and risk signals."}
                  </p>
                  {publicEvidence?.status !== "queued" && publicEvidence?.status !== "running" && (
                    <div className="mt-3">
                      {requiresPublicEvidenceUpgrade ? (
                        <PaddleCheckoutButton
                          checkout={{ type: "plan", planCode: "starter_monthly" }}
                          label="Upgrade to Starter"
                          onClick={() => onUpgradeClick("workbench_evidence_empty_gate")}
                          onError={(message) => setEnrichError(message)}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        />
                      ) : publicEvidenceDeepDivesRemaining <= 0 ? (
                        <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                          Limit reached
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={onPublicEvidenceDeepDive}
                          disabled={publicEvidenceQueueing}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {publicEvidenceQueueing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {publicEvidenceQueueing ? "Queued" : "Research candidate"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
                    Research basis
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
                  Lead with verified public engineering evidence when available; otherwise use the strongest profile-based fit signal.
                </p>
                <p className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                  Current basis: {publicEvidenceSourceLabel}
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
                    ? "You already have the ranked candidate list. Start a subscription when you are ready to contact candidates."
                    : "Generate the outreach draft and find the email when you're ready to act on this candidate."}
                </p>
                {requiresEmailUpgrade ? (
                  <PaddleCheckoutButton
                    checkout={{ type: "plan", planCode: "starter_monthly" }}
                    label="Upgrade to Starter"
                    onClick={() => onUpgradeClick("workbench_outreach_drawer")}
                    onError={(message) => setEnrichError(message)}
                    className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  />
                ) : enrichesRemaining <= 0 ? (
                  <span className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">
                    Limit reached
                  </span>
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
