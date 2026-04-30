"use client";

import { Lock } from "lucide-react";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  getDisplayNameColorSeed,
  getDisplayNameInitials,
  sanitizeDisplayName,
} from "@/lib/display-name";
import type { CandidateRow } from "./types";

const avatarColors = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
];

export function InitialsAvatar({ name }: { name: string }) {
  const displayName = sanitizeDisplayName(name);
  const initials = getDisplayNameInitials(displayName);
  const colorIdx = getDisplayNameColorSeed(displayName) % avatarColors.length;
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarColors[colorIdx]} text-white text-sm font-bold`}>
      {initials}
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
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
      {score}% overall
    </span>
  );
}

export function ActionabilityBadge({ candidate }: { candidate: CandidateRow }) {
  const actionability = candidate.metadata?.suitability?.actionability;
  const fitDecision = candidate.metadata?.suitability?.fit_decision;
  const advanceRecommendation = candidate.metadata?.advance_recommendation ||
    candidate.metadata?.suitability?.advance_recommendation;
  const blockingSeverity = candidate.metadata?.blocking_severity ||
    candidate.metadata?.suitability?.blocking_severity;

  if (advanceRecommendation === "reject" && blockingSeverity === "hard") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        Hard blocker
      </span>
    );
  }

  if (blockingSeverity === "soft" || advanceRecommendation === "hold") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        Needs review
      </span>
    );
  }

  if (fitDecision === "risky_fit" || actionability === "not_actionable") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        Constraint risk
      </span>
    );
  }

  if (actionability === "needs_review" || fitDecision === "viable_fit") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
        Needs review
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      Ready to act
    </span>
  );
}

export function ContactActionStrip({
  billingPlanCode,
  hasRealEmail,
  enrichesRemaining,
  enriching,
  onEnrich,
  onUpgradeClick,
  onError,
  compact = false,
}: {
  billingPlanCode: import("@/lib/billing").BillingPlanCode;
  hasRealEmail: boolean;
  enrichesRemaining: number;
  enriching: boolean;
  onEnrich: () => void;
  onUpgradeClick: (surface: string) => void;
  onError: (message: string) => void;
  compact?: boolean;
}) {
  if (hasRealEmail) return null;

  const wrapperClass = compact
    ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
    : "rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,#fffdf7_0%,#fff7df_100%)] px-4 py-4";
  const textClass = compact ? "text-xs" : "text-sm";
  const hintClass = compact ? "mt-1 text-[11px]" : "mt-1 text-xs";

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-amber-800">
            <Lock className="h-3.5 w-3.5" />
            <p className={`${textClass} font-semibold`}>
              Get email
            </p>
          </div>
          <p className={`${hintClass} text-amber-700`}>
            {enrichesRemaining > 0
              ? "Find contact details when you're ready to reach out."
              : billingPlanCode === "free"
                ? "Upgrade for more contact unlocks and outreach drafts."
                : "Buy a contact pack to continue email lookups."}
          </p>
        </div>

        {enrichesRemaining <= 0 && billingPlanCode === "free" ? (
          <PaddleCheckoutButton
            checkout={{ type: "plan", planCode: "pro_monthly" }}
            label="Get email"
            onClick={() => onUpgradeClick(compact ? "candidate_email_strip_compact" : "candidate_email_strip")}
            onError={onError}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
          />
        ) : enrichesRemaining <= 0 ? (
          <PaddleCheckoutButton
            checkout={{ type: "add_on", addOn: "contact_pack" }}
            label="Buy Contact Pack"
            onClick={() => onUpgradeClick(compact ? "candidate_contact_pack_compact" : "candidate_contact_pack")}
            onError={onError}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          />
        ) : (
          <button
            onClick={onEnrich}
            disabled={enriching}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enriching ? "Finding..." : "Get email"}
          </button>
        )}
      </div>
    </div>
  );
}
