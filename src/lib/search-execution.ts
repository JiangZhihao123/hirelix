export type SearchPlanCode = "free" | "pro_monthly" | "pro_annual";

export type SearchExecutionProfileName =
  | "bright_fast_free"
  | "bright_fast_pro"
  | "bright_full_pro";

export type SearchPhase = "phase_1" | "phase_2";
export type SearchResultStage = "provisional" | "final";

export type SearchExecutionProfile = {
  name: SearchExecutionProfileName;
  filterLimit: number;
  finalResultCap: number;
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
    filterLimit: 25,
    finalResultCap: 5,
    lowCostMode: true,
    singleJudgeMode: true,
    allowPhaseTwo: false,
  },
  bright_fast_pro: {
    name: "bright_fast_pro",
    filterLimit: 40,
    finalResultCap: 10,
    lowCostMode: true,
    singleJudgeMode: true,
    allowPhaseTwo: true,
  },
  bright_full_pro: {
    name: "bright_full_pro",
    filterLimit: 100,
    finalResultCap: 25,
    lowCostMode: false,
    singleJudgeMode: false,
    allowPhaseTwo: false,
  },
};

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
    ? SEARCH_EXECUTION_PROFILES.bright_fast_pro
    : SEARCH_EXECUTION_PROFILES.bright_fast_free;
}

export function getFullSearchExecutionProfile(
  planCode: SearchPlanCode,
): SearchExecutionProfile | null {
  return isProPlanCode(planCode)
    ? SEARCH_EXECUTION_PROFILES.bright_full_pro
    : null;
}

export function getInitialSearchTargets(planCode: SearchPlanCode) {
  const profile = getInitialSearchExecutionProfile(planCode);
  return {
    candidateCount: isProPlanCode(planCode) ? 25 : profile.finalResultCap,
    displayCount: profile.finalResultCap,
    highlightCount: Math.min(5, profile.finalResultCap),
    executionProfile: profile.name,
  };
}
