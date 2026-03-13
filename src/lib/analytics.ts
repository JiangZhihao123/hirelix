type SearchParamsLike = {
  get: (name: string) => string | null;
};

type AnalyticsValue = string | number | boolean | null | undefined;

const LANDING_EXPERIMENT_STORAGE_KEY = "hirelix.landing-experiments.v1";

const LANDING_HEADLINE_VARIANTS = ["speed", "results"] as const;
const LANDING_CTA_VARIANTS = ["paste_jd", "find_candidates"] as const;
const LANDING_PROOF_VARIANTS = ["speed_first", "credibility_first"] as const;

export const ANALYTICS_EVENTS = {
  landingView: "landing_view",
  heroPrimaryCtaClick: "hero_primary_cta_click",
  sampleCtaClick: "sample_cta_click",
  heroJdInputStart: "hero_jd_input_start",
  heroJdSubmitAttempt: "hero_jd_submit_attempt",
  signinView: "signin_view",
  signupSuccess: "signup_success",
  newSearchView: "new_search_view",
  searchCreateSuccess: "search_create_success",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type DeviceType = "desktop" | "mobile";
export type IntentPath = "sample" | "direct_jd" | "signin" | "unknown";

export type LandingHeadlineVariant = (typeof LANDING_HEADLINE_VARIANTS)[number];
export type LandingCtaVariant = (typeof LANDING_CTA_VARIANTS)[number];
export type LandingProofVariant = (typeof LANDING_PROOF_VARIANTS)[number];

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
  cta: "paste_jd",
  proof: "speed_first",
};

const DEFAULT_LANDING_EXPERIMENT_STATE: LandingExperimentState = {
  ...DEFAULT_LANDING_EXPERIMENTS,
  pageVariant: buildPageVariant(DEFAULT_LANDING_EXPERIMENTS),
};

let landingExperimentCache: LandingExperimentState | null = null;

function isVariant<T extends string>(
  value: string | null,
  variants: readonly T[],
): value is T {
  return value !== null && variants.includes(value as T);
}

function chooseVariant<T extends string>(variants: readonly T[]): T {
  return variants[Math.floor(Math.random() * variants.length)];
}

function buildPageVariant({
  headline,
  cta,
  proof,
}: Omit<LandingExperimentState, "pageVariant">) {
  return `headline_${headline}__cta_${cta}__proof_${proof}`;
}

function readStoredLandingExperiments():
  | Omit<LandingExperimentState, "pageVariant">
  | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LANDING_EXPERIMENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LandingExperimentState>;
    const parsedHeadline = parsed.headline ?? null;
    const parsedCta = parsed.cta ?? null;
    const parsedProof = parsed.proof ?? null;

    if (
      isVariant(parsedHeadline, LANDING_HEADLINE_VARIANTS) &&
      isVariant(parsedCta, LANDING_CTA_VARIANTS) &&
      isVariant(parsedProof, LANDING_PROOF_VARIANTS)
    ) {
      return {
        headline: parsedHeadline,
        cta: parsedCta,
        proof: parsedProof,
      };
    }
  } catch {
    return null;
  }

  return null;
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

  const params = new URLSearchParams(window.location.search);
  const stored = readStoredLandingExperiments();

  const headlineParam = params.get("exp_headline");
  const ctaParam = params.get("exp_cta");
  const proofParam = params.get("exp_proof");

  const headline: LandingHeadlineVariant = isVariant(
    headlineParam,
    LANDING_HEADLINE_VARIANTS,
  )
    ? headlineParam
    : stored?.headline ?? chooseVariant(LANDING_HEADLINE_VARIANTS);

  const cta: LandingCtaVariant = isVariant(ctaParam, LANDING_CTA_VARIANTS)
    ? ctaParam
    : stored?.cta ?? chooseVariant(LANDING_CTA_VARIANTS);

  const proof: LandingProofVariant = isVariant(
    proofParam,
    LANDING_PROOF_VARIANTS,
  )
    ? proofParam
    : stored?.proof ?? chooseVariant(LANDING_PROOF_VARIANTS);

  const experimentState: Omit<LandingExperimentState, "pageVariant"> = {
    headline,
    cta,
    proof,
  };

  window.localStorage.setItem(
    LANDING_EXPERIMENT_STORAGE_KEY,
    JSON.stringify(experimentState),
  );

  landingExperimentCache = {
    ...experimentState,
    pageVariant: buildPageVariant(experimentState),
  };

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
  extra?: Record<string, string | number>;
}) {
  const params = new URLSearchParams();
  params.set("intent_path", options.intentPath);
  params.set("page_variant", options.pageVariant);
  params.set("traffic_source", options.trafficSource);
  params.set("utm_campaign", options.utmCampaign);

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
