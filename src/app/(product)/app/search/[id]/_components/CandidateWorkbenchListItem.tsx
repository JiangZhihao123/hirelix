"use client";

import { sanitizeDisplayName } from "@/lib/display-name";
import type { CandidateRow } from "./types";
import {
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import {
  deriveCurrentCompany,
  deriveCurrentRole,
  formatDeliveryBucketLabel,
  getCandidateDeliveryBucket,
  getCandidateDecisionAudit,
  formatRecruiterSellingHeadline,
} from "./utils";
import { InitialsAvatar } from "./ui";

export function CandidateWorkbenchListItem({
  candidate,
  queueRank,
  selected,
  onSelect,
  billingPlanCode,
  isNew,
}: {
  candidate: CandidateRow;
  queueRank: number;
  selected: boolean;
  onSelect: () => void;
  billingPlanCode: import("@/lib/billing").BillingPlanCode;
  isNew?: boolean;
}) {
  const hidePublicEvidence = billingPlanCode === "free";
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
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
              #{queueRank}
            </span>
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
            {[currentRole, currentCompany].filter(Boolean).join(" · ")}
          </p>
          {recruiterHeadline && (
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-900">
              {recruiterHeadline}
            </p>
          )}
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
              <p className="line-clamp-2 text-[11px] leading-5 text-slate-600">
                {audit.proofLines[0]}
              </p>
            </div>
            {audit.riskLines.length > 0 && (
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="line-clamp-2 text-[11px] leading-5 text-amber-800">
                  {audit.riskLines[0]}
                </p>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {candidate.location && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                {candidate.location}
              </span>
            )}
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
