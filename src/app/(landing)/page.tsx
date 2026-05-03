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
import { sampleJd } from "./_components/data";
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
  const [authIntent, setAuthIntent] = useState<"search" | "signin">("search");
  const [pendingJd, setPendingJd] = useState("");
  const [pendingIntentPath, setPendingIntentPath] = useState<IntentPath>("direct_jd");
  const [pendingRedirectPath, setPendingRedirectPath] = useState("");
  const [pendingSelectedPlan, setPendingSelectedPlan] = useState<BillingPlanCode | null>(null);
  const hasTrackedInputRef = useRef(false);
  const hasTrackedLandingViewRef = useRef(false);
  const lastAuthTriggerRef = useRef<HTMLElement | null>(null);

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

    if (user) {
      goToSearch(sampleJd, "sample");
      return;
    }
    openAuthModal("sample", { authIntent: "search", prefill: sampleJd });
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
              onClick={handleTrySample}
              data-testid="nav-primary-cta"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)] transition-all hover:-translate-y-0.5 hover:bg-blue-700"
            >
              Get started free
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
              AI recruiting for hiring teams
            </div>

            <h1 className="mt-5 max-w-[13.5ch] text-5xl font-extrabold leading-[0.96] tracking-tight text-slate-950 sm:text-[3.75rem] lg:text-[4.05rem]">
              Paste a JD. Get a ranked{" "}
              <span className="text-blue-600">candidate shortlist.</span>
            </h1>

            <p className="mt-5 max-w-[34rem] text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Hirelix finds relevant profiles, explains why each candidate fits, surfaces public
              evidence when available, and prepares outreach drafts you can edit.
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
                  value={jdText}
                  onChange={(e) => handleJdInput(e.target.value)}
                  placeholder="Paste the full job description here..."
                  rows={3}
                  className="min-h-28 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm leading-6 text-slate-950 placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
                <div className="mt-3 flex flex-col gap-3 text-xs text-slate-600 sm:flex-row sm:items-start sm:justify-between">
                  <span>
                    {wordCount > 0
                      ? canSubmit
                        ? `${wordCount} words ready to analyze`
                        : "Paste at least 50 characters to continue."
                      : "No JD handy? Try a sample:"}
                  </span>
                  <button
                    type="button"
                    onClick={handleTrySample}
                    data-testid="hero-sample-link"
                    className="self-start font-semibold text-blue-700 underline-offset-4 transition-colors hover:text-blue-900 hover:underline sm:self-auto"
                  >
                    Use sample JD
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
                  {isSubmitting ? "Opening your shortlist..." : "Get ranked shortlist"}{" "}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-600">
              {[
                { icon: CheckCircle2, label: "No credit card" },
                { icon: LockKeyhole, label: "Private JD handoff" },
                { icon: ShieldCheck, label: "Evidence-based ranking" },
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
                Built for recruiters, search firms, and founder-led hiring teams
              </p>
              {[
                "Profile-first sourcing",
                "Public evidence when available",
                "Ready-to-edit outreach",
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
                title: "Top matches first",
                desc: "Start with the people most worth reviewing.",
              },
              {
                title: "Explainable fit reasons",
                desc: "Clear evidence for every rank.",
              },
              {
                title: "Public evidence when available",
                desc: "LinkedIn, portfolio, GitHub, and other public signals surfaced carefully.",
              },
              {
                title: "Outreach drafts included",
                desc: "Personalized copy for LinkedIn and email.",
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

      <FeaturesSection />
      <HowItWorksSection />
      <ComparisonSection />
      <PricingSection user={user} onSignIn={handlePlanSignIn} />
      <ObjectionsSection />
      <BillingFaqSection />
      <CtaSection
        onTrySample={handleTrySample}
        onSignIn={handleGenericSignIn}
        desktopFooterCtaLabel="Get ranked shortlist"
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
      />
    </div>
  );
}
