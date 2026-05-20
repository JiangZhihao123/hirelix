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
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  ANALYTICS_EVENTS,
  buildAttributionQuery,
  getAnalyticsContextFromBrowser,
  getDefaultLandingExperimentState,
  trackEvent,
  type IntentPath,
} from "@/lib/analytics";
import type { BillingPlanCode } from "@/lib/billing";
import { candidateRows } from "./_components/data";
import { AuthModal } from "./_components/AuthModal";
import { BillingFaqSection } from "./_components/BillingFaqSection";
import { ComparisonSection } from "./_components/ComparisonSection";
import { CtaSection } from "./_components/CtaSection";
import { FeaturesSection } from "./_components/FeaturesSection";
import { HeroPreview } from "./_components/HeroPreview";
import { HowItWorksSection } from "./_components/HowItWorksSection";
import { ObjectionsSection } from "./_components/ObjectionsSection";
import { PricingSection } from "./_components/PricingSection";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const experiments = getDefaultLandingExperimentState();
  const [jdText, setJdText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [sampleShortlistOpen, setSampleShortlistOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<"search" | "signin">("search");
  const [pendingJd, setPendingJd] = useState("");
  const [pendingIntentPath, setPendingIntentPath] = useState<IntentPath>("direct_jd");
  const [pendingRedirectPath, setPendingRedirectPath] = useState("");
  const [pendingSelectedPlan, setPendingSelectedPlan] = useState<BillingPlanCode | null>(null);
  const hasTrackedInputRef = useRef(false);
  const hasTrackedLandingViewRef = useRef(false);
  const lastAuthTriggerRef = useRef<HTMLElement | null>(null);
  const heroJdTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmedJd = jdText.trim();
  const wordCount = trimmedJd ? trimmedJd.split(/\s+/).filter(Boolean).length : 0;
  const canSubmit = trimmedJd.length >= 50;
  const heroPrimaryDisabled = !canSubmit || isSubmitting;
  const modalPreviewTitle = useMemo(() => {
    const firstMeaningfulLine = pendingJd
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    return firstMeaningfulLine || "Selected job description";
  }, [pendingJd]);

  useEffect(() => {
    router.prefetch("/app/search/new");

    if (!hasTrackedLandingViewRef.current) {
      hasTrackedLandingViewRef.current = true;
      trackEvent(ANALYTICS_EVENTS.landingView, {
        ...getAnalyticsContextFromBrowser({
          entry_mode: "landing",
          page_variant: experiments.pageVariant,
        }),
        headline_variant: experiments.headline,
        cta_variant: experiments.cta,
        proof_variant: experiments.proof,
      });
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
      router.push(buildTrackedHref("/app/search/new", intentPath, { jd: prefill }));
    });
  }

  function openAuthModal(
    intentPath: IntentPath,
    options?: {
      authIntent?: "search" | "signin";
      prefill?: string;
      redirectPath?: string;
      selectedPlan?: BillingPlanCode;
    },
  ) {
    const authIntentValue = options?.authIntent ?? "search";
    const prefill = options?.prefill ?? "";
    const redirectPath =
      options?.redirectPath ??
      buildTrackedHref("/app/search/new", intentPath, { jd: prefill });
    const selectedPlan = options?.selectedPlan ?? null;

    lastAuthTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAuthIntent(authIntentValue);
    setPendingJd(prefill);
    setPendingIntentPath(intentPath);
    setPendingRedirectPath(redirectPath);
    setPendingSelectedPlan(selectedPlan);
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
      selected_plan: selectedPlan,
    });
  }

  function closeAuthModal() {
    setAuthModalOpen(false);
    setIsSubmitting(false);
    window.requestAnimationFrame(() => {
      lastAuthTriggerRef.current?.focus();
      lastAuthTriggerRef.current = null;
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

  function handlePlanSignIn(planCode: BillingPlanCode) {
    trackEvent(ANALYTICS_EVENTS.pricingPlanSelect, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: "landing",
        page_variant: experiments.pageVariant,
        intent_path: "signin",
      }),
      selected_plan: planCode,
      pricing_surface: "landing_pricing",
    });

    const selectedPlanQuery = { selected_plan: planCode, billing_intent: "plan" };
    const redirectPath =
      planCode === "free"
        ? buildTrackedHref("/app/search/new", "signin", selectedPlanQuery, "landing")
        : `${buildTrackedHref("/app/settings", "signin", selectedPlanQuery, "landing")}#billing`;

    openAuthModal("signin", {
      authIntent: "signin",
      redirectPath,
      selectedPlan: planCode,
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
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
    openAuthModal("direct_jd", { authIntent: "search", prefill: trimmedJd });
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
    trackEvent(ANALYTICS_EVENTS.sampleShortlistView, {
      ...eventContext,
      sample_name: "senior_software_engineer",
    });

    setSampleShortlistOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("sample-shortlist")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function focusHeroJd() {
    document.getElementById("hero-form")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.requestAnimationFrame(() => heroJdTextareaRef.current?.focus());
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

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-slate-950">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-[#fbfaf7]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[96rem] items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight text-slate-950">Hirelix</span>
          </div>
          <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 lg:flex">
            <a href="#product" className="transition-colors hover:text-slate-950">Product</a>
            <a href="#how-it-works" className="transition-colors hover:text-slate-950">How it works</a>
            <a href="#pricing" className="transition-colors hover:text-slate-950">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-slate-950">FAQ</a>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleGenericSignIn}
              className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-950 sm:inline-flex"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={focusHeroJd}
              data-testid="nav-primary-cta"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)] transition-all hover:-translate-y-0.5 hover:bg-blue-700"
            >
              Paste client role
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section id="product" className="relative overflow-hidden border-b border-slate-200/80 pt-24 pb-10 sm:pt-28 sm:pb-12">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="relative mx-auto grid max-w-[96rem] gap-8 px-5 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              For independent technical headhunters
            </div>

            <h1 className="mt-5 max-w-[13.5ch] text-5xl font-extrabold leading-[0.96] tracking-tight text-slate-950 sm:text-[3.75rem] lg:text-[4.05rem]">
              Turn a client JD into an{" "}
              <span className="text-blue-600">evidence-backed shortlist.</span>
            </h1>

            <p className="mt-5 max-w-[34rem] text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Save hours of technical profile review. Hirelix screens candidates, explains fit
              and risks, and prepares outreach-ready shortlists.
            </p>

            <form id="hero-form" onSubmit={handleSubmit} className="mt-6 max-w-[35rem]">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.11)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <FileText className="h-4 w-4 text-blue-600" />
                    Paste a job description
                  </div>
                  <span className="hidden text-xs font-medium text-emerald-700 sm:inline">
                    {wordCount > 0 ? `${wordCount} words ready` : "No setup required"}
                  </span>
                </div>
                <textarea
                  ref={heroJdTextareaRef}
                  value={jdText}
                  onChange={(e) => handleJdInput(e.target.value)}
                  placeholder="Paste the full client job description here..."
                  rows={3}
                  className="min-h-28 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm leading-6 text-slate-950 placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
                <div className="mt-3 flex flex-col gap-3 text-xs text-slate-600 sm:flex-row sm:items-start sm:justify-between">
                  <span>
                    {wordCount > 0
                      ? canSubmit
                        ? `${wordCount} words ready to analyze`
                        : "Paste at least 50 characters to continue."
                      : "No client role handy? View a sample:"}
                  </span>
                  <button
                    type="button"
                    onClick={handleTrySample}
                    data-testid="hero-sample-link"
                    className="self-start font-semibold text-blue-700 underline-offset-4 transition-colors hover:text-blue-900 hover:underline sm:self-auto"
                  >
                    View sample shortlist
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={heroPrimaryDisabled}
                  data-testid="hero-primary-cta"
                  aria-busy={isSubmitting}
                  className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-base font-semibold transition-all ${
                    heroPrimaryDisabled
                      ? "!cursor-not-allowed bg-slate-200 text-slate-500 shadow-none"
                      : "bg-blue-600 text-white shadow-[0_18px_42px_rgba(37,99,235,0.26)] hover:-translate-y-0.5 hover:bg-blue-700"
                  }`}
                >
                  {isSubmitting ? "Opening your shortlist..." : "Build shortlist"}{" "}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-600">
              {[
                { icon: CheckCircle2, label: "No credit card" },
                { icon: LockKeyhole, label: "Private JD handoff" },
                { icon: ShieldCheck, label: "Evidence-backed decisions" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-emerald-600" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <HeroPreview onSignInClick={handleGenericSignIn} />
        </div>

        <div className="relative mx-auto mt-8 max-w-[96rem] px-5 sm:px-6">
          <div className="border-y border-slate-200 py-5">
            <div className="grid gap-3 text-sm text-slate-500 sm:grid-cols-[1.05fr_1fr_1fr_1fr] sm:items-center">
              <p className="font-semibold uppercase tracking-[0.16em] text-slate-400">
                Built for independent technical headhunters
              </p>
              {[
                "Fewer profiles to review",
                "Faster first outreach",
                "Client-ready shortlist",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 sm:justify-end">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative mx-auto mt-7 max-w-[96rem] px-5 sm:px-6">
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] sm:grid-cols-4">
            {[
              {
                title: "Reach out first",
                desc: "Start with the profiles most worth a first message.",
              },
              {
                title: "Worth reviewing",
                desc: "Keep credible backups without reading every profile.",
              },
              {
                title: "Risks to verify",
                desc: "Protect your reputation before a client submission.",
              },
              {
                title: "Outreach + export",
                desc: "Unlock contact actions and client-ready handoff when useful.",
              },
            ].map((item) => (
              <div key={item.title} className="border-slate-200 py-2 sm:border-l sm:first:border-l-0 sm:px-5">
                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {sampleShortlistOpen && (
        <section id="sample-shortlist" className="scroll-mt-24 border-b border-slate-200 bg-white py-14">
          <div className="mx-auto max-w-[96rem] px-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                  Sample shortlist
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  What a solo headhunter reviews after a client JD.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  This is a static example. Run your own role when you want Hirelix to build the real shortlist.
                </p>
              </div>
              <button
                type="button"
                onClick={focusHeroJd}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Paste a real client role
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(0,1.1fr)_8rem_minmax(0,1.4fr)_10rem] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 max-lg:hidden">
                <span>Candidate</span>
                <span>Decision</span>
                <span>Why / risk</span>
                <span>Paid action</span>
              </div>
              {candidateRows.map((candidate, index) => (
                <div
                  key={candidate.name}
                  className="grid gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.1fr)_8rem_minmax(0,1.4fr)_10rem] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <p className="truncate text-sm font-semibold text-slate-950">{candidate.name}</p>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">{candidate.role}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{candidate.location}</p>
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    index === 0
                      ? "bg-emerald-50 text-emerald-700"
                      : index === 1
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                  }`}>
                    {index === 0 ? "Reach out first" : index === 1 ? "Worth reviewing" : "Risk to verify"}
                  </span>
                  <div className="space-y-1 text-xs leading-5 text-slate-600">
                    <p className="font-medium text-slate-800">{candidate.matchReasons[0]}</p>
                    <p className="text-amber-700">{candidate.riskReasons[0]}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">Contact unlock</span>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">Export</span>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">Client brief</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <FeaturesSection />
      <HowItWorksSection />
      <ComparisonSection />
      <PricingSection user={user} onSignIn={handlePlanSignIn} />
      <ObjectionsSection />
      <BillingFaqSection />
      <CtaSection
        onTrySample={handleTrySample}
        onSignIn={handleGenericSignIn}
        desktopFooterCtaLabel="Build shortlist"
      />

      <AuthModal
        open={authModalOpen}
        onClose={closeAuthModal}
        authIntent={authIntent}
        pendingJd={pendingJd}
        pendingIntentPath={pendingIntentPath}
        pendingRedirectPath={pendingRedirectPath}
        pendingSelectedPlan={pendingSelectedPlan}
        modalPreviewTitle={modalPreviewTitle}
        onSuccessStart={() => setIsSubmitting(true)}
        onFailure={() => setIsSubmitting(false)}
      />
    </div>
  );
}
