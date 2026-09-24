"use client";


import { useT } from "@/components/LanguageProvider";
import { BookUser, FileText, MessageCircle, Search, Sparkles } from "lucide-react";

export function HowItWorksSection() {
  const t = useT();
  const steps = [
    {
      title: "Bring a real client JD",
      desc: "Give your agent the role you are working on and the requirements that actually matter.",
    },
    {
      title: "Build your own candidate pool",
      desc: "Save people and your own observations once, even when a particular search is over.",
    },
    {
      title: "Ask for role-specific judgment",
      desc: "The agent explains who might fit this JD, which evidence supports that view, and what remains unverified.",
    },
    {
      title: "Draft the client update",
      desc: "Turn the available evidence into a recommendation brief you can edit before sharing.",
    },
  ];

  return (
    <section id="how-it-works" data-growth-section="工作方式" className="scroll-mt-[4.5rem] border-t border-slate-200 bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              {t("How it works")}
            </p>
            <h2 className="max-w-[12ch] text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {t("Your own recruiting intelligence, available across roles.")}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              {t("The agent works from your JD, the people you chose to remember, and the evidence you can actually defend.")}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.055)] sm:p-6">
            <div className="grid gap-4">
              {steps.map((step, index) => (
                <div key={step.title} className="grid gap-4 sm:grid-cols-[3.25rem_1fr]">
                  <div className="flex sm:flex-col sm:items-center">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    {index < steps.length - 1 ? (
                      <span className="ml-5 hidden h-full w-px bg-slate-200 sm:block" />
                    ) : null}
                  </div>
                  <div className="pb-2 sm:pb-5">
                    <h3 className="text-base font-semibold text-slate-950">{t(step.title)}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{t(step.desc)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  const t = useT();
  const features = [
    {
      icon: BookUser,
      title: "Your private candidate pool",
      desc: "Keep candidate context and your own notes beyond a single assignment.",
    },
    {
      icon: FileText,
      title: "JD as context",
      desc: "Bring the client's actual role. A person can fit one JD and miss another.",
    },
    {
      icon: MessageCircle,
      title: "Ask your agent",
      desc: "Get a direct answer about saved people, evidence gaps, and the role in front of you.",
    },
    {
      icon: Sparkles,
      title: "Recommendation briefs",
      desc: "Generate and revise a weekly client update from what is recorded, with no invented activity.",
    },
    {
      icon: Search,
      title: "Existing search, when needed",
      desc: "The current sourcing engine remains available to discover people to review and remember.",
    },
    {
      icon: FileText,
      title: "Evidence and uncertainty",
      desc: "Keep recruiter notes separate from source claims, and call out what still needs verification.",
    },
  ];

  return (
    <section id="features" data-growth-section="功能" className="scroll-mt-[4.5rem] border-t border-slate-200 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              {t("Features")}
            </p>
            <h2 className="max-w-xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {t("A thinking partner with your own long-term context.")}
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-slate-600">
            {t("The agent starts from your knowledge of people and helps you make a defensible decision for each client role.")}
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-indigo-700 ring-1 ring-slate-200">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-950">{t(item.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(item.desc)}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-3 border-t border-slate-200 pt-6 text-sm text-slate-700 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-700" />
            {t("Your candidate pool stays yours")}
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            {t("Source claims stay separate from your notes")}
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {t("Client briefs remain drafts until you review them")}
          </div>
        </div>
      </div>
    </section>
  );
}
