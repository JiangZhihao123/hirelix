type SearchParamsLike = {
  get: (name: string) => string | null;
};

type AnalyticsValue = string | number | boolean | null | undefined;

const LANDING_EXPERIMENT_STORAGE_KEY = "hirelix.landing-experiments.v1";
const ATTRIBUTION_STORAGE_KEY = "hirelix.growth.attribution.v1";

const ATTRIBUTION_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
] as const;

export const ANALYTICS_EVENTS = {
  landingView: "landing_view",
  heroPrimaryCtaClick: "hero_primary_cta_click",
  sampleCtaClick: "sample_cta_click",
  heroJdInputStart: "hero_jd_input_start",
  heroJdSubmitAttempt: "hero_jd_submit_attempt",
  sampleShortlistView: "sample_shortlist_view",
  signinView: "signin_view",
  signupSuccess: "signup_success",
  passwordSignin: "password_signin",
  emailOtpRequested: "email_otp_requested",
  emailOtpVerified: "email_otp_verified",
  emailOtpFailed: "email_otp_failed",
  dashboardView: "dashboard_view",
  dashboardPrimaryContextShown: "dashboard_primary_context_shown",
  primaryProductCtaClick: "primary_product_cta_click",
  newSearchView: "new_search_view",
  briefConfirmationView: "brief_confirmation_view",
  sourcingBriefGenerated: "sourcing_brief_generated",
  briefLaunchClick: "brief_launch_click",
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
  resultsSummaryView: "results_summary_view",
  searchDone: "search_done",
  searchCreateSuccess: "search_create_success",
  candidateExpand: "candidate_expand",
  upgradeCtaClick: "upgrade_cta_click",
  upgradeValueExposed: "upgrade_value_exposed",
  resultsUnlockCtaViewed: "results_unlock_cta_viewed",
  resultsUnlockCtaClicked: "results_unlock_cta_clicked",
  contactUnlockGateView: "contact_unlock_gate_view",
  clientBriefGateView: "client_brief_gate_view",
  pricingPlanSelect: "pricing_plan_select",
  checkoutStart: "checkout_start",
  checkoutSuccess: "checkout_success",
  checkoutError: "checkout_error",
  retrySearchClick: "retry_search_click",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type DeviceType = "desktop" | "mobile";
export type IntentPath = "sample" | "direct_jd" | "signin" | "unknown";
export type EntryMode = "landing" | "signin" | "free_trial" | "workspace";

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
  utm_source?: string;
  utm_medium?: string;
  utm_campaign: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  page_variant: string;
  intent_path: IntentPath;
  entry_mode: EntryMode;
};

type TrackEventPayload = Record<string, AnalyticsValue>;

const INTERNAL_PRODUCT_EVENTS = new Set<AnalyticsEventName>([
  ANALYTICS_EVENTS.sourcingBriefGenerated,
  ANALYTICS_EVENTS.searchProcessingView,
  ANALYTICS_EVENTS.searchResultsView,
  ANALYTICS_EVENTS.resultsSummaryView,
  ANALYTICS_EVENTS.searchDone,
  ANALYTICS_EVENTS.candidateExpand,
  ANALYTICS_EVENTS.upgradeCtaClick,
  ANALYTICS_EVENTS.upgradeValueExposed,
  ANALYTICS_EVENTS.resultsUnlockCtaViewed,
  ANALYTICS_EVENTS.resultsUnlockCtaClicked,
  ANALYTICS_EVENTS.contactUnlockGateView,
  ANALYTICS_EVENTS.clientBriefGateView,
  ANALYTICS_EVENTS.pricingPlanSelect,
  ANALYTICS_EVENTS.checkoutStart,
  ANALYTICS_EVENTS.checkoutSuccess,
  ANALYTICS_EVENTS.checkoutError,
  ANALYTICS_EVENTS.retrySearchClick,
  ANALYTICS_EVENTS.planStatusCardClick,
]);

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    __hirelixGrowthTrack?: (
      eventType: string,
      metadata?: Record<string, string | number | boolean | null>,
      options?: { awaitResponse?: boolean },
    ) => Promise<boolean>;
    __hirelixGrowthIdentity?: {
      visitor_id: string;
      session_id: string;
      invite_code?: string | null;
    };
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
  if (value === "landing" || value === "signin" || value === "free_trial") {
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
  if (referrer.includes("news.ycombinator.com")) return "hackernews";
  if (referrer) return "referral";

  return "direct";
}

type StoredAttribution = {
  traffic_source: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
};

function readQueryValue(params: SearchParamsLike, key: string) {
  const value = params.get(key)?.trim();
  return value || undefined;
}

