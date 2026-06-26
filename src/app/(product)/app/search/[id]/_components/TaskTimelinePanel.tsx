"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { getSearchTaskTimelineItems } from "@/lib/search-task";
import type { SearchRow } from "./types";

type TimelineMetrics = {
  recalledCount?: number | null;
  reviewedCount?: number | null;
  visibleCandidateCount?: number | null;
  recallStrategyMode?: "legacy" | "headhunter_v1" | null;
};

export function TaskTimelinePanel({
  search,
  metrics,
}: {
  search: Pick<SearchRow, "status" | "pipeline_step" | "parse_completed_at" | "partial_ready_at"> & {
    standard_recall_completed_at?: string | null;
  };
  metrics?: TimelineMetrics;
}) {
  const headhunterMode = metrics?.recallStrategyMode === "headhunter_v1";
  const headhunterLabels = [
    "Reading role",
    "Testing first sourcing lane",
    "Calibrating market fit",
    "Expanding best lane",
    "Reviewing candidates",
  ] as const;
  const steps = getSearchTaskTimelineItems(search).map((step, index) => ({
    ...step,
    label: headhunterMode ? headhunterLabels[index] ?? step.label : step.label,
  }));
  const detailForStep = (label: string) => {
    if (label === "Reading role") return "Building the headhunter brief";
    if (label === "Testing first sourcing lane") return "Running the first small sourcing probe";
    if (label === "Calibrating market fit") {
      return search.standard_recall_completed_at
        ? `${metrics?.recalledCount ?? "LinkedIn"} profiles recalled for lane review`
        : "Waiting for the first probe to return";
    }
    if (label === "Expanding best lane") return "Continuing only lanes that stay on target";
    if (label === "Reviewing candidates") {
      return metrics?.reviewedCount
        ? `${metrics.reviewedCount} profiles judged against the role`
        : "Judging complete profiles against the JD";
    }
    if (label === "Accepted") return "Search created and queued";
    if (label === "Brief ready") {
      return search.parse_completed_at ? "Role brief parsed" : "Parsing JD into search criteria";
    }
    if (label === "Scanning LinkedIn") {
      return search.standard_recall_completed_at
        ? `${metrics?.recalledCount ?? "LinkedIn"} profiles recalled`
        : "Waiting on LinkedIn profile data";
    }
    if (label === "Reviewing candidates") {
      return metrics?.reviewedCount
        ? `${metrics.reviewedCount} profiles scored`
        : "Checking fit, risk, and actionability";
    }
    if (label === "Shortlist ready") {
      const visible = metrics?.visibleCandidateCount ?? 0;
      return visible > 0
        ? `${visible} candidates ready to review`
        : "Candidate pool appears here when ready";
    }
    return null;
  };

  return (
    <div className="mb-6 rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,#fafdff_0%,#f2f8ff_100%)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
        Live progress
      </p>
      <div className="mt-4 space-y-3">
        {steps.map((step, i) => {
          const isDone = step.state === "done";
          const isActive = step.state === "active";
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
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm ${
                    isDone ? "text-green-700 font-medium" : isActive ? "text-foreground font-medium" : "text-muted-light"
                  }`}>
                    {step.label}
                    {isDone && " ✓"}
                  </span>
                  {isActive && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-700">
                      Now
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {detailForStep(step.label)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
