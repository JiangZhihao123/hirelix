"use client";

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
