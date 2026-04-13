"use client";

import { CheckCircle2, CircleDotDashed, Search } from "lucide-react";

interface LinkedInScanAnimationProps {
  stage: "linkedin_scan" | "reviewing_profiles";
  roleTitle?: string;
  startedAt?: string | null;
  briefReadyAt?: string | null;
  recallCompletedAt?: string | null;
  recallProfileCount?: number | null;
  candidateCount?: number | null;
  elapsedLabel?: string | null;
  canLeavePage?: boolean;
}

type StepState = "done" | "active" | "upcoming";

type StepConfig = {
  label: string;
  detail: string;
  state: StepState;
};

function StepIndicator({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/12 text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (state === "active") {
    return (
      <span className="relative mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-400/40 bg-sky-400/10 text-sky-300">
        <span className="absolute inset-0 rounded-full bg-sky-400/12 animate-ping" />
        <CircleDotDashed className="relative h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70">
      <span className="h-2 w-2 rounded-full bg-slate-600" />
    </span>
  );
}

function StepRow({ step, isLast }: { step: StepConfig; isLast: boolean }) {
  const titleClassName =
    step.state === "done"
      ? "text-slate-100"
      : step.state === "active"
        ? "text-sky-100"
        : "text-slate-400";
  const detailClassName =
    step.state === "active" ? "text-sky-200/80" : "text-slate-500";

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <div className="absolute left-[11px] top-7 h-[calc(100%-1rem)] w-px bg-slate-800" />
      )}
      <StepIndicator state={step.state} />
      <div className="min-w-0 pb-4">
        <p className={`text-sm font-medium ${titleClassName}`}>{step.label}</p>
        <p className={`mt-1 text-xs leading-5 ${detailClassName}`}>{step.detail}</p>
      </div>
    </div>
  );
}

export function LinkedInScanAnimation({
  stage,
  roleTitle,
  startedAt,
  briefReadyAt,
  recallCompletedAt,
  recallProfileCount,
  candidateCount,
  elapsedLabel,
  canLeavePage = true,
}: LinkedInScanAnimationProps) {
  const isReviewing = stage === "reviewing_profiles";
  const safeCandidateCount =
    typeof candidateCount === "number" && Number.isFinite(candidateCount) ? candidateCount : 0;
  const safeRecallProfileCount =
    typeof recallProfileCount === "number" && Number.isFinite(recallProfileCount)
      ? recallProfileCount
      : null;

  const title = isReviewing ? "Reviewing top matches" : "Scanning LinkedIn";
  const description = isReviewing
    ? safeRecallProfileCount && safeRecallProfileCount > 0
      ? `LinkedIn recall completed. Reviewing ${safeRecallProfileCount.toLocaleString()} profiles against your brief.`
      : "LinkedIn recall completed. Reviewing the strongest matches now."
    : "We've finished parsing the role and are recalling relevant profiles now.";

  const steps: StepConfig[] = [
    {
      label: "Brief parsed",
      detail: briefReadyAt
        ? "Role requirements are locked and the search brief is ready."
        : "Turning the JD into a structured search brief.",
      state: briefReadyAt ? "done" : "active",
    },
    {
      label: "LinkedIn profiles recalled",
      detail: recallCompletedAt
        ? safeRecallProfileCount && safeRecallProfileCount > 0
          ? `${safeRecallProfileCount.toLocaleString()} relevant profiles were pulled into review.`
          : "Relevant LinkedIn profiles were pulled into review."
        : "Recalling relevant LinkedIn profiles for this role.",
      state: recallCompletedAt ? "done" : stage === "linkedin_scan" ? "active" : "upcoming",
    },
    {
      label: "Top candidates under review",
      detail:
        safeCandidateCount > 0
          ? `${safeCandidateCount.toLocaleString()} candidates are already in the review pool.`
          : isReviewing
            ? "Ranking the strongest matches before the shortlist is published."
            : "Candidate review starts as soon as recall is complete.",
      state:
        safeCandidateCount > 0
          ? "done"
          : isReviewing
            ? "active"
            : "upcoming",
    },
  ];

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-sky-950/70 bg-[#0d1b2e] shadow-[0_10px_30px_rgba(2,12,27,0.28)]">
      <div className="border-b border-slate-800/80 bg-[linear-gradient(135deg,rgba(14,165,233,0.10),rgba(13,27,46,0)_58%)] px-5 py-4">
        <div className="flex items-center gap-2">
          {isReviewing ? (
            <CheckCircle2 className="h-4 w-4 text-sky-300" />
          ) : (
            <Search className="h-4 w-4 text-sky-400" />
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-400/90">
            {title}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <h3 className="text-2xl font-semibold text-white sm:text-[1.75rem]">
            {title}
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            {description}
          </p>
          {safeCandidateCount > 0 && (
            <p className="text-sm font-medium text-sky-100">
              {safeCandidateCount.toLocaleString()} candidates are already taking shape.
            </p>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="space-y-1">
          {steps.map((step, index) => (
            <StepRow
              key={step.label}
              step={step}
              isLast={index === steps.length - 1}
            />
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
          {elapsedLabel && (
            <span
              className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1"
              title={startedAt ?? undefined}
            >
              Started {elapsedLabel} ago
            </span>
          )}
          {roleTitle && (
            <span className="max-w-full truncate rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1">
              Role: {roleTitle}
            </span>
          )}
          {canLeavePage && (
            <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1">
              You can leave this page. We&apos;ll email you when the shortlist is ready.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
