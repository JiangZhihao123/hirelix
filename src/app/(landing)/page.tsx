"use client";

import {
  startTransition,
  type FormEvent,
  type MouseEvent,
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
  FileText,
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
import { getJdLengthBucket } from "@/lib/growth-client";
import {
  ENGAGEMENT_EVENT_THRESHOLDS,
  hasReachedEngagementThreshold,
} from "@/lib/growth-engagement";
import type { BillingPlanCode } from "@/lib/billing";
import { candidateRows } from "./_components/data";
import { AuthModal } from "./_components/AuthModal";
import { CtaSection } from "./_components/CtaSection";
import { FeaturesSection, HowItWorksSection, ResourcesSection } from "./_components/FeaturesSection";
import { ObjectionsSection } from "./_components/ObjectionsSection";
import { PricingSection } from "./_components/PricingSection";

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

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
  const [isColdEmailVisitor, setIsColdEmailVisitor] = useState(false);
  const [previewEmail, setPreviewEmail] = useState("");
  const [previewRole, setPreviewRole] = useState("");
  const [previewRequestStatus, setPreviewRequestStatus] = useState<
    "idle" | "submitting" | "submitted" | "error"
  >("idle");
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const hasTrackedInputRef = useRef(false);
  const hasTrackedLandingViewRef = useRef(false);
  const hasTrackedGrowthInputRef = useRef(false);
  const hasTrackedGrowthSampleRef = useRef(false);
  const lastAuthTriggerRef = useRef<HTMLElement | null>(null);
  const heroJdTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmedJd = jdText.trim();
  const trimmedPreviewEmail = previewEmail.trim();
  const trimmedPreviewRole = previewRole.trim();
  const wordCount = trimmedJd ? trimmedJd.split(/\s+/).filter(Boolean).length : 0;
  const canSubmit = trimmedJd.length >= 50;
  const canSubmitPreviewRequest =
    trimmedPreviewEmail.includes("@") && trimmedPreviewRole.length >= 12;
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
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const attribution = getAnalyticsContextFromBrowser({
      entry_mode: "landing",
      page_variant: experiments.pageVariant,
    });
    const trafficSource = params.get("traffic_source") || params.get("utm_source");
    const isColdEmailVisitor =
      trafficSource === "cold_email" || params.get("utm_medium") === "email";

    let revealColdEmailPanelFrame: number | null = null;
    if (isColdEmailVisitor) {
      revealColdEmailPanelFrame = window.requestAnimationFrame(() => {
        setIsColdEmailVisitor(true);
      });
    }

    const visitorKey = "hirelix.growth.visitor_id";
    const existingVisitorId = window.localStorage.getItem(visitorKey);
    const visitorId = existingVisitorId || crypto.randomUUID();
    if (!existingVisitorId) {
      window.localStorage.setItem(visitorKey, visitorId);
    }

    const existingSessionId = window.__hirelixGrowthIdentity?.session_id;
    const sessionId = existingSessionId || crypto.randomUUID();
    const previousGrowthTrack = window.__hirelixGrowthTrack;
    const previousGrowthIdentity = window.__hirelixGrowthIdentity;
    window.__hirelixGrowthIdentity = {
      visitor_id: visitorId,
      session_id: sessionId,
      invite_code: getCookieValue("hirelix_invite_code"),
    };

    const startedAt = Date.now();
    let activeReadSeconds = 0;
    let lastTickAt = startedAt;
    let interactionCount = 0;
    let maxScrollDepth = 0;
    const seenSections = new Set<string>();
    const common = {
      visitor_id: visitorId,
      session_id: sessionId,
      email_id: params.get("utm_content"),
      batch_id: params.get("batch"),
      recipient: params.get("to"),
      company: params.get("company"),
      page_url: window.location.href,
      referrer: document.referrer,
      metadata: {
        utm_source: attribution.utm_source ?? null,
        utm_medium: attribution.utm_medium ?? null,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content ?? null,
        utm_term: attribution.utm_term ?? null,
        gclid: attribution.gclid ?? null,
        traffic_source: attribution.traffic_source,
        page_variant: params.get("page_variant") || experiments.pageVariant,
        intent_path: params.get("intent_path"),
        invite_code: getCookieValue("hirelix_invite_code"),
        device_type: window.innerWidth < 768 ? "mobile" : "desktop",
      },
    };

    async function sendGrowthEvent(
      eventType: string,
      metadata: Record<string, string | number | boolean | null> = {},
      options: { awaitResponse?: boolean } = {},
    ) {
      const payload = JSON.stringify({
        ...common,
        event_type: eventType,
        metadata: {
          ...common.metadata,
          ...metadata,
        },
      });

      if (!options.awaitResponse && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/growth/landing-event", blob);
        return true;
      }

      try {
        const response = await fetch("/api/growth/landing-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: !options.awaitResponse,
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    function getMaxScrollDepth() {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
    }

    function getSessionMetadata() {
      const pageStaySeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      return {
        page_stay_seconds: pageStaySeconds,
        active_read_seconds: activeReadSeconds,
        max_scroll_depth: Math.max(maxScrollDepth, getMaxScrollDepth()),
        interaction_count: interactionCount,
        section_view_count: seenSections.size,
        visibility_state: document.visibilityState,
      };
    }

    function markInteraction() {
      interactionCount += 1;
      maxScrollDepth = Math.max(maxScrollDepth, getMaxScrollDepth());
    }

    function sendSessionSummary() {
      void sendGrowthEvent("session_summary", getSessionMetadata());
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") sendSessionSummary();
    }

    sendGrowthEvent("page_view", {
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
    });

    const activeTimer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.round((now - lastTickAt) / 1000));
      if (document.visibilityState === "visible") {
        activeReadSeconds += elapsed;
      }
      lastTickAt = now;
      maxScrollDepth = Math.max(maxScrollDepth, getMaxScrollDepth());
    }, 1000);

    const recordedEngagementEvents = new Set<string>();
    const engagementTimer = window.setInterval(() => {
      const sessionMetadata = getSessionMetadata();
      for (const eventType of Object.keys(ENGAGEMENT_EVENT_THRESHOLDS)) {
        if (recordedEngagementEvents.has(eventType)) continue;
        if (!hasReachedEngagementThreshold({
          eventType,
          activeReadSeconds: sessionMetadata.active_read_seconds,
          pageStaySeconds: sessionMetadata.page_stay_seconds,
        })) {
          continue;
        }
        recordedEngagementEvents.add(eventType);
        void sendGrowthEvent(eventType, sessionMetadata);
      }
    }, 1000);

    const interactionEvents = ["pointermove", "pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const eventName of interactionEvents) {
      window.addEventListener(eventName, markInteraction, { passive: true });
    }

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          const sectionId = element.dataset.growthSection || element.id;
          if (!sectionId || seenSections.has(sectionId)) continue;
          seenSections.add(sectionId);
          void sendGrowthEvent("section_view", {
            section_id: sectionId,
            page_stay_seconds: Math.round((Date.now() - startedAt) / 1000),
            max_scroll_depth: getMaxScrollDepth(),
          });
        }
      },
      { threshold: 0.35 },
    );

    window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>("[data-growth-section]").forEach((element) => {
        sectionObserver.observe(element);
      });
    });

    window.addEventListener("pagehide", sendSessionSummary);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    window.__hirelixGrowthTrack = sendGrowthEvent;

    return () => {
      if (revealColdEmailPanelFrame !== null) {
        window.cancelAnimationFrame(revealColdEmailPanelFrame);
      }
      window.clearInterval(activeTimer);
      window.clearInterval(engagementTimer);
      for (const eventName of interactionEvents) {
        window.removeEventListener(eventName, markInteraction);
      }
      sectionObserver.disconnect();
      window.removeEventListener("pagehide", sendSessionSummary);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sendSessionSummary();
      if (window.__hirelixGrowthTrack === sendGrowthEvent) {
        window.__hirelixGrowthTrack = previousGrowthTrack;
      }
      if (window.__hirelixGrowthIdentity?.session_id === sessionId) {
        window.__hirelixGrowthIdentity = previousGrowthIdentity;
      }
    };
  }, [experiments.pageVariant]);

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
    entryMode: "landing" | "signin" | "free_trial" | "workspace" = "landing",
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
      utmSource: context.utm_source,
      utmMedium: context.utm_medium,
      utmContent: context.utm_content,
      utmTerm: context.utm_term,
      gclid: context.gclid,
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
    window.__hirelixGrowthTrack?.("signin_view", {
      intent_path: intentPath,
      has_prefilled_jd: Boolean(prefill),
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
    router.push(buildTrackedHref("/app", "signin", undefined, "signin"));
  }

  function handleHomeReload(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.location.assign("/");
  }

  function handleTryForFree() {
    const href = buildTrackedHref("/app/search/new", "signin", undefined, "free_trial");
    trackEvent(ANALYTICS_EVENTS.heroPrimaryCtaClick, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: "free_trial",
        page_variant: experiments.pageVariant,
        intent_path: "signin",
      }),
      cta_surface: "nav_try_for_free",
    });
    window.__hirelixGrowthTrack?.("try_for_free_click", {
      surface: "nav",
      intent_path: "signin",
    });
    router.push(href);
  }

  function handlePricingStart() {
    const href = buildTrackedHref("/app/search/new", "signin", undefined, "free_trial");
    trackEvent(ANALYTICS_EVENTS.pricingPlanSelect, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: "free_trial",
        page_variant: experiments.pageVariant,
        intent_path: "signin",
      }),
      plan_code: "free",
      pricing_surface: "landing",
    });
    window.__hirelixGrowthTrack?.("pricing_plan_select", {
      plan_code: "free",
      surface: "landing_pricing",
    });
    router.push(href);
  }

  function handlePricingPlanSelect(planCode: Exclude<BillingPlanCode, "free">) {
    const href = buildTrackedHref(
      "/app/settings",
      "signin",
      { plan: planCode, section: "billing" },
      "signin",
    );
    trackEvent(ANALYTICS_EVENTS.pricingPlanSelect, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: "signin",
        page_variant: experiments.pageVariant,
        intent_path: "signin",
      }),
      plan_code: planCode,
      pricing_surface: "landing",
    });
    window.__hirelixGrowthTrack?.("pricing_plan_select", {
      plan_code: planCode,
      surface: "landing_pricing",
    });
    router.push(`${href}#billing`);
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
    window.__hirelixGrowthTrack?.("hero_submit_attempt", {
      jd_length_bucket: getJdLengthBucket(trimmedJd),
      is_authenticated: Boolean(user),
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
    if (!hasTrackedGrowthSampleRef.current) {
      hasTrackedGrowthSampleRef.current = true;
      window.__hirelixGrowthTrack?.("sample_view", {
        sample_name: "senior_software_engineer",
      });
    }

    setSampleShortlistOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("sample-pool")?.scrollIntoView({
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

  function handlePreviewRequestClick() {
    window.__hirelixGrowthTrack?.("preview_request_click", {
      surface: "cold_email_conversion_panel",
    });
  }

  async function handlePreviewRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitPreviewRequest || previewRequestStatus === "submitting") return;

    handlePreviewRequestClick();
    setPreviewRequestStatus("submitting");
    const recorded = await window.__hirelixGrowthTrack?.("preview_request_submit", {
      surface: "cold_email_conversion_panel",
      reply_email: trimmedPreviewEmail.slice(0, 160),
      role_preview: trimmedPreviewRole.slice(0, 500),
      role_length: trimmedPreviewRole.length,
    }, { awaitResponse: true });
    if (recorded) {
      setPreviewSubmitted(true);
      setPreviewRequestStatus("submitted");
      return;
    }

    setPreviewSubmitted(false);
    setPreviewRequestStatus("error");
  }

  function handleBookFeedbackClick() {
    window.__hirelixGrowthTrack?.("book_feedback_click", {
      surface: "cold_email_conversion_panel",
    });
  }

  function handleReplyEmailClick() {
    window.__hirelixGrowthTrack?.("reply_email_click", {
      surface: "cold_email_conversion_panel",
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
    if (!hasTrackedGrowthInputRef.current && value.trim().length > 0) {
      hasTrackedGrowthInputRef.current = true;
      window.__hirelixGrowthTrack?.("hero_input_start", {
        jd_length_bucket: getJdLengthBucket(value),
      });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[96rem] items-center justify-between px-5 sm:px-6">
          <Link href="/" onClick={handleHomeReload} className="flex items-center gap-2.5 transition-opacity hover:opacity-80" aria-label="Hirelix home">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight text-slate-950">Hirelix</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 lg:flex">
            <Link href="/" onClick={handleHomeReload} className="transition-colors hover:text-slate-950">Home</Link>
            <a href="#how-it-works" className="transition-colors hover:text-slate-950">How it works</a>
            <a href="#features" className="transition-colors hover:text-slate-950">Features</a>
            <a href="#pricing" className="transition-colors hover:text-slate-950">Pricing</a>
            <a href="#resources" className="transition-colors hover:text-slate-950">Resources</a>
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
              onClick={handleTryForFree}
              data-testid="nav-primary-cta"
              className="inline-flex items-center justify-center rounded-lg border border-slate-950 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition-all hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Try for free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="product"
        data-growth-section="首屏"
        className="relative flex min-h-[calc(100svh-2.5rem)] items-center overflow-hidden border-b border-slate-200 bg-slate-100 pt-24 pb-8 sm:pt-28 sm:pb-10"
      >
        <Image
          src="/landing/hirelix-hero-recruiter-v1.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[34%_center] lg:object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-white/68 lg:bg-white/28" />
        <div className="relative mx-auto w-full max-w-[96rem] translate-y-16 px-5 sm:px-6 lg:translate-y-5 lg:px-10">
          <div className="ml-auto max-w-3xl lg:translate-x-8 lg:text-right">
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              For technical headhunters
            </div>

            <h1 className="mt-4 text-4xl font-extrabold leading-[1.06] text-slate-950 sm:text-[3rem] lg:text-[3.5rem]">
              A day of technical candidate research, done in{" "}
              <span className="text-indigo-700">15 minutes.</span>
            </h1>

            <p className="mt-4 ml-auto max-w-2xl text-base leading-7 text-slate-700">
              Hirelix sources, ranks, and researches real profiles from the client JD, with fit evidence and outreach drafts ready to review.
            </p>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:justify-end">
              <button
                type="button"
                onClick={handleTrySample}
                data-testid="hero-sample-link"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(15,23,42,0.2)] transition-all hover:-translate-y-0.5 hover:bg-slate-800"
              >
                View a real candidate pool
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={focusHeroJd}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white/88 px-5 text-sm font-semibold text-slate-950 backdrop-blur-sm transition-colors hover:bg-white"
              >
                Try with your JD
              </button>
            </div>
          </div>

        </div>
      </section>

      <section data-growth-section="开始试用" className="border-b border-slate-200 bg-white py-9 sm:py-11">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 sm:px-6 lg:grid-cols-[minmax(14rem,0.55fr)_minmax(0,1.45fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase text-indigo-700">Your client role</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Try it with the JD already on your desk.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">One real role preview before you pay.</p>
          </div>

          <form id="hero-form" onSubmit={handleSubmit} className="min-w-0">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <FileText className="h-4 w-4 text-indigo-700" />
                  Paste a job description
                </div>
                {wordCount > 0 ? <span className="text-xs font-medium text-emerald-700">{wordCount} words</span> : null}
              </div>
              <textarea
                ref={heroJdTextareaRef}
                value={jdText}
                onChange={(e) => handleJdInput(e.target.value)}
                placeholder="Paste the full client job description here..."
                rows={2}
                className="min-h-24 w-full resize-none border-0 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-500 focus:bg-slate-50"
              />
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-slate-600">
                  {wordCount > 0
                    ? canSubmit
                      ? `${wordCount} words ready to analyze`
                      : "Paste at least 50 characters to continue."
                    : "Your JD stays ready through sign in."}
                </span>
                <button
                  type="submit"
                  disabled={heroPrimaryDisabled}
                  data-testid="hero-primary-cta"
                  aria-busy={isSubmitting}
                  className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-all ${
                    heroPrimaryDisabled
                      ? "cursor-not-allowed bg-slate-200 text-slate-500"
                      : "bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)] hover:-translate-y-0.5 hover:bg-slate-800"
                  }`}
                >
                  {isSubmitting ? "Opening your candidate pool..." : "Build candidate pool"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {isColdEmailVisitor && (
        <section className="border-b border-slate-200 bg-white py-5">
          <div className="mx-auto max-w-[96rem] px-5 sm:px-6">
            <div className="grid gap-4 rounded-lg border border-indigo-100 bg-indigo-50/70 p-4 shadow-[0_18px_50px_rgba(67,56,202,0.08)] lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-start">
              <div>
                <p className="text-sm font-semibold text-indigo-950">
                  Want me to run this on one real client role?
                </p>
                <p className="mt-1 text-sm leading-6 text-indigo-900/80">
                  Send a role title or JD snippet. I can run a small role preview before you spend
                  time setting anything up.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="mailto:jzh_spring@163.com?subject=Hirelix%2010%20minute%20feedback%20chat&body=Hi%20Noah%2C%0A%0AI%20can%20do%20a%20short%20feedback%20chat%20about%20Hirelix.%0A%0ATimes%20that%20work%3A%0A"
                    onClick={handleBookFeedbackClick}
                    className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-white px-3.5 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:text-indigo-900"
                  >
                    Book 10 min feedback
                  </a>
                  <a
                    href="mailto:jzh_spring@163.com?subject=Re%3A%20Hirelix"
                    onClick={handleReplyEmailClick}
                    className="inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:text-indigo-900 hover:underline"
                  >
                    Reply by email
                  </a>
                </div>
              </div>

              <form onSubmit={handlePreviewRequestSubmit} className="grid gap-2">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <input
                    type="email"
                    value={previewEmail}
                    onChange={(event) => {
                      setPreviewEmail(event.target.value);
                      setPreviewSubmitted(false);
                      setPreviewRequestStatus("idle");
                    }}
                    placeholder="Your work email"
                    className="min-h-11 rounded-lg border border-indigo-100 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                    aria-label="Work email for preview reply"
                  />
                  <input
                    type="text"
                    value={previewRole}
                    onChange={(event) => {
                      setPreviewRole(event.target.value);
                      setPreviewSubmitted(false);
                      setPreviewRequestStatus("idle");
                    }}
                    placeholder="Role title or JD snippet"
                    className="min-h-11 rounded-lg border border-indigo-100 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                    aria-label="Role title or job description snippet"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-indigo-900/70" aria-live="polite">
                    {previewRequestStatus === "submitting"
                      ? "Sending request..."
                      : previewSubmitted
                        ? "Request noted. I will reply with the next step."
                        : previewRequestStatus === "error"
                          ? "Could not record this here. Please use Reply by email instead."
                          : "A short title is enough; a JD snippet is better."}
                  </p>
                  <button
                    type="submit"
                    disabled={!canSubmitPreviewRequest || previewRequestStatus === "submitting"}
                    aria-busy={previewRequestStatus === "submitting"}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      canSubmitPreviewRequest && previewRequestStatus !== "submitting"
                        ? "bg-slate-950 text-white hover:bg-slate-800"
                        : "cursor-not-allowed bg-indigo-100 text-indigo-400"
                    }`}
                  >
                    {previewRequestStatus === "submitting" ? "Sending..." : "Send a JD for preview"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}

      {sampleShortlistOpen && (
        <section id="sample-pool" data-growth-section="产品示例" className="scroll-mt-24 border-b border-slate-200 bg-white py-12">
          <div className="mx-auto max-w-6xl px-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
                  Sample candidate pool
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  What a technical headhunter reviews after a client JD.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  This is a static example. Run your own role when you want Hirelix to build the real ranked candidate pool.
                </p>
              </div>
              <button
                type="button"
                onClick={focusHeroJd}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Build candidate pool
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
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-950 text-xs font-bold text-white">
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
                        ? "bg-indigo-50 text-indigo-700"
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

      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection onStart={handlePricingStart} onSelectPlan={handlePricingPlanSelect} />
      <ResourcesSection onStart={focusHeroJd} />
      <ObjectionsSection />
      <CtaSection
        onTrySample={handleTrySample}
        onSignIn={handleGenericSignIn}
        desktopFooterCtaLabel="Build candidate pool"
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
