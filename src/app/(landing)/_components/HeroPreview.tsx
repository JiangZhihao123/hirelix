"use client";

import { useState } from "react";
import { CheckCircle2, CircleHelp, Mail, Star } from "lucide-react";
import { candidateRows, heroSearchStats, outreachChannels } from "./data";

export function HeroPreview() {
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [selectedOutreachChannelIndex, setSelectedOutreachChannelIndex] = useState(0);
  const [selectedDetailTab, setSelectedDetailTab] = useState<"evidence" | "experience">("evidence");

  const displayedCandidates = candidateRows.slice(0, 2);
  const activeCandidate = displayedCandidates[selectedCandidateIndex] ?? displayedCandidates[0];
  const activeOutreachChannel = outreachChannels[selectedOutreachChannelIndex] ?? outreachChannels[0];
  const activeMatchReasons = activeCandidate.matchReasons.slice(0, 1);
  const activeRiskReason = activeCandidate.riskReasons[0] ?? "Needs closer review before outreach.";
  const activeExperiencePreview = activeCandidate.recentExperience.slice(0, 2);
  const activeContactLabel = selectedOutreachChannelIndex === 0 ? "LinkedIn" : "Email";
  const activeContactValue =
    selectedOutreachChannelIndex === 0
      ? activeCandidate.linkedinUrl
      : activeCandidate.email;
  const activeActionHref =
    selectedOutreachChannelIndex === 0
      ? activeCandidate.linkedinUrl
      : `mailto:${activeCandidate.email}?subject=${encodeURIComponent(
          activeCandidate.emailSubject,
        )}&body=${encodeURIComponent(activeCandidate.emailDraft)}`;
  const activeActionTarget = selectedOutreachChannelIndex === 0 ? "_blank" : undefined;
  const activeActionRel = selectedOutreachChannelIndex === 0 ? "noreferrer noopener" : undefined;

  return (
    <div className="hidden lg:block lg:pt-3">
      <div className="ml-auto w-full max-w-[42.5rem] rounded-[28px] border border-white/[0.2] bg-[linear-gradient(180deg,rgba(242,248,255,0.22)_0%,rgba(186,225,255,0.12)_100%)] p-1.5 shadow-[0_22px_60px_rgba(8,25,51,0.28)] xl:max-w-[45rem]">
        <div className="rounded-[24px] bg-[radial-gradient(circle_at_top_right,_rgba(125,211,252,0.24),_transparent_28%),linear-gradient(180deg,_rgba(13,25,43,0.92)_0%,_rgba(18,30,48,0.9)_100%)] p-4">
          <div className="mb-2.5 flex items-center justify-between gap-3 text-sm text-slate-300">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500/60" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
              <span className="h-3 w-3 rounded-full bg-green-500/60" />
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-300/18 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                25 candidates found
              </span>
              <span className="rounded-full border border-sky-300/16 bg-sky-400/10 px-2.5 py-1 text-[10px] font-medium text-sky-100">
                AI ranked from large-scale search
              </span>
            </div>
          </div>

          <div className="rounded-[20px] border border-sky-200/40 bg-[radial-gradient(circle_at_top_right,_rgba(186,230,253,0.38),_transparent_32%),linear-gradient(90deg,_rgba(46,104,179,0.86)_0%,_rgba(27,59,103,0.72)_100%)] p-3.5 shadow-[0_18px_42px_rgba(32,100,175,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sky-100/80">
                  JD {"->"} ranked shortlist {"->"} outreach drafts ready
                </p>
                <span className="mt-1 block text-base font-semibold text-white">Senior Software Engineer</span>
              </div>
              <span className="rounded-full border border-emerald-300/18 bg-emerald-400/14 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                25 candidates found
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-100/88">
              Skills extracted: APIs, distributed systems, cloud infrastructure, product collaboration
            </p>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              {heroSearchStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/[0.12] bg-white/[0.08] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-sky-100/70">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2.5 space-y-1.5">
            {displayedCandidates.map((candidate, index) => (
              <button
                key={candidate.name}
                type="button"
                onClick={() => setSelectedCandidateIndex(index)}
                className={`w-full rounded-2xl border bg-gradient-to-r p-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all ${
                  index === selectedCandidateIndex
                    ? "border-sky-300/32 from-sky-400/[0.18] to-white/[0.08] ring-1 ring-sky-300/18"
                    : "border-white/[0.12] from-white/[0.12] to-white/[0.06] hover:border-sky-300/18"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500 text-[10px] font-bold text-white">
                    {candidate.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{candidate.name}</p>
                    <p className="truncate text-xs text-slate-300">{candidate.role}</p>
                    <p className="truncate text-[11px] text-slate-400">{candidate.location}</p>
                  </div>
                  <div className="rounded-full bg-sky-400/12 px-2.5 py-1 text-xs font-bold text-sky-200">
                    {candidate.score}% match
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {candidate.matched.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-sky-400/12 px-2 py-0.5 text-[10px] font-medium text-sky-200"
                    >
                      {skill}
                    </span>
                  ))}
                  <span className="rounded-md border border-white/[0.12] px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    {candidate.fitLabel}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.1] to-white/[0.05] p-3">
            <div className="grid gap-2.5 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                      <Star className="h-3.5 w-3.5 text-sky-300" />
                      Selected candidate
                    </div>
                    <p className="mt-1.5 text-base font-semibold text-white">{activeCandidate.fitLabel}</p>
                    <p className="mt-1 text-xs text-slate-300">{activeCandidate.location} · {activeCandidate.role}</p>
                  </div>
                  <span className="rounded-full border border-emerald-300/18 bg-emerald-400/12 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                    {activeCandidate.actionLabel}
                  </span>
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {activeCandidate.constraintChecks.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-2"
                    >
                      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-100">{item.verdict}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  {[
                    { key: "evidence", label: "Fit evidence" },
                    { key: "experience", label: "Experience" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedDetailTab(tab.key as "evidence" | "experience")}
                      className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                        selectedDetailTab === tab.key
                          ? "border-sky-300/28 bg-sky-400/14 text-sky-100"
                          : "border-white/[0.12] bg-white/[0.04] text-slate-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#101b2d] p-2.5 text-xs leading-relaxed text-slate-200">
                  {selectedDetailTab === "evidence" ? (
                    <div className="space-y-1.5">
                      {activeMatchReasons.map((reason) => (
                        <div key={reason} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                          <span className="line-clamp-2">{reason}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activeExperiencePreview.map((item) => (
                        <div
                          key={item}
                          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-300/18 bg-emerald-400/[0.08] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                    <Mail className="h-3.5 w-3.5 text-emerald-200" />
                    Outreach ready
                  </div>
                  <span className="rounded-full border border-emerald-200/18 bg-emerald-300/12 px-2.5 py-1 text-[10px] font-medium text-emerald-100">
                    Draft included
                  </span>
                </div>
                <div className="mt-2.5 flex gap-2">
                  {outreachChannels.map((channel, index) => (
                    <button
                      key={channel.label}
                      type="button"
                      onClick={() => setSelectedOutreachChannelIndex(index)}
                      className={`min-w-0 flex-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                        index === selectedOutreachChannelIndex
                          ? "border-emerald-200/28 bg-emerald-300/14 text-emerald-50"
                          : "border-white/[0.12] bg-white/[0.06] text-slate-200"
                      }`}
                    >
                      {channel.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-lg border border-white/[0.08] bg-[#101b2d] px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                    Ready-to-send preview
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-slate-200">
                    {selectedOutreachChannelIndex === 0
                      ? activeCandidate.linkedinDraft
                      : activeCandidate.emailDraft}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2">
                  <span className="text-[11px] leading-5 text-slate-300">{activeContactLabel}</span>
                  <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium leading-5 text-emerald-100">
                    {activeContactValue}
                  </span>
                </div>
                <a
                  href={activeActionHref}
                  target={activeActionTarget}
                  rel={activeActionRel}
                  className={`mt-2 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${
                    selectedOutreachChannelIndex === 0
                      ? "bg-[#0077b5] text-white hover:bg-[#0a66a2]"
                      : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  }`}
                >
                  {activeOutreachChannel.cta}
                </a>
              </div>

              <div className="mt-2.5 rounded-xl border border-amber-300/16 bg-amber-400/[0.08] px-3 py-2.5 lg:col-span-2">
                <div className="flex items-start gap-2 text-xs text-amber-100">
                  <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                  <span>
                    <span className="font-semibold text-amber-200">Main risk:</span> {activeRiskReason}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
