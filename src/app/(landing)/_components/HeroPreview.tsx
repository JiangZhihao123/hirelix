"use client";

import { useState } from "react";
import Image from "next/image";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Github,
  Linkedin,
  Mail,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { candidateRows } from "./data";

const processSteps = ["JD parsed", "Search", "Rank", "Outreach"];
const candidateAvatars = [
  "/landing/avatar-james.png",
  "/landing/avatar-anika.png",
  "/landing/avatar-marco.png",
];

const outreachDrafts = {
  inmail: {
    cta: "Send InMail",
    body: [
      "Hi James,",
      "Your platform work at Shopify looks close to this Senior Backend Engineer role, especially the API and distributed systems experience.",
      "Open to a quick chat? Happy to send more context.",
      "Best,",
    ],
  },
  email: {
    cta: "Send email",
    body: [
      "Subject: Your Shopify platform work",
      "Hi James,",
      "I came across your background building platform systems at Shopify and thought the overlap with this role looked strong.",
      "Would you be open to a short intro? I can send the role context and you can decide if it is worth exploring.",
      "Best,",
    ],
  },
} as const;

export function HeroPreview() {
  const displayedCandidates = candidateRows.slice(0, 3);
  const [outreachChannel, setOutreachChannel] = useState<keyof typeof outreachDrafts>("inmail");
  const activeDraft = outreachDrafts[outreachChannel];

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
                      : index === 2
                        ? "bg-slate-950 text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {index < 2 ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className={`text-xs font-semibold ${index <= 2 ? "text-blue-700" : "text-slate-400"}`}>
                  {step}
                </span>
                {index < processSteps.length - 1 ? <span className="text-slate-300">-&gt;</span> : null}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden text-slate-400 sm:inline">Search ID: 8f2c7d</span>
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
              Completed
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="min-w-0 space-y-3">
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1.3fr_1fr]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                  <BriefcaseBusiness className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-500">Parsed role</p>
                  <p className="truncate text-sm font-semibold text-slate-950">Senior Backend Engineer</p>
                  <p className="text-xs text-slate-500">Full-time · Remote · US</p>
                </div>
              </div>
              <div className="border-slate-200 md:border-l md:pl-4">
                <p className="text-[11px] font-medium text-slate-500">Must-have skills</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["Python", "Django", "PostgreSQL", "AWS", "APIs", "System Design"].map((skill) => (
                    <span key={skill} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              <div className="border-slate-200 md:border-l md:pl-4">
                <p className="text-[11px] font-medium text-slate-500">Target signals</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["SaaS", "Scale", "Open source"].map((signal) => (
                    <span key={signal} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                      {signal}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-950">Ranked candidates</h2>
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    Top matches ready
                  </span>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                </button>
              </div>

              <div className="divide-y divide-slate-200">
                {displayedCandidates.map((candidate, index) => (
                  <div key={candidate.name} className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(13rem,1.25fr)_4.5rem_minmax(0,1.2fr)] md:items-center 2xl:grid-cols-[minmax(13rem,1.25fr)_4.5rem_minmax(0,1.2fr)_6.5rem]">
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

                    <div className="space-y-1 text-[11px] leading-5 text-slate-600">
                      {candidate.matchReasons.slice(0, 2).map((reason) => (
                        <div key={reason} className="flex items-start gap-1.5">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="line-clamp-1">{reason}</span>
                        </div>
                      ))}
                    </div>

                    <div className="hidden flex-wrap gap-1.5 2xl:flex 2xl:justify-end">
                      {["LinkedIn", "GitHub", "Repos"].map((source) => (
                        <span key={source} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
                          {source === "GitHub" || source === "Repos" ? (
                            <Github className="h-3 w-3" />
                          ) : (
                            <Linkedin className="h-3 w-3" />
                          )}
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <a href="#pricing" className="inline-flex items-center gap-1.5 px-3 py-3 text-xs font-semibold text-blue-700 hover:text-blue-900">
                Open reviewed profile pool <span>-&gt;</span>
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Outreach draft preview</p>
                <p className="mt-1 text-xs text-slate-500">Personalized with role and profile evidence</p>
              </div>
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                Ready
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-600">
              <button
                type="button"
                aria-pressed={outreachChannel === "inmail"}
                onClick={() => setOutreachChannel("inmail")}
                className={`rounded-md px-2 py-1.5 transition-colors ${
                  outreachChannel === "inmail" ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"
                }`}
              >
                LinkedIn InMail
              </button>
              <button
                type="button"
                aria-pressed={outreachChannel === "email"}
                onClick={() => setOutreachChannel("email")}
                className={`rounded-md px-2 py-1.5 transition-colors ${
                  outreachChannel === "email" ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"
                }`}
              >
                Email
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
              {activeDraft.body.map((paragraph, index) => (
                <p key={paragraph} className={index === 0 ? undefined : "mt-3"}>
                  {paragraph}
                </p>
              ))}
            </div>

            <button
              type="button"
              className="mt-3 inline-flex w-full cursor-default items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-700"
            >
              <Send className="h-4 w-4" />
              {activeDraft.cta}
            </button>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
              Drafts can be edited before anything is sent.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
