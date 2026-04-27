export type SearchPlanCode = "free" | "pro_monthly" | "pro_annual";

export type SearchExecutionProfileName =
  | "bright_test_full"
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

function getConfiguredPositiveInt(envName: string, fallback: number) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfiguredModeLimit(
  mode: SearchExecutionMode,
  round: "STANDARD" | "HIDDEN_GEM" | "COMPANY_TARGET",
  fallback: number,
) {
  const modePrefix = mode === "production" ? "PRODUCTION" : "TEST";
  return getConfiguredPositiveInt(
    `SEARCH_${modePrefix}_BRIGHTDATA_${round}_LIMIT`,
    getConfiguredPositiveInt(`SEARCH_BRIGHTDATA_${round}_LIMIT`, fallback),
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

const DEFAULT_SHORTLIST_CAP = 20;

const SEARCH_EXECUTION_PROFILES: Record<
  SearchExecutionProfileName,
  SearchExecutionProfile
> = {
  bright_test_full: {
    name: "bright_test_full",
    mode: "test",
    filterLimit: getConfiguredModeLimit("test", "STANDARD", 50),
    hiddenGemLimit: getConfiguredModeLimit("test", "HIDDEN_GEM", 25),
    companyTargetLimit: getConfiguredModeLimit("test", "COMPANY_TARGET", 25),
    finalResultCap: DEFAULT_SHORTLIST_CAP,
    highlightCount: 5,
    minVisibleQualityScore: 0,
    strongNowQualityScore: 72,
    lowCostMode: false,
    singleJudgeMode: false,
  },
  bright_production_full: {
    name: "bright_production_full",
    mode: "production",
    filterLimit: getConfiguredModeLimit("production", "STANDARD", 200),
    hiddenGemLimit: getConfiguredModeLimit("production", "HIDDEN_GEM", 100),
    companyTargetLimit: getConfiguredModeLimit("production", "COMPANY_TARGET", 100),
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

export function normalizeSearchPlanCode(value: unknown): SearchPlanCode {
  return value === "pro_monthly" || value === "pro_annual" ? value : "free";
}

export function isProPlanCode(planCode: SearchPlanCode) {
  return planCode === "pro_monthly" || planCode === "pro_annual";
}

export function getSearchExecutionProfile(
  profileName: SearchExecutionProfileName,
): SearchExecutionProfile {
  return SEARCH_EXECUTION_PROFILES[profileName];
}

export function getInitialSearchExecutionProfile(
  planCode: SearchPlanCode,
): SearchExecutionProfile {
  void planCode;
  return resolveSearchExecutionMode() === "production"
    ? SEARCH_EXECUTION_PROFILES.bright_production_full
    : SEARCH_EXECUTION_PROFILES.bright_test_full;
}

export function getInitialSearchTargets(
  planCode: SearchPlanCode,
) {
  const profile = getInitialSearchExecutionProfile(planCode);
  return {
    candidateCount: profile.finalResultCap,
    displayCount: profile.finalResultCap,
    highlightCount: Math.min(profile.highlightCount, profile.finalResultCap),
    executionProfile: profile.name,
  };
}
