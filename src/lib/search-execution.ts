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
  deliveryReferenceCount: number;
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

const FREE_PROFILE_SCAN_LIMIT = 150;
const FREE_HIDDEN_GEM_SCAN_LIMIT = 50;
const FREE_COMPANY_TARGET_SCAN_LIMIT = 50;
const PAID_HIDDEN_GEM_SCAN_LIMIT = 75;
const PAID_COMPANY_TARGET_SCAN_LIMIT = 75;
const PAID_PROFILE_SCAN_BATCH_LIMIT = 500;
export const DEFAULT_SEARCH_PROFILE_SCAN_BATCH_LIMIT = PAID_PROFILE_SCAN_BATCH_LIMIT;
export const DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT = PAID_PROFILE_SCAN_BATCH_LIMIT;

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
    deliveryReferenceCount: 50,
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
    deliveryReferenceCount: FREE_PROFILE_SCAN_LIMIT + FREE_HIDDEN_GEM_SCAN_LIMIT + FREE_COMPANY_TARGET_SCAN_LIMIT,
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
    deliveryReferenceCount: PAID_PROFILE_SCAN_BATCH_LIMIT,
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
  const candidateCount = Math.max(1, profile.deliveryReferenceCount);
  return {
    candidateCount,
    displayCount: candidateCount,
    highlightCount: Math.min(profile.highlightCount, candidateCount),
    executionProfile: profile.name,
    profileScanBudget:
      profile.filterLimit + profile.hiddenGemLimit + profile.companyTargetLimit,
  };
}

export function getSearchExecutionProfileScanBudget(
  profile: SearchExecutionProfile,
) {
  return Math.max(
    0,
    profile.filterLimit + profile.hiddenGemLimit + profile.companyTargetLimit,
  );
}

export function applyProfileScanBudgetToExecutionProfile(
  profile: SearchExecutionProfile,
  profileScanBudget: number,
): SearchExecutionProfile {
  const totalBudget = Number.isFinite(profileScanBudget)
    ? Math.max(1, Math.round(profileScanBudget))
    : getSearchExecutionProfileScanBudget(profile);
  const lanes = [
    { key: "filterLimit" as const, base: Math.max(0, profile.filterLimit) },
    { key: "hiddenGemLimit" as const, base: Math.max(0, profile.hiddenGemLimit) },
    { key: "companyTargetLimit" as const, base: Math.max(0, profile.companyTargetLimit) },
  ].filter((lane) => lane.base > 0);
  const baseBudget = lanes.reduce((sum, lane) => sum + lane.base, 0);
  if (baseBudget <= 0 || lanes.length === 0) {
    return {
      ...profile,
      filterLimit: totalBudget,
      hiddenGemLimit: 0,
      companyTargetLimit: 0,
      deliveryReferenceCount: totalBudget,
    };
  }

  const allocations = new Map<(typeof lanes)[number]["key"], number>();
  if (totalBudget < lanes.length) {
    const prioritized = [...lanes].sort((left, right) => right.base - left.base);
    for (let index = 0; index < totalBudget; index += 1) {
      const lane = prioritized[index];
      if (lane) allocations.set(lane.key, 1);
    }
  } else {
    const rawAllocations = lanes.map((lane) => {
      const raw = totalBudget * lane.base / baseBudget;
      return {
        ...lane,
        allocated: Math.max(1, Math.floor(raw)),
        remainder: raw - Math.floor(raw),
      };
    });
    let allocatedTotal = rawAllocations.reduce((sum, lane) => sum + lane.allocated, 0);
    const byRemainderDesc = [...rawAllocations].sort((left, right) =>
      right.remainder - left.remainder || right.base - left.base,
    );
    for (let index = 0; allocatedTotal < totalBudget; index = (index + 1) % byRemainderDesc.length) {
      const lane = byRemainderDesc[index];
      if (!lane) continue;
      lane.allocated += 1;
      allocatedTotal += 1;
    }
    const byRemainderAsc = [...rawAllocations].sort((left, right) =>
      left.remainder - right.remainder || left.base - right.base,
    );
    for (let index = 0; allocatedTotal > totalBudget; index = (index + 1) % byRemainderAsc.length) {
      const lane = byRemainderAsc[index];
      if (!lane || lane.allocated <= 1) continue;
      lane.allocated -= 1;
      allocatedTotal -= 1;
    }
    for (const lane of rawAllocations) {
      allocations.set(lane.key, lane.allocated);
    }
  }

  return {
    ...profile,
    filterLimit: allocations.get("filterLimit") ?? 0,
    hiddenGemLimit: allocations.get("hiddenGemLimit") ?? 0,
    companyTargetLimit: allocations.get("companyTargetLimit") ?? 0,
    deliveryReferenceCount: totalBudget,
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
