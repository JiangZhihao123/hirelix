export type SearchPlanCode = "free" | "pro_monthly" | "pro_annual";

export type SearchExecutionProfileName =
  | "bright_fast_free"
  | "bright_full_pro";

export type SearchPhase = "phase_1";

export type SearchExecutionProfile = {
  name: SearchExecutionProfileName;
  filterLimit: number;
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

const STANDARD_RECALL_LIMIT = getConfiguredPositiveInt(
  "SEARCH_BRIGHTDATA_STANDARD_LIMIT",
  50,
);
const DEFAULT_SHORTLIST_CAP = 20;

const SEARCH_EXECUTION_PROFILES: Record<
  SearchExecutionProfileName,
  SearchExecutionProfile
> = {
  bright_fast_free: {
    name: "bright_fast_free",
    filterLimit: STANDARD_RECALL_LIMIT,
    finalResultCap: DEFAULT_SHORTLIST_CAP,
    highlightCount: 5,
    minVisibleQualityScore: 55,
    strongNowQualityScore: 72,
    lowCostMode: false,
    singleJudgeMode: false,
  },
  bright_full_pro: {
    name: "bright_full_pro",
    filterLimit: STANDARD_RECALL_LIMIT,
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
    case "bright_fast_free":
    case "bright_full_pro":
      return value;
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
  return isProPlanCode(planCode)
    ? SEARCH_EXECUTION_PROFILES.bright_full_pro
    : SEARCH_EXECUTION_PROFILES.bright_fast_free;
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
