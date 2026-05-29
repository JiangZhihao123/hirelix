export const SEARCH_TASK_PROCESSING_STATUSES = [
  "queued",
  "parsing",
  "searching",
  "screening",
] as const;

export type SearchTaskProcessingStatus =
  (typeof SEARCH_TASK_PROCESSING_STATUSES)[number];

export type SearchTaskStage =
  | "accepted"
  | "brief_ready"
  | "linkedin_scan"
  | "reviewing_profiles"
  | "shortlist_ready";

type SearchTaskLike = {
  status?: string | null;
  pipeline_step?: string | null;
  parse_completed_at?: string | null;
  partial_ready_at?: string | null;
  standard_recall_completed_at?: string | null;
};

type SearchRiskInput = {
  requiredSkills: string[];
  workModel?: string | null;
  locationScope?: string | null;
  locationFlexibility?: string | null;
  relocationAllowed?: string | null;
  constraintReasoning?: string | null;
};

export type SearchTaskRisk = {
  key: "location" | "must_have" | "scope";
  title: string;
  tone: "caution" | "neutral";
  body: string;
};

export function isSearchTaskProcessingStatus(status: string | null | undefined) {
  return SEARCH_TASK_PROCESSING_STATUSES.includes(
    (status || "") as SearchTaskProcessingStatus,
  );
}

export function getSearchTaskStage(search: SearchTaskLike): SearchTaskStage {
  if (search.partial_ready_at || search.status === "deep_scoring" || search.status === "done") {
    return "shortlist_ready";
  }

  const pipelineStep = search.pipeline_step || search.status || "queued";
  if (pipelineStep === "screening") return "reviewing_profiles";
  if (pipelineStep === "searching" && search.standard_recall_completed_at) {
    return "reviewing_profiles";
  }
  if (pipelineStep === "searching") return "linkedin_scan";
  if (search.parse_completed_at) return "brief_ready";
  return "accepted";
}

export function getSearchTaskStageLabel(stage: SearchTaskStage) {
  switch (stage) {
    case "accepted":
      return "Search accepted";
    case "brief_ready":
      return "Understanding the role";
    case "linkedin_scan":
      return "Scanning LinkedIn";
    case "reviewing_profiles":
      return "Reviewing candidates";
    case "shortlist_ready":
      return "Shortlist ready";
    default:
      return "Search accepted";
  }
}

export function getSearchTaskEtaCopy(
  status: string | null | undefined,
  stage?: SearchTaskStage,
) {
  if (stage === "accepted") {
    return "Brief parsing usually finishes in under 1 minute";
  }

  if (stage === "brief_ready" || stage === "linkedin_scan") {
    return "LinkedIn search usually takes 5-10 minutes";
  }

  if (stage === "reviewing_profiles") {
    return "Reviewing profiles now";
  }

  if (status === "deep_scoring") {
    return "Shortlist ready now; background refinement may take 1-3 more minutes";
  }

  if (status === "searching" || status === "screening") {
    return "Usually around 10 minutes from submission";
  }

  return "Brief parsing usually finishes in under 1 minute";
}

export function getSearchTaskSummary(stage: SearchTaskStage) {
  switch (stage) {
    case "accepted":
      return "Your search has started. You can leave this page while Hirelix prepares the search.";
    case "brief_ready":
      return "Hirelix has turned the JD into a sourcing brief and is preparing the LinkedIn search. You can leave this page.";
    case "linkedin_scan":
      return "We're scanning LinkedIn at scale. This usually takes a few minutes — you can leave this page.";
    case "reviewing_profiles":
      return "We've finished the LinkedIn scan. Now reviewing the strongest matches for this role.";
    case "shortlist_ready":
      return "Your shortlist is ready to review. Hirelix can keep refining in the background.";
    default:
      return "Your search has started. You can leave this page while Hirelix works.";
  }
}

export function getSearchTaskTimelineItems(search: SearchTaskLike) {
  const stage = getSearchTaskStage(search);
  const activeIndex = stage === "accepted"
    ? 0
    : stage === "brief_ready"
      ? 1
      : stage === "linkedin_scan"
        ? 2
        : stage === "reviewing_profiles"
          ? 3
          : 4;

  return [
    { label: "Accepted", state: activeIndex > 0 ? "done" : activeIndex === 0 ? "active" : "upcoming" },
    { label: "Brief ready", state: activeIndex > 1 ? "done" : activeIndex === 1 ? "active" : "upcoming" },
    { label: "Scanning LinkedIn", state: activeIndex > 2 ? "done" : activeIndex === 2 ? "active" : "upcoming" },
    { label: "Reviewing candidates", state: activeIndex > 3 ? "done" : activeIndex === 3 ? "active" : "upcoming" },
    { label: "Shortlist ready", state: activeIndex > 4 ? "done" : activeIndex === 4 ? "active" : "upcoming" },
  ] as const;
}

export function inferSearchTaskRisks(input: SearchRiskInput): SearchTaskRisk[] {
  const risks: SearchTaskRisk[] = [];
  const requiredSkillCount = input.requiredSkills.filter(Boolean).length;
  const hasStrictLocation =
    Boolean(input.locationScope) &&
    input.locationFlexibility === "strict" &&
    input.relocationAllowed === "no" &&
    input.workModel !== "remote";

  risks.push({
    key: "location",
    title: "Location scope",
    tone: hasStrictLocation ? "caution" : "neutral",
    body: hasStrictLocation
      ? "This role is currently constrained to a tight location range, which may reduce how many credible LinkedIn profiles Hirelix can surface."
      : "Location settings look flexible enough that the LinkedIn search should not be limited by geography alone.",
  });

  risks.push({
    key: "must_have",
    title: "Must-have density",
    tone: requiredSkillCount >= 8 ? "caution" : "neutral",
    body: requiredSkillCount >= 8
      ? `This role asks for ${requiredSkillCount} required skills, which is unusually dense and may narrow the shortlist too aggressively.`
      : "The must-have set looks focused enough for Hirelix to search without over-constraining the pool.",
  });

  const reasoning = (input.constraintReasoning || "").toLowerCase();
  const hasBroadOrConflictingScope =
    /broad|generic|wide|multiple|conflict|conflicting|hybrid profile|split focus/.test(reasoning);
  risks.push({
    key: "scope",
    title: "Role scope",
    tone: hasBroadOrConflictingScope ? "caution" : "neutral",
    body: hasBroadOrConflictingScope
      ? "The JD reads as unusually broad or internally mixed, so the LinkedIn search may surface a broader pool before Hirelix can narrow it down."
      : "The role shape looks specific enough for Hirelix to produce a focused shortlist once the scan is complete.",
  });

  return risks;
}
