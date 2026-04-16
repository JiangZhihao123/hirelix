import type {
  CandidateRowInput,
  PipelineContext,
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
      status: string,
      extra?: Record<string, unknown>,
    ) => Promise<void>;
    updateSearchUsageEventMetadata: (
      searchId: string,
      metadataPatch: Record<string, unknown>,
    ) => Promise<void>;
    logSearchEvent: (eventName: string, payload: Record<string, unknown>) => void;
  },
  warningMessage?: string | null,
  options?: { generateOutreachDrafts?: boolean; runtime?: SearchExecutionRuntime },
) {
  const doneAt = helpers.nowIso();
  const startedAt = helpers.getSearchStartedAt(parsed, context);
  const finalDisplayStats = helpers.buildSearchDisplayStats({
    ...displayStats,
    time_to_done_ms:
      displayStats.time_to_done_ms ?? helpers.elapsedSince(startedAt, doneAt),
  });
  const draftedRows =
    finalRows.length > 0 && options?.generateOutreachDrafts !== false
      ? await helpers.generateOutreachDraftsForRows(
        context,
        options?.runtime ?? helpers.getExecutionRuntime(
          helpers.getSearchExecutionProfile("bright_full_pro"),
        ),
        parsed,
        finalRows,
      )
      : finalRows;

  if (draftedRows.length > 0) {
    await helpers.upsertCandidatesForSearch(context.searchId, draftedRows, {
      replaceMissing: true,
    });
  }

  const finalParsed = helpers.withDisplayStats(parsed, finalDisplayStats);
  const createdAtMs = context.createdAt ? Date.parse(context.createdAt) : Number.NaN;
  const finalReadyLatencyMs = Number.isFinite(createdAtMs)
    ? Math.max(0, Date.now() - createdAtMs)
    : null;
  await helpers.setSearchStatus(context.searchId, warningMessage ? "degraded" : "done", {
    done_at: doneAt,
    error_message: null,
    warning_message: warningMessage ?? null,
    parsed_requirements: finalParsed,
  });

  await helpers.updateSearchUsageEventMetadata(context.searchId, {
    execution_profile: finalParsed.execution_profile ?? null,
    search_phase: finalParsed.search_phase ?? null,
    result_stage: finalParsed.result_stage ?? null,
    activation_run: finalDisplayStats.activation_run ?? finalParsed.activation_run ?? null,
    quality_floor_applied: finalDisplayStats.quality_floor_applied ?? null,
    visible_candidate_count: finalDisplayStats.visible_candidate_count ?? draftedRows.length,
    pre_gate_blocked_count: finalDisplayStats.pre_gate_blocked_count ?? null,
    prescreen_blocked_count: finalDisplayStats.prescreen_blocked_count ?? null,
    contact_unlock_candidates: finalDisplayStats.contact_unlock_candidates ?? draftedRows.length,
    recall_profile_count: finalDisplayStats.recall_profile_count ?? null,
    priority_outreach_count: finalDisplayStats.priority_outreach_count ?? null,
    worth_reviewing_count: finalDisplayStats.worth_reviewing_count ?? null,
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
    bright_snapshot_cost: finalDisplayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: finalDisplayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: finalDisplayStats.estimated_search_total_cost ?? null,
    final_ready_latency_ms: finalReadyLatencyMs,
    judge_mode: finalDisplayStats.judge_mode ?? finalParsed.judge_mode ?? null,
  });

  helpers.logSearchEvent(warningMessage ? "search_degraded" : "search_done", {
    search_id: context.searchId,
    candidate_count: draftedRows.length,
    warning_message: warningMessage ?? null,
    final_ready_latency_ms: finalReadyLatencyMs,
    bright_snapshot_cost: finalDisplayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: finalDisplayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: finalDisplayStats.estimated_search_total_cost ?? null,
    job_id: context.jobId,
  });
}
