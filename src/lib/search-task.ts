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
  | "provider_recall"
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
  if (search.partial_ready_at || search.status === "deep_scoring" || search.status === "done" || search.status === "degraded") {
    return "shortlist_ready";
  }

  const pipelineStep = search.pipeline_step || search.status || "queued";
  if (pipelineStep === "screening") return "reviewing_profiles";
  if (pipelineStep === "searching" && search.standard_recall_completed_at) {
    return "reviewing_profiles";
  }
  if (pipelineStep === "searching") return "provider_recall";
  if (search.parse_completed_at) return "brief_ready";
  return "accepted";
}

export function getSearchTaskStageLabel(stage: SearchTaskStage) {
  switch (stage) {
    case "accepted":
      return "Search accepted";
    case "brief_ready":
      return "Understanding the role";
    case "provider_recall":
      return "Provider recall running";
    case "reviewing_profiles":
      return "Reviewing recalled profiles";
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
  if (stage === "reviewing_profiles") {
    return "Reviewing profiles now";
  }

  if (status === "deep_scoring") {
    return "Shortlist ready now; background refinement may take 1-3 more minutes";
  }

  if (status === "searching" || status === "screening") {
    return "Usually 3-6 minutes from submission";
  }

  return "Usually under 1 minute to reach recall";
}

export function getSearchTaskSummary(stage: SearchTaskStage) {
  switch (stage) {
    case "accepted":
      return "Your search has started. You can leave this page while Hirelix prepares the search.";
    case "brief_ready":
      return "Hirelix has turned the JD into a search brief and is preparing provider recall. You can leave this page.";
    case "provider_recall":
      return "The external provider is still building the recall set. This usually takes a few minutes, and you can leave this page.";
    case "reviewing_profiles":
      return "Provider recall is back. Hirelix is reviewing profiles now and the shortlist will appear as soon as the first credible candidates pass review.";
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
      : stage === "provider_recall"
        ? 2
        : stage === "reviewing_profiles"
          ? 3
          : 4;

  return [
    { label: "Accepted", state: activeIndex > 0 ? "done" : activeIndex === 0 ? "active" : "upcoming" },
    { label: "Brief ready", state: activeIndex > 1 ? "done" : activeIndex === 1 ? "active" : "upcoming" },
    { label: "Provider recall running", state: activeIndex > 2 ? "done" : activeIndex === 2 ? "active" : "upcoming" },
    { label: "Reviewing profiles", state: activeIndex > 3 ? "done" : activeIndex === 3 ? "active" : "upcoming" },
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
      ? "This role is currently constrained to a tight location range, which may reduce how many credible profiles the provider can return."
      : "Location settings look flexible enough that provider recall should not be blocked by geography alone.",
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
      ? "The JD reads as unusually broad or internally mixed, so provider recall may bring back a wider pool before Hirelix can narrow it down."
      : "The role shape looks specific enough for Hirelix to produce a focused shortlist once recall is back.",
  });

  return risks;
}
