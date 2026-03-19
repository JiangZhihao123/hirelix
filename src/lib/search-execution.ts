export type SearchPlanCode = "free" | "pro_monthly" | "pro_annual";

export type SearchExecutionProfileName =
  | "bright_fast_free"
  | "bright_activation_free"
  | "bright_activation_free_topup"
  | "bright_fast_pro"
  | "bright_full_pro";

export type SearchPhase = "phase_1" | "phase_2";
export type SearchResultStage = "provisional" | "final";

export type SearchExecutionProfile = {
  name: SearchExecutionProfileName;
  filterLimit: number;
  finalResultCap: number;
  highlightCount: number;
  minVisibleQualityScore: number;
  lowCostMode: boolean;
  singleJudgeMode: boolean;
  allowPhaseTwo: boolean;
};

const SEARCH_EXECUTION_PROFILES: Record<
  SearchExecutionProfileName,
  SearchExecutionProfile
> = {
  bright_fast_free: {
    name: "bright_fast_free",
    filterLimit: 35,
    finalResultCap: 10,
    highlightCount: 3,
    minVisibleQualityScore: 60,
    lowCostMode: true,
    singleJudgeMode: true,
    allowPhaseTwo: false,
  },
  bright_activation_free: {
    name: "bright_activation_free",
    filterLimit: 60,
    finalResultCap: 10,
    highlightCount: 3,
    minVisibleQualityScore: 60,
    lowCostMode: false,
    singleJudgeMode: true,
    allowPhaseTwo: false,
  },
  bright_activation_free_topup: {
    name: "bright_activation_free_topup",
    filterLimit: 120,
    finalResultCap: 10,
    highlightCount: 3,
    minVisibleQualityScore: 60,
    lowCostMode: false,
    singleJudgeMode: false,
    allowPhaseTwo: false,
  },
  bright_fast_pro: {
    name: "bright_fast_pro",
    filterLimit: 40,
    finalResultCap: 10,
    highlightCount: 5,
    minVisibleQualityScore: 0,
    lowCostMode: true,
    singleJudgeMode: true,
    allowPhaseTwo: true,
  },
  bright_full_pro: {
    name: "bright_full_pro",
    filterLimit: 200,
    finalResultCap: 25,
    highlightCount: 5,
    minVisibleQualityScore: 0,
    lowCostMode: false,
    singleJudgeMode: false,
    allowPhaseTwo: false,
  },
};

export function normalizeSearchExecutionProfileName(
  value: unknown,
): SearchExecutionProfileName | null {
  switch (value) {
    case "bright_fast_free":
    case "bright_activation_free":
    case "bright_activation_free_topup":
    case "bright_fast_pro":
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
  options?: { activationRun?: boolean },
): SearchExecutionProfile {
  return isProPlanCode(planCode)
    ? SEARCH_EXECUTION_PROFILES.bright_fast_pro
    : options?.activationRun
      ? SEARCH_EXECUTION_PROFILES.bright_activation_free
      : SEARCH_EXECUTION_PROFILES.bright_fast_free;
}

export function getFullSearchExecutionProfile(
  planCode: SearchPlanCode,
  options?: { activationRun?: boolean },
): SearchExecutionProfile | null {
  if (isProPlanCode(planCode)) {
    return SEARCH_EXECUTION_PROFILES.bright_full_pro;
  }
  return options?.activationRun
    ? SEARCH_EXECUTION_PROFILES.bright_activation_free_topup
    : null;
}

export function getInitialSearchTargets(
  planCode: SearchPlanCode,
  options?: { activationRun?: boolean },
) {
  const profile = getInitialSearchExecutionProfile(planCode, options);
  return {
    candidateCount: isProPlanCode(planCode) ? 25 : profile.finalResultCap,
    displayCount: profile.finalResultCap,
    highlightCount: Math.min(profile.highlightCount, profile.finalResultCap),
    executionProfile: profile.name,
  };
}