function getAttributionFromParams(
  params: SearchParamsLike,
  referrer = "",
): StoredAttribution {
  return {
    traffic_source: detectTrafficSource(params, referrer),
    utm_source: readQueryValue(params, "utm_source"),
    utm_medium: readQueryValue(params, "utm_medium"),
    utm_campaign: readQueryValue(params, "utm_campaign"),
    utm_content: readQueryValue(params, "utm_content"),
    utm_term: readQueryValue(params, "utm_term"),
    gclid: readQueryValue(params, "gclid"),
  };
}

function hasExplicitAttribution(params: SearchParamsLike) {
  return Boolean(
    readQueryValue(params, "traffic_source") ||
      ATTRIBUTION_QUERY_KEYS.some((key) => readQueryValue(params, key)),
  );
}

function getExternalReferrer() {
  if (typeof window === "undefined" || !document.referrer) return "";
  try {
    return new URL(document.referrer).origin === window.location.origin
      ? ""
      : document.referrer;
  } catch {
    return document.referrer;
  }
}

function readStoredAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as Partial<StoredAttribution>;
    if (!parsed.traffic_source || typeof parsed.traffic_source !== "string") return null;
    return parsed as StoredAttribution;
  } catch {
    return null;
  }
}

function writeStoredAttribution(attribution: StoredAttribution) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Analytics must never interrupt the product flow when browser storage is unavailable.
  }
}

export function getAttributionFromBrowser(): StoredAttribution {
  if (typeof window === "undefined") {
    return { traffic_source: "direct" };
  }

  const params = new URLSearchParams(window.location.search);
  if (hasExplicitAttribution(params)) {
    const attribution = getAttributionFromParams(params, getExternalReferrer());
    writeStoredAttribution(attribution);
    return attribution;
  }

  const stored = readStoredAttribution();
  if (stored) return stored;

  const attribution = getAttributionFromParams(params, getExternalReferrer());
  writeStoredAttribution(attribution);
  return attribution;
}

export function getAnalyticsContextFromParams(
  params: SearchParamsLike,
  overrides: Partial<AnalyticsContext> = {},
  referrer = "",
): AnalyticsContext {
  const attribution = getAttributionFromParams(params, referrer);
  return {
    device_type: overrides.device_type ?? getDeviceType(),
    traffic_source:
      overrides.traffic_source ?? attribution.traffic_source,
    utm_source: overrides.utm_source ?? attribution.utm_source,
    utm_medium: overrides.utm_medium ?? attribution.utm_medium,
    utm_campaign: overrides.utm_campaign ?? attribution.utm_campaign ?? "none",
    utm_content: overrides.utm_content ?? attribution.utm_content,
    utm_term: overrides.utm_term ?? attribution.utm_term,
    gclid: overrides.gclid ?? attribution.gclid,
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

  const params = new URLSearchParams(window.location.search);
  const attribution = getAttributionFromBrowser();
  return getAnalyticsContextFromParams(params, {
    ...attribution,
    ...overrides,
  });
}

export function isRecentSignup(
  createdAt: string | Date | null | undefined,
  nowMs = Date.now(),
  windowMs = 10 * 60 * 1000,
) {
  if (!createdAt) return false;
  const createdAtMs = createdAt instanceof Date ? createdAt.valueOf() : Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  const ageMs = nowMs - createdAtMs;
  return ageMs >= -60_000 && ageMs <= windowMs;
}

export function buildAttributionQuery(options: {
  intentPath: IntentPath;
  pageVariant: string;
  trafficSource: string;
  utmCampaign: string;
  utmSource?: string;
  utmMedium?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  entryMode?: EntryMode;
  extra?: Record<string, string | number>;
}) {
  const params = new URLSearchParams();
  params.set("intent_path", options.intentPath);
  params.set("page_variant", options.pageVariant);
  params.set("traffic_source", options.trafficSource);
  params.set("utm_campaign", options.utmCampaign);
  if (options.utmSource) params.set("utm_source", options.utmSource);
  if (options.utmMedium) params.set("utm_medium", options.utmMedium);
  if (options.utmContent) params.set("utm_content", options.utmContent);
  if (options.utmTerm) params.set("utm_term", options.utmTerm);
  if (options.gclid) params.set("gclid", options.gclid);
  params.set("entry", options.entryMode ?? "workspace");

  for (const [key, value] of Object.entries(options.extra ?? {})) {
    params.set(key, String(value));
  }

  return params;
}

function compactPayload(payload: TrackEventPayload) {
  const compacted: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) compacted[key] = value;
  }
  return compacted;
}

export function trackEvent(
  eventName: AnalyticsEventName,
  payload: TrackEventPayload = {},
) {
  if (typeof window === "undefined") return;

  const safePayload = compactPayload(payload);

  if (INTERNAL_PRODUCT_EVENTS.has(eventName)) {
    void window.__hirelixGrowthTrack?.(eventName, safePayload);
  }

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, safePayload);
    return;
  }

  window.dataLayer?.push({
    event: eventName,
    ...safePayload,
  });
}
