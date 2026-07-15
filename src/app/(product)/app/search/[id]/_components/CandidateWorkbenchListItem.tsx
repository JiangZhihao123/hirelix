"use client";

import { sanitizeDisplayName } from "@/lib/display-name";
import type { CandidateRow } from "./types";
import {
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  deriveCurrentCompany,
  deriveCurrentRole,
  formatDeliveryBucketLabel,
  getCandidateDeliveryBucket,
  getCandidateDecisionAudit,
  getCandidateOverallScore,
  getCandidateSellingKit,
  getCandidateScoreMetrics,
  formatRecruiterSellingHeadline,
} from "./utils";
import { InitialsAvatar, ScoreBadge } from "./ui";

export function CandidateWorkbenchListItem({
  candidate,
  selected,
  onSelect,
  billingPlanCode,
  isNew,
}: {
  candidate: CandidateRow;
  selected: boolean;
  onSelect: () => void;
  billingPlanCode: import("@/lib/billing").BillingPlanCode;
  isNew?: boolean;
}) {
  const hidePublicEvidence = billingPlanCode === "free";
  const overallScore = getCandidateOverallScore(candidate);
  const deepDiveBadge = hidePublicEvidence
    ? { text: "Profile fit reviewed", className: "bg-blue-50 text-blue-700" }
    : { text: "Research available", className: "bg-slate-100 text-slate-700" };
  const scoreMetrics = getCandidateScoreMetrics(candidate).filter((metric) => metric.key !== "overall");
  const sellingKit = getCandidateSellingKit(candidate);
  const currentCompany = deriveCurrentCompany(candidate);
  const currentRole = deriveCurrentRole(candidate);
  const displayName = sanitizeDisplayName(candidate.name);
  const recruiterHeadline = formatRecruiterSellingHeadline(candidate, {
    hidePublicEvidence,
  });
  const audit = getCandidateDecisionAudit(candidate, undefined, {
    hidePublicEvidence,
  });
  const deliveryBucket = getCandidateDeliveryBucket(candidate);
  const recommendationLabel = formatDeliveryBucketLabel(candidate);
  const recommendationClass =
    deliveryBucket === "reach_first"
      ? "bg-emerald-50 text-emerald-700"
      : deliveryBucket === "review_next"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? "border-sky-300 bg-sky-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <InitialsAvatar name={displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-950">{displayName}</p>
            {typeof candidate.final_rank === "number" ? (
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                #{candidate.final_rank}
              </span>
            ) : (
              <ScoreBadge score={overallScore} />
            )}
            {recommendationLabel && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${recommendationClass}`}>
                {recommendationLabel}
              </span>
            )}
            {isNew && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                New
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
            {currentRole}
          </p>
          {currentCompany && (
            <p className="mt-1 text-xs text-slate-500">
              {currentCompany}
            </p>
          )}
          {recruiterHeadline && (
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-900">
              {recruiterHeadline}
            </p>
          )}
          <div className="mt-3 space-y-1.5">
            <div className="flex gap-2 rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
              <p className="line-clamp-2 text-[11px] leading-5 text-sky-800">
                {audit.proofLines.slice(0, 2).join(" · ")}
              </p>
            </div>
            <div className="flex gap-2 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="line-clamp-2 text-[11px] leading-5 text-amber-800">
                {audit.riskLines.slice(0, 1).join(" · ")}
              </p>
            </div>
            <div className="flex gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <p className="line-clamp-2 text-[11px] leading-5 text-emerald-800">
                {audit.nextAction}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {scoreMetrics.map((metric) => (
              <span
                key={metric.key}
                title={metric.description}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600"
              >
                {metric.shortLabel} {typeof metric.score === "number" ? metric.score : "—"}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {candidate.location && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                {candidate.location}
              </span>
            )}
            <span className={`rounded-full px-2.5 py-1 text-[11px] ${deepDiveBadge.className}`}>
              {deepDiveBadge.text}
            </span>
            {!hidePublicEvidence && (sellingKit?.evidence_badges || []).slice(0, 3).map((badge, index) => (
              <span
                key={`${badge.label}-${badge.citation_label}-${index}`}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  badge.tier === "strong"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : badge.tier === "medium"
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {[badge.label, badge.citation_label].filter(Boolean).join(" ")}
              </span>
            ))}
            {(hidePublicEvidence || !sellingKit?.evidence_badges || sellingKit.evidence_badges.length === 0) && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                Profile fit reviewed
              </span>
            )}
            {(sellingKit?.risk_flags || []).slice(0, 1).map((risk) => (
              <span key={risk} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
                {risk}
              </span>
            ))}
            {candidate.email && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                Contact ready
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
