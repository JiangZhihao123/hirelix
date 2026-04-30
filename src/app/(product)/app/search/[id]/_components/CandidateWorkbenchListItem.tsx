"use client";

import { sanitizeDisplayName } from "@/lib/display-name";
import type { CandidateRow } from "./types";
import {
  deriveCurrentCompany,
  deriveCurrentRole,
  formatEvidenceStrength,
  getCandidateGithubSignals,
  getCandidateOverallScore,
  getCandidateSellingKit,
  getCandidateScoreMetrics,
  getGithubBadge,
} from "./utils";
import { InitialsAvatar, ScoreBadge } from "./ui";

export function CandidateWorkbenchListItem({
  candidate,
  selected,
  onSelect,
  isNew,
}: {
  candidate: CandidateRow;
  selected: boolean;
  onSelect: () => void;
  isNew?: boolean;
}) {
  const overallScore = getCandidateOverallScore(candidate);
  const progressWidth = Math.max(6, Math.min(100, overallScore));
  const githubSignals = getCandidateGithubSignals(candidate);
  const githubBadge = getGithubBadge(githubSignals);
  const scoreMetrics = getCandidateScoreMetrics(candidate).filter((metric) => metric.key !== "overall");
  const sellingKit = getCandidateSellingKit(candidate);
  const currentCompany = deriveCurrentCompany(candidate);
  const currentRole = deriveCurrentRole(candidate);
  const displayName = sanitizeDisplayName(candidate.name);
  const recommendationLabel =
    sellingKit?.recommendation === "reach_out_first"
      ? "Reach out first"
      : sellingKit?.recommendation === "backup"
        ? "Backup"
        : sellingKit?.recommendation === "do_not_pitch"
          ? "Do not pitch"
          : null;
  const recommendationClass =
    sellingKit?.recommendation === "reach_out_first"
      ? "bg-emerald-50 text-emerald-700"
      : sellingKit?.recommendation === "backup"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition ${
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
            <ScoreBadge score={overallScore} />
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
          {sellingKit?.one_line_pitch && (
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-slate-800">
              {sellingKit.one_line_pitch}
            </p>
          )}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#38bdf8_100%)]"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {scoreMetrics.map((metric) => (
              <span
                key={metric.key}
                title={metric.description}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600"
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
            <span className={`rounded-full px-2.5 py-1 text-[11px] ${githubBadge.className}`}>
              {githubBadge.text}
            </span>
            {(sellingKit?.evidence_badges || []).slice(0, 3).map((badge, index) => (
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
            {(!sellingKit?.evidence_badges || sellingKit.evidence_badges.length === 0) && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                {formatEvidenceStrength(githubSignals?.evidence_strength)}
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
