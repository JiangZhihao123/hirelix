import { CheckCircle2, MailCheck, Search } from "lucide-react";
import { candidateRows } from "./data";

const decisionLabels = ["Reach out first", "Worth reviewing", "Risk to verify"];

export function HeroCandidateProof() {
  const leadCandidate = candidateRows[0];

  return (
    <div
      data-testid="hero-product-proof"
      className="h-[18rem] overflow-hidden rounded-lg border border-white/70 bg-white/75 shadow-[0_28px_80px_rgba(15,23,42,0.2)] backdrop-blur-md sm:h-[19rem] lg:h-[15rem]"
    >
      <div className="flex h-12 items-center justify-between gap-4 border-b border-white/70 bg-white/65 px-4 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-950 sm:text-sm">
            Senior Software Engineer
          </p>
          <p className="hidden text-[11px] text-slate-500 sm:block">Ranked candidate pool</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Research complete
        </div>
      </div>

      <div className="grid h-[calc(100%-3rem)] lg:grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.28fr)]">
        <div className="hidden border-r border-white/60 bg-slate-100/45 lg:block">
          <div className="flex h-8 items-center justify-between border-b border-white/60 px-4 text-[10px] font-semibold uppercase text-slate-500">
            <span>Recommended order</span>
            <span>{candidateRows.length} profiles</span>
          </div>
          {candidateRows.slice(0, 2).map((candidate, index) => (
            <div
              key={candidate.name}
              className={`border-b border-white/60 px-4 py-1.5 ${
                index === 0 ? "bg-white/75 shadow-[inset_3px_0_0_#4f46e5]" : "bg-slate-100/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-950">{candidate.name}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{candidate.role}</p>
                </div>
                <span className="shrink-0 text-xs font-bold text-slate-950">{candidate.score}</span>
              </div>
              <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                {decisionLabels[index]}
              </p>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-1.5 text-[11px] text-slate-500">
            <span className="font-medium text-slate-700">{candidateRows[2].name}</span>
            <span>{candidateRows[2].score} - Risk to verify</span>
          </div>
        </div>

        <div className="min-w-0 bg-white/60 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-950 text-[11px] font-bold text-white">
                  1
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{leadCandidate.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{leadCandidate.role}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xl font-bold text-slate-950">{leadCandidate.score}</p>
              <p className="text-[10px] font-semibold uppercase text-emerald-700">Strong fit</p>
            </div>
          </div>

          <div className="mt-2.5 border-t border-slate-200 pt-2.5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
              <Search className="h-3.5 w-3.5 text-indigo-600" />
              Why this profile
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-700 sm:text-[13px]">
              {leadCandidate.matchReasons[0]}
            </p>
          </div>

          <div className="mt-2 border-t border-slate-200 pt-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
                <MailCheck className="h-3.5 w-3.5 text-indigo-600" />
                Outreach draft
              </div>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-600 sm:hidden">
              Personalized draft ready to review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
