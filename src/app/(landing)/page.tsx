"use client";

import {
  startTransition,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  CircleHelp,
  Database,
  FileText,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginForm } from "@/components/LoginForm";
import {
  ANALYTICS_EVENTS,
  buildAttributionQuery,
  getAnalyticsContextFromBrowser,
  getDefaultLandingExperimentState,
  trackEvent,
  type IntentPath,
} from "@/lib/analytics";
import { BILLING_PLANS, CONTACT_PACK, SEARCH_PACK } from "@/lib/billing";

const sampleJd = `Senior Software Engineer

We are hiring a Senior Software Engineer to build product and platform systems for a fast-growing B2B SaaS company.

Requirements:
- 5+ years of software engineering experience
- Strong experience building backend services, APIs, and production systems
- Comfortable working across cloud infrastructure, data flows, and product collaboration
- Experience shipping reliable features end-to-end in fast-moving teams
- Bonus: distributed systems, observability, or developer tooling experience

Nice to have:
- Experience working in startups
- Familiarity with AWS, PostgreSQL, and event-driven architectures`;

const candidateRows = [
  {
    initials: "JL",
    name: "James Liu",
    role: "Senior Software Engineer at Shopify",
    location: "New York City Metropolitan Area",
    fitLabel: "Strong fit",
    actionLabel: "Ready to reach out",
    score: 88,
    matched: ["APIs", "Distributed Systems", "AWS"],
    constraintChecks: [
      { label: "Backend depth", verdict: "Strong" },
      { label: "Product pace", verdict: "Strong" },
      { label: "Cloud systems", verdict: "Strong" },
      { label: "Startup signal", verdict: "Moderate" },
    ],
    matchReasons: [
      "Built merchant-facing APIs and backend platform systems at Shopify, directly matching the JD's API and production-systems requirement.",
      "Shows real distributed-systems ownership in a fast-moving product org, which maps well to the role's end-to-end shipping expectation.",
      "AWS and reliability-heavy platform work make him unusually credible for a shortlist-first outbound pass.",
    ],
    riskReasons: [
      "No public signal yet on willingness to move into a smaller team environment.",
    ],
    recentExperience: [
      "Senior Software Engineer, Shopify: built internal platform APIs used by multiple product teams.",
      "Software Engineer, Shopify: owned reliability improvements for high-volume backend services.",
    ],
    email: "james.liu@shopify-example.com",
    linkedinUrl: "https://www.linkedin.com/in/james-liu-platform",
    linkedinDraft:
      "Hi James, your platform work at Shopify looks unusually close to what this team needs. You have built APIs and platform systems at real scale, which is exactly why I wanted to reach out. Open to a quick conversation?",
    emailDraft:
      "Hi James, I came across your work building APIs and platform systems at Shopify and thought it was one of the closest fits I have seen for this backend role. The team needs someone who is comfortable with production systems, cloud infrastructure, and shipping reliably across product and platform. If you are open to it, I would love to share a little more context.",
    emailSubject: "James, quick question about your Shopify platform work",
  },
  {
    initials: "AN",
    name: "Anika Nair",
    role: "Staff Software Engineer at Atlassian",
    location: "San Francisco Bay Area",
    fitLabel: "Viable fit",
    actionLabel: "Needs founder check",
    score: 79,
    matched: ["Platform", "PostgreSQL"],
    constraintChecks: [
      { label: "Backend depth", verdict: "Strong" },
      { label: "Cross-functional", verdict: "Strong" },
      { label: "Seniority", verdict: "High" },
      { label: "Stage fit", verdict: "Needs review" },
    ],
    matchReasons: [
      "Led platform work that spans product systems, data storage, and reliability, which lines up with the JD's backend-plus-product shape.",
      "PostgreSQL and platform ownership suggest strong judgment, especially for teams that need someone to stabilize systems quickly.",
      "A good candidate when the role values technical range more than narrow title matching.",
    ],
    riskReasons: [
      "Staff-level profile may be over-scoped for a role that still looks hands-on and execution heavy.",
      "Larger-company background raises a real question about startup pace and ambiguity tolerance.",
    ],
    recentExperience: [
      "Staff Software Engineer, Atlassian: led platform initiatives across shared backend services.",
      "Senior Engineer, Atlassian: worked on PostgreSQL-backed systems and cross-team infrastructure projects.",
    ],
    email: "anika.nair@atlassian-example.com",
    linkedinUrl: "https://www.linkedin.com/in/anika-nair-platform",
    linkedinDraft:
      "Hi Anika, your platform engineering work at Atlassian stood out right away. This role needs someone who can move across product systems, backend reliability, and data-heavy infrastructure without losing execution speed.",
    emailDraft:
      "Hi Anika, I saw your background leading platform work at Atlassian and thought the overlap here was strong. The team is hiring for someone who can work across backend systems, platform reliability, and product-facing execution, and your profile looked unusually relevant. If you are open, I can send a few details and let you decide whether it is worth exploring.",
    emailSubject: "Anika, your Atlassian platform background looks highly relevant",
  },
  {
    initials: "MR",
    name: "Marco Rossi",
    role: "Senior Backend Engineer at Datadog",
    location: "Austin, Texas",
    fitLabel: "Risky fit",
    actionLabel: "Hold for now",
    score: 72,
    matched: ["TypeScript", "Cloud Infrastructure"],
    constraintChecks: [
      { label: "Backend depth", verdict: "Strong" },
      { label: "Observability", verdict: "Strong" },
      { label: "Location", verdict: "Unknown" },
      { label: "Product fit", verdict: "Moderate" },
    ],
    matchReasons: [
      "Datadog backend and observability work makes him believable for production-systems ownership from day one.",
      "TypeScript service experience gives him a practical path into the stack described in the JD.",
      "Worth keeping in the pool because the technical floor is real even if overall fit is not as clean.",
    ],
    riskReasons: [
      "Location signal is outside the target market shown in the sample role.",
      "Observability-heavy background may translate less well if the team needs broader product system ownership.",
    ],
    recentExperience: [
      "Senior Backend Engineer, Datadog: shipped backend services for observability workflows.",
      "Backend Engineer, growth-stage SaaS team: maintained TypeScript services and cloud infrastructure.",
    ],
    email: "marco.rossi@datadog-example.com",
    linkedinUrl: "https://www.linkedin.com/in/marco-rossi-backend",
    linkedinDraft:
      "Hi Marco, your backend and cloud infrastructure work at Datadog looks very aligned with this role. They need someone strong in production systems, reliable services, and API-heavy backend work, so I wanted to reach out directly.",
    emailDraft:
      "Hi Marco, your mix of backend, cloud infrastructure, and production systems experience at Datadog caught my attention because it maps closely to what this team is hiring for. The role is hands-on, API-heavy, and needs someone comfortable with reliability and scale. Happy to send more context if it sounds potentially relevant.",
    emailSubject: "Marco, quick question about your Datadog backend work",
  },
];

