"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import {
  ANALYTICS_EVENTS,
  buildAttributionQuery,
  getAnalyticsContextFromBrowser,
  getDefaultLandingExperimentState,
  getLandingExperimentStateFromBrowser,
  trackEvent,
  type IntentPath,
} from "@/lib/analytics";

const sampleJd = `Senior Frontend Engineer

We are hiring a Senior Frontend Engineer to build customer-facing product experiences for a fast-growing B2B SaaS company.

Requirements:
- 5+ years of frontend engineering experience
- Strong React and TypeScript skills
- Experience with Next.js and modern design systems
- Comfortable shipping production features end-to-end
- Bonus: growth experiments, analytics, or performance optimization

Nice to have:
- Experience working in startups
- Familiarity with GraphQL and product analytics`;

const candidateRows = [
  {
    initials: "JL",
    name: "James Liu",
    role: "Senior Frontend Engineer at Shopify",
    score: 88,
    matched: ["React", "TypeScript", "Next.js"],
  },
  {
    initials: "AN",
    name: "Anika Nair",
    role: "Staff Frontend Developer at Atlassian",
    score: 79,
    matched: ["React", "GraphQL"],
  },
  {
    initials: "MR",
    name: "Marco Rossi",
    role: "Frontend Lead at Datadog",
    score: 72,
    matched: ["TypeScript", "Design Systems"],
  },
];

const headlineCopy = {
  speed: "Get a ranked shortlist in minutes.",
  results: "Turn any job description into a candidate shortlist.",
} as const;

const ctaCopy = {
  paste_jd: "Paste a JD",
  find_candidates: "Find Candidates",
} as const;

const proofCards = {
  speed: {
    icon: Clock3,
    title: "Under 5 minutes",
    desc: "From pasted JD to a shortlist you can review fast.",
  },
  source: {
    icon: Database,
    title: "Real LinkedIn profiles",
    desc: "Results are grounded in real public profile discovery.",
  },
  ranking: {
    icon: Star,
    title: "Ranked match reasons",
    desc: "See why a candidate matches before you open outreach.",
  },
} as const;

const proofOrder = {
  speed_first: ["speed", "source", "ranking"] as const,
  credibility_first: ["source", "ranking", "speed"] as const,
} as const;

