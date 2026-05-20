type SearchParamsLike = {
  get: (name: string) => string | null;
};

type AnalyticsValue = string | number | boolean | null | undefined;

const LANDING_EXPERIMENT_STORAGE_KEY = "hirelix.landing-experiments.v1";

export const ANALYTICS_EVENTS = {
  landingView: "landing_view",
  heroPrimaryCtaClick: "hero_primary_cta_click",
  sampleCtaClick: "sample_cta_click",
  heroJdInputStart: "hero_jd_input_start",
  heroJdSubmitAttempt: "hero_jd_submit_attempt",
  signinView: "signin_view",
  signupSuccess: "signup_success",
  emailOtpRequested: "email_otp_requested",
  emailOtpVerified: "email_otp_verified",
  emailOtpFailed: "email_otp_failed",
  dashboardView: "dashboard_view",
  dashboardPrimaryContextShown: "dashboard_primary_context_shown",
  primaryProductCtaClick: "primary_product_cta_click",
  newSearchView: "new_search_view",
  searchConfirmationView: "search_confirmation_view",
  searchJobEnqueued: "search_job_enqueued",
  searchProcessingView: "search_processing_view",
  processingReassuranceView: "processing_reassurance_view",
  searchTaskView: "search_task_view",
  searchBriefReadyView: "search_brief_ready_view",
  activeSearchesView: "active_searches_view",
  planStatusCardView: "plan_status_card_view",
  planStatusCardClick: "plan_status_card_click",
  searchNotificationEmailSent: "search_notification_email_sent",
  searchNotificationEmailFailed: "search_notification_email_failed",
  searchReturnedAfterNotification: "search_returned_after_notification",
  searchResultsView: "search_results_view",
  searchDone: "search_done",
  searchCreateSuccess: "search_create_success",
  candidateExpand: "candidate_expand",
  upgradeCtaClick: "upgrade_cta_click",
  upgradeValueExposed: "upgrade_value_exposed",
  resultsUnlockCtaViewed: "results_unlock_cta_viewed",
  resultsUnlockCtaClicked: "results_unlock_cta_clicked",
  retrySearchClick: "retry_search_click",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type DeviceType = "desktop" | "mobile";
export type IntentPath = "sample" | "direct_jd" | "signin" | "unknown";
export type EntryMode = "landing" | "signin" | "workspace";

export type LandingHeadlineVariant = "speed" | "results";
export type LandingCtaVariant = "paste_jd" | "find_candidates";
export type LandingProofVariant = "speed_first" | "credibility_first";

export type LandingExperimentState = {
  headline: LandingHeadlineVariant;
  cta: LandingCtaVariant;
  proof: LandingProofVariant;
  pageVariant: string;
};

export type AnalyticsContext = {
  device_type: DeviceType;
  traffic_source: string;
  utm_campaign: string;
  page_variant: string;
  intent_path: IntentPath;
  entry_mode: EntryMode;
};

type TrackEventPayload = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

const DEFAULT_LANDING_EXPERIMENTS: Omit<LandingExperimentState, "pageVariant"> = {
  headline: "speed",
  cta: "find_candidates",
  proof: "speed_first",
};

const DEFAULT_LANDING_EXPERIMENT_STATE: LandingExperimentState = {
  ...DEFAULT_LANDING_EXPERIMENTS,
  pageVariant: buildPageVariant(DEFAULT_LANDING_EXPERIMENTS),
};

let landingExperimentCache: LandingExperimentState | null = DEFAULT_LANDING_EXPERIMENT_STATE;

function buildPageVariant({
  headline,
  cta,
  proof,
}: Omit<LandingExperimentState, "pageVariant">) {
  return `headline_${headline}__cta_${cta}__proof_${proof}`;
}

export function getDefaultLandingExperimentState(): LandingExperimentState {
  return DEFAULT_LANDING_EXPERIMENT_STATE;
}

export function getLandingExperimentStateFromBrowser(): LandingExperimentState {
  if (typeof window === "undefined") {
    return getDefaultLandingExperimentState();
  }

  if (landingExperimentCache) {
    return landingExperimentCache;
  }

  window.localStorage.setItem(
    LANDING_EXPERIMENT_STORAGE_KEY,
    JSON.stringify(DEFAULT_LANDING_EXPERIMENTS),
  );

  landingExperimentCache = DEFAULT_LANDING_EXPERIMENT_STATE;

  return landingExperimentCache;
}

function getDeviceType(): DeviceType {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 768 ? "mobile" : "desktop";
}

function normalizeIntentPath(value: string | null): IntentPath {
  if (value === "sample" || value === "direct_jd" || value === "signin") {
    return value;
  }

  return "unknown";
}

function normalizeEntryMode(value: string | null): EntryMode {
  if (value === "landing" || value === "signin") {
    return value;
  }

  return "workspace";
}

function detectTrafficSource(params: SearchParamsLike, referrer = "") {
  const explicit = params.get("traffic_source");
  if (explicit) return explicit;

  const utmSource = params.get("utm_source")?.toLowerCase() || "";
  const utmMedium = params.get("utm_medium")?.toLowerCase() || "";

  if (
    params.get("gclid") ||
    (utmSource === "google" &&
      ["cpc", "ppc", "paid", "paid-search"].includes(utmMedium))
  ) {
    return "google_ads";
  }

  if (utmSource) {
    return utmSource;
  }

  if (referrer.includes("google.")) return "google_organic";
  if (referrer.includes("linkedin.")) return "linkedin";
  if (referrer.includes("reddit.")) return "reddit";
  if (referrer) return "referral";

  return "direct";
}

export function getAnalyticsContextFromParams(
  params: SearchParamsLike,
  overrides: Partial<AnalyticsContext> = {},
  referrer = "",
): AnalyticsContext {
  return {
    device_type: overrides.device_type ?? getDeviceType(),
    traffic_source:
      overrides.traffic_source ?? detectTrafficSource(params, referrer),
    utm_campaign: overrides.utm_campaign ?? params.get("utm_campaign") ?? "none",
    page_variant:
      overrides.page_variant ?? params.get("page_variant") ?? "unassigned",
    intent_path:
      overrides.intent_path ?? normalizeIntentPath(params.get("intent_path")),
    entry_mode:
      overrides.entry_mode ?? normalizeEntryMode(params.get("entry")),
  };
}

export function getAnalyticsContextFromBrowser(
  overrides: Partial<AnalyticsContext> = {},
): AnalyticsContext {
  if (typeof window === "undefined") {
    return {
      device_type: "desktop",
      traffic_source: "direct",
      utm_campaign: "none",
      page_variant: overrides.page_variant ?? "unassigned",
      intent_path: overrides.intent_path ?? "unknown",
      entry_mode: overrides.entry_mode ?? "workspace",
    };
  }

  return getAnalyticsContextFromParams(
    new URLSearchParams(window.location.search),
    overrides,
    document.referrer,
  );
}

export function buildAttributionQuery(options: {
  intentPath: IntentPath;
  pageVariant: string;
  trafficSource: string;
  utmCampaign: string;
  entryMode?: EntryMode;
  extra?: Record<string, string | number>;
}) {
  const params = new URLSearchParams();
  params.set("intent_path", options.intentPath);
  params.set("page_variant", options.pageVariant);
  params.set("traffic_source", options.trafficSource);
  params.set("utm_campaign", options.utmCampaign);
  params.set("entry", options.entryMode ?? "workspace");

  for (const [key, value] of Object.entries(options.extra ?? {})) {
    params.set(key, String(value));
  }

  return params;
}

function compactPayload(payload: TrackEventPayload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

export function trackEvent(
  eventName: AnalyticsEventName,
  payload: TrackEventPayload = {},
) {
  if (typeof window === "undefined") return;

  const safePayload = compactPayload(payload);

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, safePayload);
    return;
  }

  window.dataLayer?.push({
    event: eventName,
    ...safePayload,
  });
}
