"use client";

import { useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  Linkedin,
  MailCheck,
} from "lucide-react";
import { candidateRows } from "./data";

const processSteps = ["JD parsed", "Candidates ranked", "Ready to review"];
const candidateAvatars = [
  "/landing/avatar-james.png",
  "/landing/avatar-anika.png",
  "/landing/avatar-marco.png",
];

export function HeroPreview({ onSignInClick }: { onSignInClick: () => void }) {
  const displayedCandidates = candidateRows.slice(0, 3);
  const [expanded, setExpanded] = useState(false);
  const compactCandidates = displayedCandidates.slice(0, 2);

  return (
    <div className="w-full">
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-2 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {processSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    index < 2
                      ? "bg-blue-600 text-white"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  {index < 2 ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="text-xs font-semibold text-blue-700">
                  {step}
                </span>
                {index < processSteps.length - 1 ? <span className="text-slate-300">-&gt;</span> : null}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
              Sample output
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1.2fr]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                <BriefcaseBusiness className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">Parsed client role</p>
                <p className="truncate text-sm font-semibold text-slate-950">Senior Backend Engineer</p>
                <p className="text-xs text-slate-500">Remote US · SaaS platform · 5+ years</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Must-have signals</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Backend APIs", "PostgreSQL", "AWS", "Product pace", "Startup-ready"].map((signal) => (
                  <span key={signal} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-950">Evidence-backed shortlist</h2>
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  Start here
                </span>
              </div>
              <span className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 sm:inline-flex">
                <MailCheck className="h-3.5 w-3.5 text-blue-600" />
                Outreach draft after review
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {displayedCandidates.map((candidate, index) => (
                <div
                  key={candidate.name}
                  className={`grid gap-3 px-3 py-3 md:grid md:grid-cols-[minmax(13rem,1.05fr)_4.5rem_minmax(0,1.25fr)] md:items-center ${
                    index >= compactCandidates.length && !expanded ? "hidden md:grid" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <Image
                      src={candidateAvatars[index] ?? candidateAvatars[0]}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover shadow-sm"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-slate-950">{candidate.name}</p>
                        <Linkedin className="h-3.5 w-3.5 shrink-0 text-[#0a66c2]" />
                      </div>
                      <p className="truncate text-xs text-slate-600">{candidate.role}</p>
                      <p className="truncate text-[11px] text-slate-500">{candidate.location}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-lg font-bold text-emerald-600">{candidate.score}%</p>
                    <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${candidate.score}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[11px] leading-5 text-slate-600">
                    <div className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="line-clamp-2 md:line-clamp-1">{candidate.matchReasons[0]}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-amber-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-1">{candidate.riskReasons[0]}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <a href="#what-you-get" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900">
                See what the shortlist includes <span>-&gt;</span>
              </a>
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="self-start text-xs font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline sm:hidden"
              >
                {expanded ? "Show compact preview" : "Show one more candidate"}
              </button>
              <button
                type="button"
                onClick={onSignInClick}
                className="hidden text-xs font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline sm:inline-flex"
              >
                Sign in to run a real role
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
