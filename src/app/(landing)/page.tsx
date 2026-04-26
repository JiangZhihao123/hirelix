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
import { ArrowRight, FileText, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  ANALYTICS_EVENTS,
  buildAttributionQuery,
  getAnalyticsContextFromBrowser,
  getDefaultLandingExperimentState,
  trackEvent,
  type IntentPath,
} from "@/lib/analytics";
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
    options?: { authIntent?: "search" | "signin"; prefill?: string; redirectPath?: string },
  ) {
    const authIntentValue = options?.authIntent ?? "search";
    const prefill = options?.prefill ?? "";
    const redirectPath =
      options?.redirectPath ??
      buildTrackedHref("/app/search/new", intentPath, { jd: prefill });

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
    <div className="min-h-screen bg-white text-slate-900">
      {/* Nav */}
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

      {/* Hero */}
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

            {/* Mobile CTA */}
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

            {/* Desktop JD form */}
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

          <HeroPreview />
        </div>
      </section>

      <FeaturesSection />
      <HowItWorksSection />
      <ComparisonSection />
      <PricingSection user={user} onSignIn={handleGenericSignIn} />
      <ObjectionsSection />
      <BillingFaqSection />
      <CtaSection
        onTrySample={handleTrySample}
        onSignIn={handleGenericSignIn}
        desktopFooterCtaLabel="Get Shortlist + Outreach"
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setIsSubmitting(false);
        }}
        authIntent={authIntent}
        pendingJd={pendingJd}
        pendingIntentPath={pendingIntentPath}
        pendingRedirectPath={pendingRedirectPath}
        modalPreviewTitle={modalPreviewTitle}
        onSuccessStart={() => setIsSubmitting(true)}
      />
    </div>
  );
}
