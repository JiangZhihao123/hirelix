"use client";

import { sanitizeDisplayName } from "@/lib/display-name";
import type { CandidateRow } from "./types";
import {
  deriveCurrentCompany,
  deriveCurrentRole,
  formatEvidenceStrength,
  getCandidateGithubSignals,
  getCandidateOverallScore,
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
  const currentCompany = deriveCurrentCompany(candidate);
  const currentRole = deriveCurrentRole(candidate);
  const displayName = sanitizeDisplayName(candidate.name);

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
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#38bdf8_100%)]"
              style={{ width: `${progressWidth}%` }}
            />
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
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
              {formatEvidenceStrength(githubSignals?.evidence_strength)}
            </span>
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
