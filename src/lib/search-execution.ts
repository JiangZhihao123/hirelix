import type { BillingPlanCode } from "@/lib/billing";

export type SearchPlanCode = BillingPlanCode;

export type SearchExecutionProfileName =
  | "bright_test_full"
  | "bright_free_preview"
  | "bright_production_full";

type SearchExecutionMode = "test" | "production";

export type SearchPhase = "phase_1";

export type SearchExecutionProfile = {
  name: SearchExecutionProfileName;
  mode: SearchExecutionMode;
  filterLimit: number;
  hiddenGemLimit: number;
  companyTargetLimit: number;
  finalResultCap: number;
  highlightCount: number;
  minVisibleQualityScore: number;
  strongNowQualityScore: number;
  lowCostMode: boolean;
  singleJudgeMode: boolean;
};

function getConfiguredNonNegativeInt(envName: string, fallback: number) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getConfiguredModeLimit(
  mode: SearchExecutionMode,
  round: "STANDARD" | "HIDDEN_GEM" | "COMPANY_TARGET",
  fallback: number,
) {
  const modePrefix = mode === "production" ? "PRODUCTION" : "TEST";
  return getConfiguredNonNegativeInt(
    `SEARCH_${modePrefix}_BRIGHTDATA_${round}_LIMIT`,
    getConfiguredNonNegativeInt(`SEARCH_BRIGHTDATA_${round}_LIMIT`, fallback),
  );
}

function resolveSearchExecutionMode(): SearchExecutionMode {
  const raw = (
    process.env.SEARCH_EXECUTION_MODE ||
    process.env.SEARCH_RECALL_PROFILE ||
    ""
  ).trim().toLowerCase();
  if (["production", "prod", "full", "live"].includes(raw)) return "production";
  if (["test", "testing", "dev", "development", "local"].includes(raw)) return "test";
  return process.env.NODE_ENV === "production" ? "production" : "test";
}

const DEFAULT_SHORTLIST_CAP = 25;
const FREE_PROFILE_SCAN_LIMIT = 150;
const FREE_HIDDEN_GEM_SCAN_LIMIT = 50;
const FREE_COMPANY_TARGET_SCAN_LIMIT = 50;
const PAID_HIDDEN_GEM_SCAN_LIMIT = 75;
const PAID_COMPANY_TARGET_SCAN_LIMIT = 75;
const PAID_PROFILE_SCAN_BATCH_LIMIT = 500;
export const FINAL_SHORTLIST_TARGET = DEFAULT_SHORTLIST_CAP;
export const DEFAULT_SEARCH_PROFILE_SCAN_BATCH_LIMIT = PAID_PROFILE_SCAN_BATCH_LIMIT;
export const DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT = PAID_PROFILE_SCAN_BATCH_LIMIT;
const PLAN_SHORTLIST_CAPS: Record<SearchPlanCode, number> = {
  free: DEFAULT_SHORTLIST_CAP,
  starter_monthly: 25,
  starter_annual: 25,
  pro_monthly: 25,
  pro_annual: 25,
  business_monthly: 25,
  agency_monthly: 25,
};

const SEARCH_EXECUTION_PROFILES: Record<
  SearchExecutionProfileName,
  SearchExecutionProfile
> = {
  bright_test_full: {
    name: "bright_test_full",
    mode: "test",
    filterLimit: getConfiguredModeLimit("test", "STANDARD", 50),
    hiddenGemLimit: getConfiguredModeLimit("test", "HIDDEN_GEM", 0),
    companyTargetLimit: getConfiguredModeLimit("test", "COMPANY_TARGET", 0),
    finalResultCap: DEFAULT_SHORTLIST_CAP,
    highlightCount: 5,
    minVisibleQualityScore: 0,
    strongNowQualityScore: 72,
    lowCostMode: false,
    singleJudgeMode: false,
  },
  bright_free_preview: {
    name: "bright_free_preview",
    mode: "production",
    filterLimit: getConfiguredNonNegativeInt("SEARCH_FREE_BRIGHTDATA_STANDARD_LIMIT", FREE_PROFILE_SCAN_LIMIT),
    hiddenGemLimit: getConfiguredNonNegativeInt("SEARCH_FREE_BRIGHTDATA_HIDDEN_GEM_LIMIT", FREE_HIDDEN_GEM_SCAN_LIMIT),
    companyTargetLimit: getConfiguredNonNegativeInt("SEARCH_FREE_BRIGHTDATA_COMPANY_TARGET_LIMIT", FREE_COMPANY_TARGET_SCAN_LIMIT),
    finalResultCap: DEFAULT_SHORTLIST_CAP,
    highlightCount: 3,
    minVisibleQualityScore: 0,
    strongNowQualityScore: 72,
    lowCostMode: false,
    singleJudgeMode: false,
  },
  bright_production_full: {
    name: "bright_production_full",
    mode: "production",
    filterLimit: getConfiguredModeLimit("production", "STANDARD", PAID_PROFILE_SCAN_BATCH_LIMIT),
    hiddenGemLimit: getConfiguredModeLimit("production", "HIDDEN_GEM", PAID_HIDDEN_GEM_SCAN_LIMIT),
    companyTargetLimit: getConfiguredModeLimit("production", "COMPANY_TARGET", PAID_COMPANY_TARGET_SCAN_LIMIT),
    finalResultCap: DEFAULT_SHORTLIST_CAP,
    highlightCount: 5,
    minVisibleQualityScore: 0,
    strongNowQualityScore: 72,
    lowCostMode: false,
    singleJudgeMode: false,
  },
};

