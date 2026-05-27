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
import type { BillingPlanCode } from "@/lib/billing";
import { candidateRows } from "./_components/data";
import { AuthModal } from "./_components/AuthModal";
import { BetaAccessSection } from "./_components/BetaAccessSection";
import { CtaSection } from "./_components/CtaSection";
import { FeaturesSection } from "./_components/FeaturesSection";
import { ObjectionsSection } from "./_components/ObjectionsSection";

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
    let lastInteractionAt = startedAt;
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
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        traffic_source: params.get("traffic_source") || params.get("utm_source"),
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
      lastInteractionAt = Date.now();
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
      if (document.visibilityState === "visible" && now - lastInteractionAt <= 15_000) {
        activeReadSeconds += elapsed;
      }
      lastTickAt = now;
      maxScrollDepth = Math.max(maxScrollDepth, getMaxScrollDepth());
    }, 1000);

    const engagedTimers = [10, 30, 60, 180].map((seconds) =>
      window.setTimeout(() => {
        void sendGrowthEvent(`engaged_${seconds}s`, getSessionMetadata());
      }, seconds * 1000),
    );

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
      for (const timer of engagedTimers) window.clearTimeout(timer);
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
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight text-slate-950">Hirelix</span>
          </div>
          <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 lg:flex">
            <a href="#product" className="transition-colors hover:text-slate-950">Product</a>
            <a href="#workflow" className="transition-colors hover:text-slate-950">Workflow</a>
            <a href="#beta-access" className="transition-colors hover:text-slate-950">Beta access</a>
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
              className="inline-flex items-center justify-center rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(67,56,202,0.22)] transition-all hover:-translate-y-0.5 hover:bg-indigo-800"
            >
              Paste client role
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section id="product" data-growth-section="首屏" className="relative overflow-hidden border-b border-slate-200/80 bg-white pt-28 pb-14 sm:pt-34 sm:pb-20">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              For technical headhunters
            </div>

            <h1 className="mt-6 max-w-[13ch] text-4xl font-extrabold leading-[1.06] tracking-tight text-slate-950 sm:text-[3rem] lg:text-[3.25rem]">
              Explainable shortlists from real client JDs.
            </h1>

            <p className="mt-5 max-w-[30rem] text-base leading-7 text-slate-600">
              Paste the role. Hirelix ranks real profiles, shows fit evidence and risks, then drafts a first message.
            </p>
          </div>

          <div>
            <form id="hero-form" onSubmit={handleSubmit} className="mx-auto max-w-[40rem] text-left lg:mx-0">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.1)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <FileText className="h-4 w-4 text-indigo-700" />
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
                  className="min-h-28 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm leading-6 text-slate-950 placeholder:text-slate-500 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100"
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
                    className="self-start font-semibold text-indigo-700 underline-offset-4 transition-colors hover:text-indigo-900 hover:underline sm:self-auto"
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
                      : "bg-indigo-700 text-white shadow-[0_18px_42px_rgba(67,56,202,0.26)] hover:-translate-y-0.5 hover:bg-indigo-800"
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
                { icon: CheckCircle2, label: "Real profiles" },
                { icon: LockKeyhole, label: "Private JD handoff" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-emerald-600" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {isColdEmailVisitor && (
          <div className="relative mx-auto mt-5 max-w-[96rem] px-5 sm:px-6">
            <div className="grid gap-4 rounded-lg border border-indigo-100 bg-indigo-50/70 p-4 shadow-[0_18px_50px_rgba(67,56,202,0.08)] lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-start">
              <div>
                <p className="text-sm font-semibold text-indigo-950">
                  Want me to run this on one real client role?
                </p>
                <p className="mt-1 text-sm leading-6 text-indigo-900/80">
                  Send a role title or JD snippet. I can run a small beta preview before you spend
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
                        ? "bg-indigo-700 text-white hover:bg-indigo-800"
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
        )}
      </section>

      {sampleShortlistOpen && (
        <section id="sample-shortlist" data-growth-section="产品示例" className="scroll-mt-24 border-b border-slate-200 bg-white py-12">
          <div className="mx-auto max-w-6xl px-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
                  Sample shortlist
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                  What a technical headhunter reviews after a client JD.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  This is a static example. Run your own role when you want Hirelix to build the real shortlist.
                </p>
              </div>
              <button
                type="button"
                onClick={focusHeroJd}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-800"
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

      <FeaturesSection />
      <BetaAccessSection onStart={focusHeroJd} />
      <ObjectionsSection />
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