export default function Home() {
  const router = useRouter();
  const [jdText, setJdText] = useState("");
  const [experiments, setExperiments] = useState(getDefaultLandingExperimentState);
  const hasTrackedInputRef = useRef(false);
  const hasTrackedLandingViewRef = useRef(false);

  const trimmedJd = jdText.trim();
  const wordCount = trimmedJd ? trimmedJd.split(/\s+/).filter(Boolean).length : 0;
  const canSubmit = trimmedJd.length >= 50;
  const activeProofCards = proofOrder[experiments.proof].map((key) => proofCards[key]);

  useEffect(() => {
    const assignedExperiments = getLandingExperimentStateFromBrowser();
    const frame = window.requestAnimationFrame(() => {
      setExperiments(assignedExperiments);
    });

    if (!hasTrackedLandingViewRef.current) {
      hasTrackedLandingViewRef.current = true;

      trackEvent(
        ANALYTICS_EVENTS.landingView,
        {
          ...getAnalyticsContextFromBrowser({
            page_variant: assignedExperiments.pageVariant,
          }),
          headline_variant: assignedExperiments.headline,
          cta_variant: assignedExperiments.cta,
          proof_variant: assignedExperiments.proof,
        },
      );
    }

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function buildTrackedHref(
    pathname: string,
    intentPath: IntentPath,
    extra?: Record<string, string | number>,
  ) {
    const context = getAnalyticsContextFromBrowser({
      page_variant: experiments.pageVariant,
      intent_path: intentPath,
    });
    const query = buildAttributionQuery({
      intentPath,
      pageVariant: context.page_variant,
      trafficSource: context.traffic_source,
      utmCampaign: context.utm_campaign,
      extra,
    });

    return `${pathname}?${query.toString()}`;
  }

  function goToSearch(prefill: string, intentPath: Extract<IntentPath, "sample" | "direct_jd">) {
    router.push(
      buildTrackedHref("/app/search/new", intentPath, {
        jd: prefill,
      }),
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    const eventContext = getAnalyticsContextFromBrowser({
      page_variant: experiments.pageVariant,
      intent_path: "direct_jd",
    });

    trackEvent(ANALYTICS_EVENTS.heroPrimaryCtaClick, {
      ...eventContext,
      cta_variant: experiments.cta,
      jd_word_count: wordCount,
    });

    trackEvent(ANALYTICS_EVENTS.heroJdSubmitAttempt, {
      ...eventContext,
      jd_word_count: wordCount,
    });

    goToSearch(trimmedJd, "direct_jd");
  }

  function handleTrySample() {
    const eventContext = getAnalyticsContextFromBrowser({
      page_variant: experiments.pageVariant,
      intent_path: "sample",
    });

    trackEvent(ANALYTICS_EVENTS.sampleCtaClick, {
      ...eventContext,
      sample_name: "senior_frontend_engineer",
    });

    goToSearch(sampleJd, "sample");
  }

  function handleJdInput(value: string) {
    setJdText(value);

    if (!hasTrackedInputRef.current && value.trim().length > 0) {
      hasTrackedInputRef.current = true;
      trackEvent(ANALYTICS_EVENTS.heroJdInputStart, {
        ...getAnalyticsContextFromBrowser({
          page_variant: experiments.pageVariant,
          intent_path: "direct_jd",
        }),
      });
    }
  }

  const signInHref = buildTrackedHref("/app", "signin");
  const desktopFooterCtaLabel =
    experiments.cta === "paste_jd" ? "Jump to the JD form" : "Go to the search form";

  return (
    <div className="landing-dark min-h-screen">
      <nav className="fixed top-0 z-50 w-full border-b border-white/[0.08] bg-[#07101d]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight text-white">Hirelix</span>
          </div>
          <Link
            href={signInHref}
            className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-white/[0.2] hover:bg-white/[0.06]"
          >
            Sign In
          </Link>
        </div>
      </nav>

      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute top-16 left-1/2 h-[660px] w-[660px] -translate-x-1/2 rounded-full bg-sky-400/[0.1] blur-[132px]" />
        <div className="pointer-events-none absolute top-44 left-1/4 h-[280px] w-[280px] rounded-full bg-cyan-300/[0.07] blur-[100px] animate-glow" />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.1] px-3 py-1 text-xs font-medium text-sky-100">
              <Sparkles className="h-3.5 w-3.5" />
              For founders and recruiters who need qualified candidates fast
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Paste a JD.
              <br />
              <span className="text-gradient">{headlineCopy[experiments.headline]}</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:mt-6 sm:text-lg">
              Hirelix turns a job description into real candidate profiles, ranked match reasons, and outreach-ready copy. See the value first. Sign in when you&apos;re ready to run the search.
            </p>

            <div className="mt-6 rounded-2xl border border-white/[0.14] bg-white/[0.06] p-4 sm:hidden">
              <p className="text-sm font-semibold text-white">
                Best experienced on desktop
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-300/84">
                Reviewing candidates, match reasons, and outreach drafts is much easier on a larger screen.
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={handleTrySample}
                  data-testid="mobile-sample-cta"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition-all hover:bg-amber-300"
                >
                  Try a Sample Search <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-slate-300/70">
                Already have an account?{" "}
                <Link href={signInHref} className="font-medium text-sky-100 hover:underline">
                  Sign in on this device
                </Link>
              </p>
              <div className="mt-4 grid gap-2 text-xs text-slate-300/72">
                <p>Under 5 minutes from JD to shortlist</p>
                <p>Real LinkedIn profiles and ranked match reasons</p>
                <p>Personalized outreach drafts included</p>
              </div>
            </div>

            <form id="hero-form" onSubmit={handleSubmit} className="mt-8 hidden sm:block">
              <div className="rounded-2xl border border-white/[0.16] bg-white/[0.08] p-2 shadow-[0_24px_80px_rgba(13,33,66,0.45)]">
                <div className="rounded-xl bg-[#0e1727] p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                    <FileText className="h-4 w-4 text-sky-300" />
                    Paste a job description
                  </div>
                  <textarea
                    value={jdText}
                    onChange={(e) => handleJdInput(e.target.value)}
                    placeholder="Paste the full JD here. We will keep it ready for you on the next step."
                    rows={10}
                    className="w-full resize-none rounded-xl border border-white/[0.12] bg-[#152034] p-4 text-sm leading-relaxed text-white placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/20"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-300/78">
                    <span>
                      {wordCount > 0
                        ? `${wordCount} words ready to analyze`
                        : "Works best with a full JD, not just a role title."}
                    </span>
                    <button
                      type="button"
                      onClick={handleTrySample}
                      data-testid="hero-sample-link"
                      className="font-medium text-sky-100 underline-offset-4 transition-colors hover:text-white hover:underline"
                    >
                      No JD handy? Use a sample role.
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      data-testid="hero-primary-cta"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition-all hover:bg-amber-300 hover:shadow-[0_18px_50px_rgba(251,191,36,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ctaCopy[experiments.cta]} <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <div className="mt-4 hidden flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300/70 sm:flex">
              <span>No credit card</span>
              <span>Sign in required before running the search</span>
              <span>Results usually ready in under 5 minutes</span>
            </div>

            <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3">
              {activeProofCards.map((item) => (
                <div key={item.title} className="glass rounded-2xl p-4">
                  <item.icon className="mb-3 h-4 w-4 text-sky-300" />
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300/80">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="glass-strong glow-blue rounded-3xl p-1">
              <div className="rounded-[22px] bg-[#0b1424] p-5 sm:p-7">
                <div className="mb-5 flex items-center gap-3 text-sm text-slate-400">
                  <div className="flex gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-red-500/60" />
                    <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
                    <span className="h-3 w-3 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-xs">What the shortlist looks like</span>
                </div>

                <div className="rounded-2xl border border-sky-300/20 bg-sky-400/[0.08] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">Senior Frontend Engineer</span>
                    <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      5 candidates found
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300/75">
                    Skills extracted: React, TypeScript, Next.js, design systems
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  {candidateRows.map((candidate) => (
                    <div
                      key={candidate.name}
                      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500 text-[10px] font-bold text-white">
                          {candidate.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{candidate.name}</p>
                          <p className="truncate text-xs text-slate-400">{candidate.role}</p>
                        </div>
                        <div className="rounded-full bg-sky-400/12 px-2.5 py-1 text-xs font-bold text-sky-200">
                          {candidate.score}% match
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {candidate.matched.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-md bg-sky-400/12 px-2 py-0.5 text-[10px] font-medium text-sky-200"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      <Star className="h-3.5 w-3.5 text-sky-300" />
                      Match reasons
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-200">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        <span>6 years in React and TypeScript</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        <span>Built production features in Next.js</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        <span>Worked with design systems and growth teams</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      <Mail className="h-3.5 w-3.5 text-sky-300" />
                      Outreach draft
                    </div>
                    <div className="mt-3 rounded-xl bg-[#101b2d] p-3 text-xs leading-relaxed text-slate-200">
                      Hi James, your experience leading React and Next.js product work at Shopify looks closely aligned with this role...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-18 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 sm:grid-cols-3">
          {[
            {
              icon: Search,
              title: "Stop translating JDs into filters",
              desc: "The JD becomes the brief. You do not need to reverse-engineer Boolean logic first.",
            },
            {
              icon: Brain,
              title: "Review ranked people, not a pile of profiles",
              desc: "Candidates arrive with match reasons so the first pass goes faster.",
            },
            {
              icon: Mail,
              title: "Leave with outreach ready to send",
              desc: "The workflow ends with a draft, not a blank email tab.",
            },
          ].map((item) => (
            <div key={item.title} className="glass rounded-2xl p-5">
              <item.icon className="mb-3 h-5 w-5 text-sky-300" />
              <h2 className="text-base font-semibold text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300/82">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              What happens after the click
            </h2>
            <p className="mt-3 text-base text-slate-300/80">
              High-intent traffic should understand the next step immediately.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Bring the real job description",
                desc: "Paste the actual role so the system can interpret the skills, level, and role shape correctly.",
              },
              {
                step: "2",
                title: "Sign in and run the search",
                desc: "Your pasted JD stays with you, so authentication does not reset the workflow.",
              },
              {
                step: "3",
                title: "Review candidates and outreach",
                desc: "Open the shortlist, inspect match reasons, and move straight into outreach.",
              },
            ].map((item) => (
              <div key={item.step} className="glass rounded-2xl p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/12 text-lg font-bold text-sky-200">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/82">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Why teams switch from manual sourcing
            </h2>
            <p className="mt-3 text-base text-slate-300/80">
              The page should sell time-to-outcome, not a feature list.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="glass rounded-2xl p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Without Hirelix
              </p>
              <div className="space-y-3 text-sm text-slate-300/82">
                <p>1. Translate the JD into keywords and filters</p>
                <p>2. Scroll through large result sets manually</p>
                <p>3. Decide who is actually relevant</p>
                <p>4. Draft outreach one candidate at a time</p>
              </div>
              <div className="mt-6 rounded-xl bg-white/[0.04] px-4 py-3 text-center">
                <span className="text-2xl font-bold text-rose-300">Hours per role</span>
              </div>
            </div>

            <div className="rounded-2xl border border-sky-300/20 bg-sky-400/[0.08] p-6 glow-blue-sm">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">
                With Hirelix
              </p>
              <div className="space-y-3 text-sm text-slate-100">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
                  <span>Paste the real JD once</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
                  <span>Open a ranked shortlist with match reasons</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
                  <span>Start outreach with a draft already prepared</span>
                </div>
              </div>
              <div className="mt-6 rounded-xl bg-white/[0.08] px-4 py-3 text-center">
                <span className="text-2xl font-bold text-white">Usually under 5 minutes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Objections answered up front
            </h2>
            <p className="mt-3 text-base text-slate-300/80">
              High-intent visitors should not have to dig for the obvious questions.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Database,
                title: "Are these real people?",
                desc: "The product is built around real LinkedIn profile discovery, not synthetic candidate records.",
              },
              {
                icon: ShieldCheck,
                title: "Do I need to pay before seeing value?",
                desc: "No credit card is required to get started. The first step is understanding what the workflow looks like.",
              },
              {
                icon: Search,
                title: "Is this only for recruiters?",
                desc: "It works for founders and hiring teams alike because the JD is the shared source of truth.",
              },
              {
                icon: Mail,
                title: "Will I still need to write outreach manually?",
                desc: "You can edit the draft, but you do not need to start from a blank email after reviewing candidates.",
              },
            ].map((item) => (
              <div key={item.title} className="glass rounded-2xl p-6">
                <item.icon className="mb-4 h-5 w-5 text-sky-300" />
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/82">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/[0.06] py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sky-400/[0.08] via-transparent to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-[360px] w-[560px] -translate-x-1/2 rounded-full bg-sky-300/[0.08] blur-[120px]" />
        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Bring your next open role.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            See the workflow first. Run the real search once you&apos;re ready to sign in.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <a
              href="#hero-form"
              className="hidden items-center gap-2 rounded-xl bg-amber-400 px-8 py-4 text-base font-semibold text-slate-950 transition-all hover:bg-amber-300 hover:shadow-[0_18px_50px_rgba(251,191,36,0.35)] sm:inline-flex"
            >
              {desktopFooterCtaLabel} <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={handleTrySample}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-8 py-4 text-base font-semibold text-slate-950 transition-all hover:bg-amber-300 hover:shadow-[0_18px_50px_rgba(251,191,36,0.35)] sm:hidden"
            >
              Try a Sample Search <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-sm text-slate-300/78">
              Already have an account?{" "}
              <Link href={signInHref} className="font-medium text-sky-100 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-slate-300/60 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={20} height={20} />
            <span className="font-semibold text-white">Hirelix</span>
          </div>
          <p>AI-powered candidate sourcing from real LinkedIn profiles.</p>
        </div>
      </footer>
    </div>
  );
}