export function normalizeSearchExecutionProfileName(
  value: unknown,
): SearchExecutionProfileName | null {
  switch (value) {
    case "bright_test_full":
    case "bright_free_preview":
    case "bright_production_full":
      return value;
    case "bright_fast_free":
      return "bright_test_full";
    case "bright_full_pro":
      return "bright_production_full";
    default:
      return null;
  }
}

const PAID_PLAN_CODES = new Set<SearchPlanCode>([
  "starter_monthly",
  "starter_annual",
  "pro_monthly",
  "pro_annual",
  "business_monthly",
  "agency_monthly",
]);

export function normalizeSearchPlanCode(value: unknown): SearchPlanCode {
  return PAID_PLAN_CODES.has(value as SearchPlanCode)
    ? (value as SearchPlanCode)
    : "free";
}

export function isProPlanCode(planCode: SearchPlanCode) {
  return PAID_PLAN_CODES.has(planCode);
}

export function getSearchExecutionProfile(
  profileName: SearchExecutionProfileName,
): SearchExecutionProfile {
  return SEARCH_EXECUTION_PROFILES[profileName];
}

export function getInitialSearchExecutionProfile(
  planCode: SearchPlanCode,
): SearchExecutionProfile {
  if (normalizeSearchPlanCode(planCode) === "free") {
    return SEARCH_EXECUTION_PROFILES.bright_free_preview;
  }
  return resolveSearchExecutionMode() === "production"
    ? SEARCH_EXECUTION_PROFILES.bright_production_full
    : SEARCH_EXECUTION_PROFILES.bright_test_full;
}

export function getInitialSearchTargets(
  planCode: SearchPlanCode,
) {
  const profile = getInitialSearchExecutionProfile(planCode);
  const planCap = PLAN_SHORTLIST_CAPS[normalizeSearchPlanCode(planCode)];
  const candidateCount = Math.min(DEFAULT_SHORTLIST_CAP, profile.finalResultCap, planCap);
  return {
    candidateCount,
    displayCount: candidateCount,
    highlightCount: Math.min(profile.highlightCount, candidateCount),
    executionProfile: profile.name,
    profileScanBudget:
      profile.filterLimit + profile.hiddenGemLimit + profile.companyTargetLimit,
  };
}

export function resolveExpandedProfileScanBudget({
  currentBudget,
  remainingScans,
  returnedProfiles,
  increment = DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT,
}: {
  currentBudget: number;
  remainingScans: number;
  returnedProfiles?: number | null;
  increment?: number;
}) {
  const normalizedCurrentBudget = Number.isFinite(currentBudget)
    ? Math.max(0, Math.round(currentBudget))
    : 0;
  const normalizedReturnedProfiles =
    typeof returnedProfiles === "number" && Number.isFinite(returnedProfiles)
      ? Math.max(0, Math.round(returnedProfiles))
      : null;
  const normalizedRemainingScans = Number.isFinite(remainingScans)
    ? Math.max(0, Math.round(remainingScans))
    : 0;
  const normalizedIncrement = Number.isFinite(increment)
    ? Math.max(1, Math.round(increment))
    : DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT;
  const additionalBudget = Math.min(normalizedRemainingScans, normalizedIncrement);
  const maxBillableReturnedProfiles =
    (normalizedReturnedProfiles ?? normalizedCurrentBudget) + normalizedRemainingScans;
  const nextBudget = Math.min(
    normalizedCurrentBudget + additionalBudget,
    Math.max(normalizedCurrentBudget, maxBillableReturnedProfiles),
  );

  return {
    currentBudget: normalizedCurrentBudget,
    additionalBudget: Math.max(0, nextBudget - normalizedCurrentBudget),
    nextBudget,
  };
}
