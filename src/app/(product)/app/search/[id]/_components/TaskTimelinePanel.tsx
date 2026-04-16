"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { getSearchTaskTimelineItems } from "@/lib/search-task";
import type { SearchRow } from "./types";

export function TaskTimelinePanel({
  search,
}: {
  search: Pick<SearchRow, "status" | "pipeline_step" | "parse_completed_at" | "partial_ready_at"> & {
    standard_recall_completed_at?: string | null;
  };
}) {
  const steps = getSearchTaskTimelineItems(search);
  return (
    <div className="mb-6 rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,#fafdff_0%,#f2f8ff_100%)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
        Task timeline
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
    </div>
  );
}