const heroSearchStats = [
  { label: "Profiles scanned", value: "2,500+" },
  { label: "Deep review", value: "250+" },
  { label: "Outreach drafts", value: "Ready to send" },
];

const outreachChannels = [
  {
    label: "LinkedIn InMail",
    eyebrow: "Send via LinkedIn",
    cta: "Send LinkedIn InMail",
  },
  {
    label: "Email Outreach",
    eyebrow: "Send via email",
    cta: "Send Email Outreach",
  },
];

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const experiments = getDefaultLandingExperimentState();
  const [jdText, setJdText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<"search" | "signin">("search");
  const [pendingJd, setPendingJd] = useState("");
  const [pendingIntentPath, setPendingIntentPath] = useState<IntentPath>("direct_jd");
  const [pendingRedirectPath, setPendingRedirectPath] = useState("");
  const [selectedHeroCandidateIndex, setSelectedHeroCandidateIndex] = useState(0);
  const [selectedOutreachChannelIndex, setSelectedOutreachChannelIndex] = useState(0);
  const [selectedHeroDetailTab, setSelectedHeroDetailTab] = useState<"evidence" | "experience">("evidence");
  const hasTrackedInputRef = useRef(false);
  const hasTrackedLandingViewRef = useRef(false);

  const trimmedJd = jdText.trim();
  const wordCount = trimmedJd ? trimmedJd.split(/\s+/).filter(Boolean).length : 0;
  const canSubmit = trimmedJd.length >= 50;
  const modalPreviewTitle = useMemo(() => {
    const firstMeaningfulLine = pendingJd
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);

    return firstMeaningfulLine || "Selected job description";
  }, [pendingJd]);
  const isSearchAuthIntent = authIntent === "search";
  const displayedHeroCandidates = candidateRows.slice(0, 2);
  const activeHeroCandidate =
    displayedHeroCandidates[selectedHeroCandidateIndex] ?? displayedHeroCandidates[0];
  const activeOutreachChannel = outreachChannels[selectedOutreachChannelIndex] ?? outreachChannels[0];
  const activeMatchReasons = activeHeroCandidate.matchReasons.slice(0, 1);
  const activeRiskReason = activeHeroCandidate.riskReasons[0] ?? "Needs closer review before outreach.";
  const activeExperiencePreview = activeHeroCandidate.recentExperience.slice(0, 2);
  const activeContactLabel = selectedOutreachChannelIndex === 0 ? "LinkedIn" : "Email";
  const activeContactValue =
    selectedOutreachChannelIndex === 0
      ? activeHeroCandidate.linkedinUrl
      : activeHeroCandidate.email;
  const activeActionHref =
    selectedOutreachChannelIndex === 0
      ? activeHeroCandidate.linkedinUrl
      : `mailto:${activeHeroCandidate.email}?subject=${encodeURIComponent(
          activeHeroCandidate.emailSubject,
        )}&body=${encodeURIComponent(activeHeroCandidate.emailDraft)}`;
  const activeActionTarget = selectedOutreachChannelIndex === 0 ? "_blank" : undefined;
  const activeActionRel = selectedOutreachChannelIndex === 0 ? "noreferrer noopener" : undefined;

  useEffect(() => {
    router.prefetch("/app/search/new");

    if (!hasTrackedLandingViewRef.current) {
      hasTrackedLandingViewRef.current = true;

      trackEvent(
        ANALYTICS_EVENTS.landingView,
        {
          ...getAnalyticsContextFromBrowser({
            entry_mode: "landing",
            page_variant: experiments.pageVariant,
          }),
          headline_variant: experiments.headline,
          cta_variant: experiments.cta,
          proof_variant: experiments.proof,
        },
      );
    }
  }, [experiments, router]);

  useEffect(() => {
    if (!authModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [authModalOpen]);

  function buildTrackedHref(
    pathname: string,
    intentPath: IntentPath,
    extra?: Record<string, string | number>,
    entryMode: "landing" | "signin" | "workspace" = "landing",
  ) {
    const context = getAnalyticsContextFromBrowser({
      entry_mode: entryMode,
      page_variant: experiments.pageVariant,
      intent_path: intentPath,
    });
    const query = buildAttributionQuery({
      intentPath,
      pageVariant: context.page_variant,
      trafficSource: context.traffic_source,
      utmCampaign: context.utm_campaign,
      entryMode: context.entry_mode,
      extra,
    });

    return `${pathname}?${query.toString()}`;
  }

  function goToSearch(prefill: string, intentPath: Extract<IntentPath, "sample" | "direct_jd">) {
    startTransition(() => {
      router.push(
        buildTrackedHref("/app/search/new", intentPath, {
          jd: prefill,
        }),
      );
    });
  }

  function openAuthModal(
    intentPath: IntentPath,
    options?: {
      authIntent?: "search" | "signin";
      prefill?: string;
      redirectPath?: string;
    },
  ) {
    const authIntentValue = options?.authIntent ?? "search";
    const prefill = options?.prefill ?? "";
    const redirectPath =
      options?.redirectPath ??
      buildTrackedHref("/app/search/new", intentPath, {
        jd: prefill,
      });

    setAuthIntent(authIntentValue);
    setPendingJd(prefill);
    setPendingIntentPath(intentPath);
    setPendingRedirectPath(redirectPath);
    setAuthModalOpen(true);
    setIsSubmitting(false);

    trackEvent(ANALYTICS_EVENTS.signinView, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: "landing",
        page_variant: experiments.pageVariant,
        intent_path: intentPath,
      }),
      route: "/",
      has_prefilled_jd: Boolean(prefill),
      signin_surface: "landing_modal",
    });
  }

  function handleGenericSignIn() {
    if (user) {
      router.push(buildTrackedHref("/app/search/new", "signin", undefined, "signin"));
      return;
    }

    openAuthModal("signin", {
      authIntent: "signin",
      redirectPath: buildTrackedHref("/app/search/new", "signin", undefined, "signin"),
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    const eventContext = getAnalyticsContextFromBrowser({
      entry_mode: "landing",
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

    if (user) {
      goToSearch(trimmedJd, "direct_jd");
      return;
    }

    openAuthModal("direct_jd", {
      authIntent: "search",
      prefill: trimmedJd,
    });
  }

  function handleTrySample() {
    const eventContext = getAnalyticsContextFromBrowser({
      entry_mode: "landing",
      page_variant: experiments.pageVariant,
      intent_path: "sample",
    });

    trackEvent(ANALYTICS_EVENTS.sampleCtaClick, {
      ...eventContext,
      sample_name: "senior_software_engineer",
    });

    if (user) {
      goToSearch(sampleJd, "sample");
      return;
    }

    openAuthModal("sample", {
      authIntent: "search",
      prefill: sampleJd,
    });
  }

  function handleJdInput(value: string) {
    setJdText(value);

    if (!hasTrackedInputRef.current && value.trim().length > 0) {
      hasTrackedInputRef.current = true;
      trackEvent(ANALYTICS_EVENTS.heroJdInputStart, {
        ...getAnalyticsContextFromBrowser({
          entry_mode: "landing",
          page_variant: experiments.pageVariant,
          intent_path: "direct_jd",
        }),
      });
    }
  }
  const desktopFooterCtaLabel = "Get Shortlist + Outreach";
  const legalLinks = [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/refund-policy", label: "Refund Policy" },
    { href: "/contact", label: "Contact" },
  ];
  const billingFaqs = [
    {
      title: "Do subscriptions renew automatically?",
      body: "Yes. Pro Monthly and Pro Annual renew automatically until you cancel.",
    },
    {
      title: "How do I cancel?",
      body: "You can cancel from billing settings or by emailing support@hirelix.online. Unless required by law, cancellation takes effect at the end of the current billing period.",
    },
    {
      title: "How do refunds work?",
      body: "Purchases made through Paddle are refundable within 14 days of the transaction date. For subscriptions, this applies within 14 days of the initial purchase or the most recent renewal.",
    },
    {
      title: "Do I need a card to start?",
      body: "No. The Free plan gives you 1 high-conviction shortlist per month before you upgrade.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#07101d] text-slate-950">
      <nav className="fixed top-0 z-50 w-full border-b border-white/[0.08] bg-[#07101d]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight text-white">Hirelix</span>
          </div>
          <button
            type="button"
            onClick={handleGenericSignIn}
            className="rounded-lg border border-white/[0.16] bg-white/[0.05] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-white/[0.28] hover:bg-white/[0.1]"
          >
            Sign In
          </button>
        </div>
      </nav>

      <section className="landing-dark relative overflow-hidden pt-20 pb-8 sm:pt-24 sm:pb-12 lg:min-h-[calc(100vh-4rem)] lg:pt-14 lg:pb-6">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute top-16 left-1/2 h-[660px] w-[660px] -translate-x-1/2 rounded-full bg-sky-400/[0.1] blur-[132px]" />
        <div className="pointer-events-none absolute top-44 left-1/4 h-[280px] w-[280px] rounded-full bg-cyan-300/[0.07] blur-[100px] animate-glow" />
        <div className="pointer-events-none absolute top-32 right-[14%] h-[360px] w-[360px] rounded-full bg-amber-300/[0.08] blur-[140px]" />

        <div className="relative mx-auto grid max-w-[92rem] gap-6 px-6 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div className="lg:flex lg:min-h-full lg:flex-col lg:justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.1] px-3 py-1 text-xs font-medium text-sky-100">
              <Sparkles className="h-3.5 w-3.5" />
              For technical recruiters and headhunters
            </div>

            <h1 className="mt-3 max-w-[12.5ch] text-4xl font-extrabold leading-[0.93] tracking-tight text-white sm:text-[2.8rem] lg:text-[3.15rem]">
              Paste a JD.
              <br />
              <span className="text-gradient">Get GitHub-vetted shortlist and outreach in minutes.</span>
            </h1>

            <p className="mt-2.5 max-w-[33rem] text-[15px] leading-relaxed text-slate-300 sm:text-[0.96rem]">
              Real LinkedIn profiles, cross-referenced with GitHub signals when public evidence exists.
              One pasted JD gets you a ranked shortlist and personalized outreach drafts.
            </p>

            <div className="mt-2.5 hidden flex-wrap items-center gap-1.5 text-[11px] text-slate-100 sm:flex">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-200">
                Technical recruiter workflow
              </span>
              <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 font-medium text-sky-100">
                Large-scale LinkedIn search
              </span>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 font-medium text-slate-100">
                Ranked fit reasons
              </span>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 font-medium text-slate-100">
                Personalized outreach drafts
              </span>
            </div>

            <div className="mt-5 rounded-2xl border border-white/[0.2] bg-[linear-gradient(180deg,rgba(248,250,252,0.97)_0%,rgba(232,240,250,0.94)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:hidden">
              <p className="text-sm font-semibold text-slate-950">
                Best experienced on desktop
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
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
              <p className="mt-3 text-center text-xs text-slate-600">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={handleGenericSignIn}
                  className="font-medium text-sky-700 hover:underline"
                >
                  Sign in on this device
                </button>
              </p>
              <div className="mt-4 grid gap-2 text-xs text-slate-600">
                <p>From JD to shortlist and personalized drafts</p>
                <p>Real LinkedIn profiles with ranked fit reasons</p>
                <p>GitHub-backed signals when public evidence exists</p>
                <p>Sign in only when you&apos;re ready to run the search</p>
              </div>
            </div>

            <form id="hero-form" onSubmit={handleSubmit} className="mt-2 hidden sm:block">
              <div className="rounded-[26px] border border-white/[0.24] bg-gradient-to-br from-slate-100/90 via-white/85 to-sky-100/75 p-[1px] shadow-[0_30px_90px_rgba(8,25,51,0.32)]">
                <div className="rounded-[25px] bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.34),_transparent_36%),linear-gradient(180deg,_rgba(248,250,252,0.98)_0%,_rgba(236,244,252,0.96)_100%)] p-3.5 sm:p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-950">
                      <FileText className="h-4 w-4 text-sky-700" />
                      Paste a job description
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-white/90 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <textarea
                      value={jdText}
                      onChange={(e) => handleJdInput(e.target.value)}
                      placeholder="Paste the full JD here. We will keep it ready for you on the next step."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-950 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/20"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-600">
                    <span>
                      {wordCount > 0
                        ? `${wordCount} words ready to analyze`
                        : "Works best with a full JD, not just a role title."}
                    </span>
                    <button
                      type="button"
                      onClick={handleTrySample}
                      data-testid="hero-sample-link"
                      className="font-medium text-sky-700 underline-offset-4 transition-colors hover:text-sky-900 hover:underline"
                    >
                      No JD handy? Use a sample role.
                    </button>
                  </div>
                  <div className="mt-3">
                    <button
                      type="submit"
                      disabled={!canSubmit || isSubmitting}
                      data-testid="hero-primary-cta"
                      aria-busy={isSubmitting}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-amber-400 px-6 py-3 text-base font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-[0_24px_60px_rgba(251,191,36,0.42)] disabled:cursor-wait disabled:opacity-70"
                    >
                      {isSubmitting ? "Opening your shortlist..." : "Get Shortlist + Outreach"}{" "}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <p className="mt-2.5 text-center text-xs leading-relaxed text-slate-600">
                      {isSubmitting
                        ? "Taking you to the sign-in step with your JD ready."
                        : "No credit card for the Free plan. Sign in when you are ready to run the search."}
                    </p>
                  </div>
                </div>
              </div>
            </form>

            <p className="mt-3 hidden text-xs text-slate-300/70 sm:block">
              Trusted by technical recruiters running high-volume engineering searches.
            </p>

          </div>

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
                  {displayedHeroCandidates.map((candidate, index) => (
                    <button
                      key={candidate.name}
                      type="button"
                      onClick={() => setSelectedHeroCandidateIndex(index)}
                      className={`w-full rounded-2xl border bg-gradient-to-r p-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all ${
                        index === selectedHeroCandidateIndex
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
                          <p className="mt-1.5 text-base font-semibold text-white">{activeHeroCandidate.fitLabel}</p>
                          <p className="mt-1 text-xs text-slate-300">{activeHeroCandidate.location} · {activeHeroCandidate.role}</p>
                        </div>
                        <span className="rounded-full border border-emerald-300/18 bg-emerald-400/12 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                          {activeHeroCandidate.actionLabel}
                        </span>
                      </div>

                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {activeHeroCandidate.constraintChecks.map((item) => (
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
                            onClick={() => setSelectedHeroDetailTab(tab.key as "evidence" | "experience")}
                            className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                              selectedHeroDetailTab === tab.key
                                ? "border-sky-300/28 bg-sky-400/14 text-sky-100"
                                : "border-white/[0.12] bg-white/[0.04] text-slate-300"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#101b2d] p-2.5 text-xs leading-relaxed text-slate-200">
                        {selectedHeroDetailTab === "evidence" ? (
                          <div className="space-y-1.5">
                            {activeMatchReasons.map((reason) => (
                              <div key={reason} className="flex items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                                <span className="line-clamp-2">{reason}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {selectedHeroDetailTab === "experience" ? (
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
                        ) : null}
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
                            ? activeHeroCandidate.linkedinDraft
                            : activeHeroCandidate.emailDraft}
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
        </div>
      </section>

      <div className="relative border-t border-slate-200 bg-[linear-gradient(180deg,#f6f8fc_0%,#ffffff_22%,#f8fbff_100%)]">
      <section className="py-18 sm:py-24">
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
              title: "Leave with personalized drafts ready",
              desc: "The workflow ends with personalized drafts, not a blank outreach tab.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <item.icon className="mb-3 h-5 w-5 text-sky-600" />
              <h2 className="text-base font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              What happens after the click
            </h2>
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
                desc: "Open the shortlist, inspect fit reasons and evidence, then move straight into personalized drafts.",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-lg font-bold text-sky-700">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Why teams switch from manual sourcing
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Without Hirelix
              </p>
              <div className="space-y-3 text-sm text-slate-600">
                <p>1. Translate the JD into keywords and filters</p>
                <p>2. Scroll through large result sets manually</p>
                <p>3. Decide who is actually relevant</p>
                <p>4. Draft outreach one candidate at a time</p>
              </div>
              <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-center">
                <span className="text-2xl font-bold text-rose-500">Hours per role</span>
              </div>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,#eff8ff_0%,#e8f3ff_100%)] p-6 shadow-[0_14px_36px_rgba(14,165,233,0.12)]">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                With Hirelix
              </p>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>Paste the real JD once</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>Open a ranked shortlist with fit reasons and outreach drafts ready</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>Start outreach with a draft already prepared</span>
                </div>
              </div>
              <div className="mt-6 rounded-xl bg-white px-4 py-3 text-center shadow-[0_8px_20px_rgba(14,165,233,0.08)]">
                <span className="text-2xl font-bold text-slate-950">Often ready in a few minutes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <div className="mb-4 flex justify-center gap-2 text-xs">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-800">
                Built for technical recruiters
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700">
                Self-serve signup and billing
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Pricing that protects speed, not complexity
            </h2>
            <p className="mt-3 text-base text-slate-600">
              Start free with one high-conviction shortlist per month, sourced from a Bright LinkedIn search and ranked into roughly 25 candidates. Upgrade when you need more weekly throughput, exports, and the fuller outreach workflow. Hirelix is built for technical recruiters and headhunters who need a faster path from JD to credible outreach.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {Object.values(BILLING_PLANS).map((plan) => (
              <div
                key={plan.code}
                className={`rounded-3xl border p-6 ${
                  plan.featured
                    ? "border-amber-300/50 bg-[linear-gradient(180deg,#fff7df_0%,#fff2c7_100%)] shadow-[0_20px_80px_rgba(251,191,36,0.12)]"
                    : "border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{plan.name}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{plan.description}</p>
                  </div>
                  {plan.featured && (
                    <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-950">
                      Popular
                    </span>
                  )}
                </div>

                <div className="mt-8">
                  <p className="text-4xl font-bold text-slate-950">{plan.priceLabel}</p>
                  <p className="mt-2 text-sm text-slate-500">{plan.cadenceLabel}</p>
                </div>

                <div className="mt-8 space-y-3 text-sm text-slate-700">
                  <p>{plan.searchesPerMonth} {plan.searchesPerMonth === 1 ? "search" : "searches"} each month</p>
                  <p>{plan.candidateLimitPerSearch} candidates per search</p>
                  {plan.enrichesPerMonth > 0 && (
                    <p>{plan.enrichesPerMonth} {plan.enrichesPerMonth === 1 ? "email + draft enrich" : "email + draft enriches"}</p>
                  )}
                  {plan.exportEnabled && <p>CSV export included</p>}
                </div>

                {user ? (
                  <Link
                    href="/app/settings#billing"
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                      plan.featured
                        ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                        : "border border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100"
                    }`}
                  >
                    Open billing
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenericSignIn}
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                      plan.featured
                        ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                        : "border border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100"
                    }`}
                  >
                    Sign in to choose plan
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <p className="text-sm font-semibold text-slate-950">{SEARCH_PACK.name}</p>
              <p className="mt-2 text-sm text-slate-600">{SEARCH_PACK.priceLabel} for {SEARCH_PACK.credits} extra searches in heavy months.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <p className="text-sm font-semibold text-slate-950">{CONTACT_PACK.name}</p>
              <p className="mt-2 text-sm text-slate-600">{CONTACT_PACK.priceLabel} for {CONTACT_PACK.credits} extra email + draft enriches.</p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
              <div className="space-y-2 leading-7">
                <p>Hirelix is available today for technical recruiters and headhunters.</p>
                <p>Subscriptions renew automatically until canceled.</p>
                <p>Cancel anytime from billing settings or by emailing support@hirelix.online.</p>
                <p>Purchases made through Paddle are refundable within 14 days of the transaction date.</p>
                <p>For subscriptions, refunds are available within 14 days of the initial purchase or the most recent renewal.</p>
                <p>Taxes may apply depending on the customer location.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Objections answered up front
            </h2>
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
                title: "Who is this built for first?",
                desc: "Hirelix is built first for technical recruiters and headhunters working software roles where resume review alone is not enough.",
              },
              {
                icon: Mail,
                title: "Will I still need to write outreach manually?",
                desc: "You can edit the draft, but you do not need to start from a blank email after reviewing candidates.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                <item.icon className="mb-4 h-5 w-5 text-sky-600" />
                <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Billing questions answered up front
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {billingFaqs.map((faq) => (
              <div key={faq.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                <div className="flex items-start gap-3">
                  <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{faq.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-200 py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sky-100 via-white to-[#f8fbff]" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-[360px] w-[560px] -translate-x-1/2 rounded-full bg-sky-200/60 blur-[120px]" />
        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Bring your next open role.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
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
            <p className="text-sm text-slate-600">
              Already have an account?{" "}
              <button
                type="button"
                onClick={handleGenericSignIn}
                className="font-medium text-sky-700 hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 text-sm text-slate-600 sm:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Hirelix" width={20} height={20} />
              <span className="font-semibold text-slate-950">Hirelix</span>
            </div>
            <p>AI-powered candidate sourcing from real LinkedIn profiles.</p>
            <p>Hirelix is operated by YieldMirror.</p>
            <p>Built for technical recruiters and headhunters.</p>
            <p>Support: <a className="text-sky-700 hover:text-sky-900" href="mailto:support@hirelix.online">support@hirelix.online</a></p>
            <p>Subscriptions renew automatically until canceled.</p>
            <p>Cancel anytime from billing settings or by emailing support@hirelix.online.</p>
          </div>

          <div className="grid gap-2 sm:justify-self-end sm:text-right">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-slate-950">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
      </div>

      {authModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Close sign in dialog"
            onClick={() => {
              setAuthModalOpen(false);
              setIsSubmitting(false);
            }}
            className="absolute inset-0 bg-[#020817]/82 backdrop-blur-md"
          />

          <div
            data-testid="landing-auth-modal"
            className="relative z-[71] w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/[0.14] bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,_rgba(5,13,25,0.98)_0%,_rgba(8,17,31,0.98)_100%)] shadow-[0_32px_120px_rgba(2,6,23,0.72)]"
          >
            <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="border-b border-white/[0.08] p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
                    <span className="text-xl font-bold tracking-tight text-white">Hirelix</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalOpen(false);
                      setIsSubmitting(false);
                    }}
                    className="rounded-full border border-white/[0.1] p-2 text-slate-300 transition-colors hover:border-white/[0.18] hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                    {isSearchAuthIntent ? "Step 2" : "Welcome back"}
                  </p>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {isSearchAuthIntent
                      ? "One more step to open your shortlist."
                      : "Sign in and keep moving."}
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                    {isSearchAuthIntent
                      ? "Your JD is already saved. After sign in, we&apos;ll take you straight into the real search with this role still attached."
                      : "Continue directly into your next shortlist without losing momentum."}
                  </p>
                </div>

                {isSearchAuthIntent ? (
                  <div className="mt-6 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/68">
                          Your JD is saved
                        </p>
                        <p data-testid="landing-auth-preview-title" className="mt-2 text-lg font-semibold text-white">
                          {modalPreviewTitle}
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-400/12 px-3 py-1 text-[11px] font-medium text-emerald-200">
                        {pendingIntentPath === "sample" ? "Sample role" : "Your JD"}
                      </span>
                    </div>
                    <p className="mt-4 max-h-32 overflow-hidden whitespace-pre-wrap text-sm leading-relaxed text-slate-300/82">
                      {pendingJd}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-200">
                        One more step to open your shortlist
                      </span>
                      <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 font-medium text-slate-100">
                        No card required to start
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/68">
                      What you&apos;ll unlock
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-200">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        <span>Return to your sourcing workspace instantly</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        <span>Run new searches and review saved shortlist work</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        <span>Keep everything synced after you sign in</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-200">
                  <span className="rounded-full border border-emerald-300/18 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-200">
                    {isSearchAuthIntent ? "Shortlist + drafts" : "Continue instantly"}
                  </span>
                  <span className="rounded-full border border-sky-300/18 bg-sky-400/10 px-3 py-1 font-medium text-sky-100">
                    {isSearchAuthIntent ? "Ranked match reasons" : "Real LinkedIn sourcing"}
                  </span>
                  <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 font-medium text-slate-100">
                    {isSearchAuthIntent ? "Outreach draft included" : "Your searches stay synced"}
                  </span>
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <LoginForm
                  variant="modal"
                  redirectPath={pendingRedirectPath}
                  contextTitle={
                    isSearchAuthIntent ? "Continue to your shortlist" : "Continue to your next shortlist"
                  }
                  contextBody={
                    isSearchAuthIntent
                      ? "Use Google or email to keep this exact role attached and move straight into the search."
                      : "Use Google or email to sign in without breaking the flow."
                  }
                  onSuccessStart={() => setIsSubmitting(true)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
