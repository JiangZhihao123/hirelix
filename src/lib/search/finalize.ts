import type {
  CandidateRowInput,
  PipelineContext,
  SearchStatus,
  SearchDisplayStats,
  SearchExecutionRuntime,
} from "@/lib/search/types";

export async function completeSearch(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  finalRows: CandidateRowInput[],
  displayStats: SearchDisplayStats,
  helpers: {
    nowIso: () => string;
    getSearchStartedAt: (parsed: Record<string, unknown>, context: PipelineContext) => string | null | undefined;
    elapsedSince: (startedAt: string | null | undefined, endAt: string) => number | undefined;
    buildSearchDisplayStats: (overrides: Partial<SearchDisplayStats>) => SearchDisplayStats;
    generateOutreachDraftsForRows: (
      context: PipelineContext,
      runtime: SearchExecutionRuntime,
      parsed: Record<string, unknown>,
      rows: CandidateRowInput[],
    ) => Promise<CandidateRowInput[]>;
    getExecutionRuntime: (executionProfile: unknown) => SearchExecutionRuntime;
    getSearchExecutionProfile: (name: string) => unknown;
    upsertCandidatesForSearch: (
      searchId: string,
      rows: CandidateRowInput[],
      options?: { replaceMissing?: boolean },
    ) => Promise<void>;
    withDisplayStats: (
      parsed: Record<string, unknown>,
      stats: SearchDisplayStats,
    ) => Record<string, unknown>;
    setSearchStatus: (
      searchId: string,
      status: SearchStatus,
      extra?: Record<string, unknown>,
    ) => Promise<void>;
    updateSearchUsageEventMetadata: (
      searchId: string,
      metadataPatch: Record<string, unknown>,
    ) => Promise<void>;
    logSearchEvent: (eventName: string, payload: Record<string, unknown>) => void;
  },
  options?: {
    generateOutreachDrafts?: boolean;
    replaceMissingCandidates?: boolean;
    runtime?: SearchExecutionRuntime;
  },
) {
  const doneAt = helpers.nowIso();
  const sortedRows = [...finalRows].sort((left, right) => right.match_score - left.match_score);
  const deliveredRows = sortedRows;
  const candidateCountReference = deliveredRows.length;
  const recommendedRows = deliveredRows.filter(
    (row) =>
      row.metadata?.delivery_bucket === "reach_first" ||
      row.metadata?.delivery_bucket === "review_next" ||
      row.metadata?.display_tier === "priority_outreach" ||
      row.metadata?.display_tier === "worth_reviewing",
  );
  const priorityOutreachCount = deliveredRows.filter(
    (row) => row.metadata?.delivery_bucket === "reach_first" || row.metadata?.display_tier === "priority_outreach",
  ).length;
  const worthReviewingCount = deliveredRows.filter(
    (row) => row.metadata?.delivery_bucket === "review_next" || row.metadata?.display_tier === "worth_reviewing",
  ).length;
  const clearLocationFitCount = deliveredRows.filter((row) => {
    const verdicts =
      row.metadata?.constraint_verdicts && typeof row.metadata.constraint_verdicts === "object"
        ? (row.metadata.constraint_verdicts as Record<string, unknown>)
        : null;
    return verdicts?.location_fit === "local" || verdicts?.location_fit === "nearby";
  }).length;
  const mustHaveStrongCount = deliveredRows.filter((row) => {
    const verdicts =
      row.metadata?.constraint_verdicts && typeof row.metadata.constraint_verdicts === "object"
        ? (row.metadata.constraint_verdicts as Record<string, unknown>)
        : null;
    return verdicts?.must_have_coverage === "strong";
  }).length;
  const firstContactConfidenceCount = deliveredRows.filter(
    (row) =>
      row.metadata?.first_contact_confidence === "high" ||
      (row.metadata?.suitability &&
        typeof row.metadata.suitability === "object" &&
        (row.metadata.suitability as Record<string, unknown>).first_contact_confidence === "high"),
  ).length;
  const startedAt = helpers.getSearchStartedAt(parsed, context);
  const finalDisplayStats = helpers.buildSearchDisplayStats({
    ...displayStats,
    promised_candidate_count: candidateCountReference,
    delivered_candidate_count: deliveredRows.length,
    shortlist_underfilled: false,
    shortlist_count: recommendedRows.length,
    qualified_count: recommendedRows.length,
    outreach_pool_count: recommendedRows.length,
    visible_candidate_count: deliveredRows.length,
    contact_unlock_candidates: Math.min(
      displayStats.contact_unlock_candidates ?? deliveredRows.length,
      deliveredRows.length,
    ),
    priority_outreach_count: priorityOutreachCount,
    worth_reviewing_count: worthReviewingCount,
    recommended_count: recommendedRows.length,
    lower_priority_count: Math.max(0, deliveredRows.length - recommendedRows.length),
    clear_location_fit_count: clearLocationFitCount,
    must_have_strong_count: mustHaveStrongCount,
    first_contact_confidence_count: firstContactConfidenceCount,
    time_to_done_ms:
      displayStats.time_to_done_ms ?? helpers.elapsedSince(startedAt, doneAt),
  });
  const draftedRecommendedRows =
    recommendedRows.length > 0 && options?.generateOutreachDrafts !== false
      ? await helpers.generateOutreachDraftsForRows(
        context,
        options?.runtime ?? helpers.getExecutionRuntime(
          helpers.getSearchExecutionProfile("bright_production_full"),
        ),
        parsed,
        recommendedRows,
      )
      : recommendedRows;
  const draftedByKey = new Map(
    draftedRecommendedRows.map((row) => [(row.profile_url || row.name).toLowerCase(), row]),
  );
  const draftedRows = deliveredRows.map((row) => {
    const key = (row.profile_url || row.name).toLowerCase();
    return draftedByKey.get(key) ?? row;
  });

  await helpers.upsertCandidatesForSearch(context.searchId, draftedRows, {
    replaceMissing: options?.replaceMissingCandidates ?? true,
  });
  helpers.logSearchEvent("public_evidence_available_on_demand", {
    search_id: context.searchId,
    eligible_candidates: recommendedRows.length,
  });

  const finalParsed = helpers.withDisplayStats(parsed, finalDisplayStats);
  const createdAtMs = context.createdAt ? Date.parse(context.createdAt) : Number.NaN;
  const finalReadyLatencyMs = Number.isFinite(createdAtMs)
    ? Math.max(0, Date.now() - createdAtMs)
    : null;
  await helpers.setSearchStatus(context.searchId, "done", {
    done_at: doneAt,
    error_message: null,
    parsed_requirements: finalParsed,
  });

  await helpers.updateSearchUsageEventMetadata(context.searchId, {
    execution_profile: finalParsed.execution_profile ?? null,
    search_phase: finalParsed.search_phase ?? null,
    result_stage: finalParsed.result_stage ?? null,
    activation_run: finalDisplayStats.activation_run ?? finalParsed.activation_run ?? null,
    quality_floor_applied: finalDisplayStats.quality_floor_applied ?? null,
    visible_candidate_count: finalDisplayStats.visible_candidate_count ?? draftedRows.length,
    promised_candidate_count: finalDisplayStats.promised_candidate_count ?? candidateCountReference,
    delivered_candidate_count: finalDisplayStats.delivered_candidate_count ?? draftedRows.length,
    shortlist_underfilled: finalDisplayStats.shortlist_underfilled ?? false,
    pre_gate_blocked_count: finalDisplayStats.pre_gate_blocked_count ?? null,
    prescreen_blocked_count: finalDisplayStats.prescreen_blocked_count ?? null,
    contact_unlock_candidates: finalDisplayStats.contact_unlock_candidates ?? draftedRows.length,
    recall_profile_count: finalDisplayStats.recall_profile_count ?? null,
    priority_outreach_count: finalDisplayStats.priority_outreach_count ?? null,
    worth_reviewing_count: finalDisplayStats.worth_reviewing_count ?? null,
    recommended_count: finalDisplayStats.recommended_count ?? null,
    lower_priority_count: finalDisplayStats.lower_priority_count ?? null,
    ruled_out_count: finalDisplayStats.ruled_out_count ?? null,
    strong_now_count: finalDisplayStats.strong_now_count ?? null,
    consider_next_count: finalDisplayStats.consider_next_count ?? null,
    do_not_show_count: finalDisplayStats.do_not_show_count ?? null,
    shortlist_yes_count: finalDisplayStats.shortlist_yes_count ?? null,
    shortlist_no_count: finalDisplayStats.shortlist_no_count ?? null,
    clear_location_fit_count: finalDisplayStats.clear_location_fit_count ?? null,
    must_have_strong_count: finalDisplayStats.must_have_strong_count ?? null,
    first_contact_confidence_count: finalDisplayStats.first_contact_confidence_count ?? null,
    bright_profile_budget: finalDisplayStats.bright_profile_budget ?? null,
    bright_profiles_requested: finalDisplayStats.bright_profiles_requested ?? null,
    bright_profiles_returned: finalDisplayStats.bright_profiles_returned ?? null,
    profile_scans_reserved: 0,
    profile_scans_used: finalDisplayStats.bright_profiles_returned ?? 0,
    profile_scans_returned: finalDisplayStats.bright_profiles_returned ?? 0,
    profile_scans_requested: finalDisplayStats.bright_profiles_requested ?? null,
    profile_scans_billing_status:
      (finalDisplayStats.bright_profiles_returned ?? 0) > 0
        ? "charged"
        : "no_matching_profiles",
    bright_snapshot_cost: finalDisplayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: finalDisplayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: finalDisplayStats.estimated_search_total_cost ?? null,
    final_ready_latency_ms: finalReadyLatencyMs,
    judge_mode: finalDisplayStats.judge_mode ?? finalParsed.judge_mode ?? null,
  });

  helpers.logSearchEvent("search_done", {
    search_id: context.searchId,
    candidate_count: draftedRows.length,
    promised_candidate_count: candidateCountReference,
    delivered_candidate_count: draftedRows.length,
    shortlist_underfilled: false,
    final_ready_latency_ms: finalReadyLatencyMs,
    bright_snapshot_cost: finalDisplayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: finalDisplayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: finalDisplayStats.estimated_search_total_cost ?? null,
    job_id: context.jobId,
  });
}
