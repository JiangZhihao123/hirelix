import { getDefaultLlmModel, getLightweightLlmModel } from "@/lib/llm-client";
import type { BrightDataProfile } from "@/lib/brightdata";
import { hybridRetrieve, type HybridSearchIntent } from "@/lib/candidate-index/retrieval";
import { precheckBrightProfile } from "@/lib/candidate-index/intake";
import { buildRerankDocument, rerankDocuments } from "@/lib/candidate-index/reranker";
import { indexBrightProfiles } from "@/lib/candidate-index/store";
import {
  CANDIDATE_JUDGMENT_PROMPT_VERSION,
  candidateSourceEvidence,
  judgeFinalCandidate,
  loadCandidateBundles,
  qualifyCandidate,
  runPairwiseRanking,
  type FinalJudgment,
  type Qualification,
} from "@/lib/candidate-index/judgment";
import { runWithConcurrency } from "@/lib/search/concurrency";
import { ensureSearchDecisionContract } from "@/lib/candidate-index/intent";
import { SEARCH_DECISION_VERSION, readDecisionContract, resolveCandidateDecision, buildSearchOutcome, type CandidateDecisionRecord, type SearchDecisionContract } from "@/lib/search/decision-contract";
import { setSearchStatus, updateSearchParsedRequirements } from "@/lib/search/persistence";
import type { CandidateRowInput, PipelineContext, SearchDisplayStats } from "@/lib/search/types";

function stringArray(value: unknown, limit = 30) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, limit)
    : [];
}

function object(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function configuredInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function selectStructurallyIndexableProfiles(profiles: BrightDataProfile[]) {
  const rejected: Array<{ index: number; reason: string }> = [];
  const selected = profiles.filter((profile, index) => {
    const result = precheckBrightProfile(profile);
    if (!result) return true;
    rejected.push({ index, reason: result.reason });
    return false;
  });
  return { selected, rejected };
}

export function planQualificationBatch(params: {
  totalCandidates: number;
  evaluatedCount: number;
  advanceCount: number;
  initialLimit: number;
  batchSize: number;
  maxLimit: number;
  advanceTarget: number;
}) {
  if (params.evaluatedCount > 0 && params.advanceCount >= params.advanceTarget) {
    return { size: 0, stopReason: "advance_target_reached" as const };
  }
  const available = Math.min(params.totalCandidates, params.maxLimit) - params.evaluatedCount;
  if (available <= 0) {
    return {
      size: 0,
      stopReason: params.evaluatedCount >= params.maxLimit
        ? "max_limit_reached" as const
        : "pool_exhausted" as const,
    };
  }
  return {
    size: Math.min(available, params.evaluatedCount === 0 ? params.initialLimit : params.batchSize),
    stopReason: null,
  };
}

export function selectFinalJudgmentCandidateIds(
  orderedIds: string[],
  limit = 50,
) {
  return orderedIds.slice(0, Math.max(0, limit));
}

export function buildFinalRankById(orderedIds: string[]) {
  return new Map(orderedIds.map((id, index) => [id, index + 1]));
}

export function buildCandidateIndexSearchIntent(jdText: string, parsed: Record<string, unknown>) {
  const contract = readDecisionContract(parsed.decision_contract);
  const hiringBrief = object(parsed.hiring_brief);
  const roleCore = object(hiringBrief.role_core);
  const recallSpec = object(parsed.recall_spec);
  const title = typeof parsed.title === "string" ? parsed.title : typeof roleCore.title === "string" ? roleCore.title : "";
  const requiredSkills = [
    ...stringArray(roleCore.required_skills),
    ...stringArray(parsed.required_skills),
    ...stringArray(recallSpec.core_skill_terms),
    ...stringArray(recallSpec.must_have_signals),
  ];
  const domains = stringArray(recallSpec.domain_terms);
  const countries = stringArray(recallSpec.countries, 10).map((item) => item.toUpperCase());
  const minimumYears = typeof parsed.experience_years_min === "number" && Number.isFinite(parsed.experience_years_min)
    ? Math.max(0, parsed.experience_years_min)
    : null;
  const lexicalTerms = [...new Set([title, ...requiredSkills, ...domains].filter(Boolean))];
  const searchDocument = [
    `Primary and adjacent roles: ${[title, ...stringArray(recallSpec.title_variants), ...stringArray(recallSpec.lateral_title_variants)].filter(Boolean).join("; ")}`,
    `Seniority and scope: ${typeof roleCore.seniority === "string" ? roleCore.seniority : "Unknown"}; ${minimumYears ?? "unknown"} minimum years`,
    `Core capabilities: ${stringArray(recallSpec.must_have_signals).join("; ") || "Unknown"}`,
    `Technical evidence: ${requiredSkills.join("; ") || "Unknown"}`,
    `Domains: ${domains.join("; ") || "Unknown"}`,
    `Location: ${String(hiringBrief.location_scope || parsed.location || "Unknown")}; ${countries.join("; ")}; ${String(hiringBrief.work_model || "unknown")}; ${String(hiringBrief.location_flexibility || "unknown")}; relocation ${String(hiringBrief.relocation_allowed || "unknown")}`,
    `Mandatory constraints: ${stringArray(hiringBrief.must_have_constraints).join("; ")}`,
    `Full job description: ${jdText}`,
  ].join("\n");
  const intent: HybridSearchIntent = {
    searchDocument: searchDocument.slice(0, 18000),
    locationTerms: contract?.location.terms || [...new Set([...stringArray(recallSpec.strict_location_terms), ...stringArray(recallSpec.location_terms), ...stringArray(recallSpec.nearby_location_terms)])],
    lexicalQuery: lexicalTerms.length > 0 ? lexicalTerms.map((term) => `"${term.replaceAll('"', "")}"`).join(" OR ") : jdText.slice(0, 500),
    allowedCountries: countries,
    minimumYearsExperience: minimumYears,
    requiredDegree: null,
  };
  return {
    intent,
    judgmentInput: {
      raw_jd: jdText,
      decision_contract: contract,
      title,
      hiring_brief: hiringBrief,
      required_skills: requiredSkills,
      domains,
      allowed_countries: countries,
      minimum_years_experience: minimumYears,
    },
  };
}

function decisionNarrative(record: CandidateDecisionRecord) {
  const rows = record.assessment.requirements;
  return {
    evidence: rows.filter((row) => row.status === "supported").map((row) => row.explanation),
    missing: rows.filter((row) => row.status === "unknown").map((row) => `${row.description} ${row.explanation}`),
    risks: rows.filter((row) => row.status === "contradicted").map((row) => `${row.description} ${row.explanation}`),
  };
}

function candidateMetadata(params: {
  bundle: Awaited<ReturnType<typeof loadCandidateBundles>>[number];
  finalRank: number;
  qualification: Qualification;
  judgment: FinalJudgment | null;
  decisionRecord: CandidateDecisionRecord;
  evidencePack: Record<string, unknown>;
  contract: SearchDecisionContract;
}) {
  const { bundle, decisionRecord, judgment } = params;
  const decision = decisionRecord.decision;
  const recommended = decision === "contact";
  const rejected = decision === "reject";
  const deliveryBucket = recommended ? "reach_first" : decision === "review" ? "review_next" : rejected ? "not_recommended" : "lower_priority";
  const { evidence, missing, risks } = decisionNarrative(decisionRecord);
  const rows = decisionRecord.assessment.requirements;
  const ofKind = (kind: string) => rows.filter((row) => params.contract.requirements.find((item) => item.id === row.requirementId)?.kind === kind);
  const location = ofKind("location");
  const workModel = ofKind("work_model");
  const verdicts = {
    location_fit: location.length > 0 && location.every((row) => row.status === "supported") ? "local" : location.some((row) => row.status === "contradicted") ? "non_local" : "unknown",
    work_model_fit: workModel.length > 0 && workModel.every((row) => row.status === "supported") ? "yes" : workModel.some((row) => row.status === "contradicted") ? "no" : "unclear",
    must_have_coverage: decisionRecord.unresolvedRequirements.length === 0 && !rejected ? "strong" : rows.some((row) => row.status === "supported") ? "partial" : "unknown",
  };
  return {
    analysis_stage: "candidate_index_v2",
    decision_record: decisionRecord,
    scored_rank: params.finalRank,
    delivery_bucket: deliveryBucket,
    ...(recommended || decision === "review" ? { display_tier: recommended ? "priority_outreach" : "worth_reviewing" } : {}),
    is_recommended: recommended,
    final_decision: decision,
    advance_recommendation: recommended ? "advance" : rejected ? "reject" : "hold",
    join_likelihood: judgment?.joinLikelihood || "unknown",
    join_likelihood_reasons: judgment?.joinLikelihoodReasons || [],
    join_likelihood_risks: judgment?.joinLikelihoodRisks || [],
    constraint_verdicts: verdicts,
    evidence_pack: params.evidencePack,
    work_history: bundle.experiences.map((item) => ({ title: item.title, company: item.company, start_date: item.start_date, end_date: item.is_current ? null : item.end_date, summary: item.description })),
    education: (bundle.profile.schools || []).map((school, index) => ({ school, degree: index === 0 ? bundle.profile.highest_degree : null, major: bundle.profile.fields_of_study?.[index] || null })),
    about: bundle.profile.profile_summary,
    canonical_profile: bundle.profile.raw_profile,
    raw_profile: bundle.profile.raw_profile,
    suitability: {
      fit_decision: recommended ? "strong_fit" : rejected ? "reject" : "risky_fit",
      actionability: recommended ? "ready_to_act" : decision === "review" ? "needs_review" : "not_actionable",
      bucket: recommended ? "strong_now" : decision === "review" ? "consider_next" : "do_not_show",
      advance_recommendation: recommended ? "advance" : rejected ? "reject" : "hold",
      primary_risk: risks[0] || missing[0] || null,
      first_contact_confidence: recommended ? "high" : "low",
      shortlist_decision: recommended ? "yes" : "no",
      shortlist_reason: evidence[0] || null,
      blocking_constraints: decisionRecord.blockingRequirements.map((id) => rows.find((row) => row.requirementId === id)?.explanation || id),
      blocking_severity: decisionRecord.blockingRequirements.length > 0 ? "hard" : missing.length > 0 ? "soft" : "none",
      constraint_verdicts: verdicts,
      constraint_risks: missing,
      risk_flags: risks,
      why_this_candidate: evidence,
      why_not_higher: missing,
    },
  };
}

export function selectCandidatesForFinalReview(qualifications: Qualification[], limit: number) {
  const priority = (item: Qualification) => item.decision === "advance" ? 0
    : ["direct", "equivalent"].includes(item.assessment?.coreFit || item.comparisonCard.coreWork.level) ? 1 : 2;
  return qualifications.filter((item) => item.decision !== "reject")
    .sort((left, right) => priority(left) - priority(right))
    .slice(0, limit).map((item) => item.profileId);
}

type EvaluationCache = { hash: string; qualification: Qualification; judgment?: FinalJudgment };

export async function runCandidateIndexWorkflow(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  profiles: BrightDataProfile[];
  snapshotId: string | null;
  brightCost?: number;
  brightRequested: number;
}) {
  const { context } = params;
  const usage = { searchId: context.searchId, jobId: context.jobId, userId: context.userId };
  const contract = await ensureSearchDecisionContract(context.jdText, params.parsed, usage);
  const { intent, judgmentInput } = buildCandidateIndexSearchIntent(context.jdText, params.parsed);
  const structuralIntake = selectStructurallyIndexableProfiles(params.profiles);
  const indexed = structuralIntake.selected.length > 0
    ? await indexBrightProfiles(structuralIntake.selected, { snapshotId: params.snapshotId, ...usage })
    : { indexedProfileIds: [], reused: 0, rejected: [] };
  if (structuralIntake.selected.length > 0 && indexed.indexedProfileIds.length === 0) throw new Error("No structurally valid source profile could be indexed.");
  const retrieval = await hybridRetrieve(intent, configuredInt("SEARCH_RETRIEVAL_LIMIT", 1000, 100, 2000));
  const retrievalForRerank = retrieval.slice(0, configuredInt("SEARCH_RERANK_LIMIT", 600, 100, 1000));
  const retrievalEvidence = new Map(retrievalForRerank.map((item) => [item.profileId, { rrf_score: item.score, rrf_rank: item.rank, channel_ranks: item.channelRanks, channel_evidence: item.evidence }]));
  const bundles = await loadCandidateBundles(retrievalForRerank.map((item) => item.profileId), retrievalEvidence);
  const retrievalById = new Map(retrievalForRerank.map((item) => [item.profileId, item]));
  const rerankResult = bundles.length > 0 ? await rerankDocuments(context.jdText, bundles.map((bundle) => ({ profileId: bundle.profile.id, text: buildRerankDocument(bundle), retrievalRank: retrievalById.get(bundle.profile.id)!.rank }))) : { results: [], model: null, inputTokens: 0 };
  const rerankById = new Map(rerankResult.results.map((item) => [item.profileId, item]));
  const bundleById = new Map(bundles.map((item) => [item.profile.id, item]));
  const initialLimit = configuredInt("SEARCH_QUALIFICATION_INITIAL_LIMIT", 100, 20, 200);
  const qualificationLimit = configuredInt("SEARCH_QUALIFICATION_MAX_LIMIT", 200, initialLimit, 500);
  const advanceTarget = configuredInt("SEARCH_QUALIFICATION_ADVANCE_TARGET", 30, 2, 60);
  const modelKey = JSON.stringify([process.env.SEARCH_LIGHT_MODEL || getLightweightLlmModel(), process.env.SEARCH_JUDGE_MODEL || getDefaultLlmModel(), process.env.SEARCH_ARBITER_MODEL || "deepseek-v4-pro", process.env.SEARCH_QUALIFICATION_THINKING || "disabled", process.env.SEARCH_FINAL_JUDGMENT_THINKING || "disabled"]);
  const checkpoint = object(params.parsed.candidate_index_checkpoint);
  const cache: Record<string, EvaluationCache> = checkpoint.contractHash === contract.inputHash && checkpoint.promptVersion === CANDIDATE_JUDGMENT_PROMPT_VERSION && checkpoint.modelKey === modelKey
    ? object(checkpoint.profiles) as Record<string, EvaluationCache> : {};
  const saveCheckpoint = async () => {
    params.parsed.candidate_index_checkpoint = { contractHash: contract.inputHash, promptVersion: CANDIDATE_JUDGMENT_PROMPT_VERSION, modelKey, profiles: cache };
    await updateSearchParsedRequirements(context.searchId, params.parsed);
  };
  params.parsed.execution_progress = { stage: "qualification", completed: 0, total: Math.min(rerankResult.results.length, qualificationLimit), label: "Reviewing role evidence" };
  const ids = rerankResult.results.slice(0, qualificationLimit).map((item) => item.profileId);
  const qualifications: Qualification[] = [];
  let qualificationStopReason = "pool_exhausted";
  let qualificationCalls = 0;
  let finalCalls = 0;
  await setSearchStatus(context.searchId, "screening", { parsed_requirements: params.parsed });
  for (let offset = 0; offset < ids.length;) {
    const plan = planQualificationBatch({ totalCandidates: ids.length, evaluatedCount: offset, advanceCount: qualifications.filter((item) => item.decision === "advance").length, initialLimit, batchSize: configuredInt("SEARCH_QUALIFICATION_BATCH_SIZE", 50, 10, 100), maxLimit: qualificationLimit, advanceTarget });
    if (!plan.size) { qualificationStopReason = plan.stopReason || qualificationStopReason; break; }
    const batch = ids.slice(offset, offset + plan.size);
    try {
      qualifications.push(...await runWithConcurrency(batch, configuredInt("SEARCH_QUALIFICATION_CONCURRENCY", 24, 1, 48), async (id) => {
      const bundle = bundleById.get(id)!;
      const hash = bundle.profile.raw_content_hash || "";
      if (cache[id]?.hash === hash && cache[id].qualification.assessment) return cache[id].qualification;
      const qualification = await qualifyCandidate(judgmentInput, bundle, usage);
      qualificationCalls += 1;
      cache[id] = { hash, qualification };
      return qualification;
      }));
    } catch (error) {
      await saveCheckpoint();
      throw error;
    }
    offset += batch.length;
    params.parsed.execution_progress = { stage: "qualification", completed: offset, total: ids.length, label: "Reviewing role evidence" };
    qualificationStopReason = offset >= qualificationLimit ? "max_limit_reached" : "pool_exhausted";
    await saveCheckpoint();
  }
  await setSearchStatus(context.searchId, "deep_scoring", { parsed_requirements: params.parsed });
  const qualificationById = new Map(qualifications.map((item) => [item.profileId, item]));
  const reviewIds = selectCandidatesForFinalReview(qualifications, configuredInt("SEARCH_FINAL_JUDGMENT_LIMIT", 50, 20, 100));
  params.parsed.execution_progress = { stage: "final_review", completed: 0, total: reviewIds.length, label: "Checking final recommendations" };
  await saveCheckpoint();
  const judgments: FinalJudgment[] = [];
  let completedReviews = 0;
  let checkpointWrite = Promise.resolve();
  for (let offset = 0; offset < reviewIds.length; offset += 8) {
    try {
      judgments.push(...await runWithConcurrency(reviewIds.slice(offset, offset + 8), 8, async (id) => {
        let judgment = cache[id]?.judgment?.assessment ? cache[id].judgment! : null;
        if (!judgment) {
          judgment = await judgeFinalCandidate(judgmentInput, bundleById.get(id)!, qualificationById.get(id)!, null, usage);
          finalCalls += 1;
          cache[id].judgment = judgment;
        }
        completedReviews += 1;
        params.parsed.execution_progress = { stage: "final_review", completed: completedReviews, total: reviewIds.length, label: "Checking final recommendations" };
        // Persist each expensive review so one slow profile does not hide completed work.
        checkpointWrite = checkpointWrite.then(saveCheckpoint);
        await checkpointWrite;
        return judgment;
      }));
    } catch (error) {
      await saveCheckpoint();
      throw error;
    }
    params.parsed.execution_progress = { stage: "final_review", completed: judgments.length, total: reviewIds.length, label: "Checking final recommendations" };
    await saveCheckpoint();
  }
  const judgmentById = new Map(judgments.map((item) => [item.profileId, item]));
  // Relative comparison happens only after evidence-backed contact eligibility, including recovered maybes.
  for (const judgment of judgments) bundleById.get(judgment.profileId)!.finalAssessment = judgment.assessment;
  const contactIds = judgments.filter((item) => item.decision === "contact").map((item) => item.profileId);
  const pairwise = await runPairwiseRanking(judgmentInput, contactIds.map((id) => bundleById.get(id)!), usage, qualifications);
  const rankingById = new Map(pairwise.rankings.map((item) => [item.profileId, item]));
  for (const id of pairwise.qualificationRejectedProfileIds) {
    const judgment = judgmentById.get(id);
    if (judgment) { judgment.decision = "review"; judgment.risks.push("A comparison review found conflicting qualification evidence. Resolve this before outreach."); }
  }
  await saveCheckpoint();
  const evaluatedAt = new Date().toISOString();
  const decisionRecords = new Map<string, CandidateDecisionRecord>();
  for (const qualification of qualifications) {
    const bundle = bundleById.get(qualification.profileId)!;
    const judgment = judgmentById.get(qualification.profileId);
    const assessment = judgment?.assessment || qualification.assessment!;
    const modelDecision = judgment?.modelDecision || judgment?.decision || (qualification.decision === "reject" ? "reject" : "hold");
    const resolved = resolveCandidateDecision({ contract, assessment, modelDecision: judgment?.decision || modelDecision, previousDecision: judgment ? qualification.decision : undefined, reconciliation: judgment?.reconciliation });
    decisionRecords.set(qualification.profileId, {
      version: SEARCH_DECISION_VERSION, contractHash: contract.inputHash, ...resolved, modelDecision, assessment,
      reconciliation: judgment?.reconciliation || null,
      sourceEvidence: candidateSourceEvidence(bundle) as Record<string, string>,
      provenance: { profileHash: bundle.profile.raw_content_hash || null, snapshotId: bundle.profile.source_snapshot_id || null, retrievedAt: bundle.profile.retrieved_at ? new Date(bundle.profile.retrieved_at).toISOString() : null, evaluatedAt, representationVersion: bundle.profile.representation_version || null },
    });
  }
  const priority = { contact: 0, review: 1, hold: 2, reject: 3 };
  const orderedIds = qualifications.map((item) => item.profileId).sort((a, b) => priority[decisionRecords.get(a)!.decision] - priority[decisionRecords.get(b)!.decision] || (rankingById.get(a)?.rank ?? Infinity) - (rankingById.get(b)?.rank ?? Infinity) || (rerankById.get(a)?.rerankRank ?? Infinity) - (rerankById.get(b)?.rerankRank ?? Infinity));
  const finalRankById = buildFinalRankById(orderedIds);
  const finalRows: CandidateRowInput[] = orderedIds.map((id) => {
    const bundle = bundleById.get(id)!;
    const qualification = qualificationById.get(id)!;
    const judgment = judgmentById.get(id) || null;
    const decisionRecord = decisionRecords.get(id)!;
    const finalRank = finalRankById.get(id)!;
    const ranking = rankingById.get(id);
    const retrievalItem = retrievalById.get(id)!;
    const narrative = decisionNarrative(decisionRecord);
    const publicJudgment = judgment ? { ...judgment, matchReasons: narrative.evidence, evidence: narrative.evidence, risks: narrative.risks, missingInformation: narrative.missing } : null;
    const evidencePack = { retrieval: { ...retrievalEvidence.get(id), reranker: rerankById.get(id) }, qualification, relative_ranking: ranking || null, final_judgment: publicJudgment, decision_record: decisionRecord };
    return {
      profile_id: id, name: bundle.profile.name, headline: bundle.profile.current_title,
      location: [bundle.profile.city, bundle.profile.state_or_region, bundle.profile.country_code].filter(Boolean).join(", ") || null,
      skills: bundle.profile.skills || [], experience_years: bundle.profile.years_experience == null ? null : Math.round(Number(bundle.profile.years_experience)),
      match_score: null, match_reasons: narrative.evidence,
      profile_url: bundle.profile.linkedin_url, github_url: null, email: null, outreach_draft: null,
      metadata: candidateMetadata({ bundle, qualification, judgment, decisionRecord, finalRank, evidencePack, contract }),
      retrieval_channels: { ...retrievalItem.channelRanks, reranker: rerankById.get(id) },
      retrieval_rank: rerankById.get(id)?.rerankRank ?? retrievalItem.rank,
      qualification_decision: qualification.decision,
      qualification_evidence: { supporting_evidence: qualification.supportingEvidence, missing_information: qualification.missingInformation, rejection_reasons: qualification.rejectionReasons },
      davidson_score: ranking?.score ?? null, rank_low: ranking?.rankLow ?? null, rank_high: ranking?.rankHigh ?? null,
      final_rank: finalRank, final_decision: decisionRecord.decision, evidence_pack: evidencePack,
    };
  });
  const targetCount = configuredInt("SEARCH_CONTACT_TARGET", 3, 1, 20);
  const outcome = buildSearchOutcome({ candidates: finalRows, retrievedCount: retrieval.length, targetCount, stopReason: qualificationStopReason });
  const displayStats: Partial<SearchDisplayStats> = {
    retrieval_count: retrieval.length, deep_review_requested_count: reviewIds.length, deep_review_completed_count: judgments.length, deep_review_count: judgments.length,
    qualified_count: outcome.contactCount, advanceable_count: outcome.contactCount, outreach_pool_count: outcome.contactCount, shortlist_count: outcome.contactCount,
    bright_profiles_returned: params.profiles.length, bright_profiles_requested: params.brightRequested, bright_snapshot_cost: params.brightCost,
    recall_profile_count: retrieval.length, visible_candidate_count: finalRows.length, delivered_candidate_count: finalRows.length,
    priority_outreach_count: outcome.contactCount, worth_reviewing_count: outcome.reviewCount, recommended_count: outcome.contactCount,
    actionable_candidate_count: outcome.contactCount, search_outcome: outcome,
  };
  return {
    finalRows, displayStats, outcome,
    metrics: { processed_profile_count: indexed.indexedProfileIds.length, indexed_count: indexed.indexedProfileIds.length - indexed.reused, reused_count: indexed.reused, rejected_count: indexed.rejected.length,
      ingestion: { received_count: params.profiles.length, indexable_count: structuralIntake.selected.length, incomplete_count: structuralIntake.rejected.length },
      retrieval_count: retrieval.length, rerank_input_count: retrievalForRerank.length, rerank_output_count: rerankResult.results.length, rerank_model: rerankResult.model, rerank_input_tokens: rerankResult.inputTokens,
      qualification_pool_count: qualifications.length, qualification_stop_reason: qualificationStopReason, qualification_advance_target: advanceTarget,
      qualification_calls: qualificationCalls, final_judgment_calls: finalCalls, comparison_count: pairwise.comparisonCount, unstable_comparison_count: pairwise.unstableCount, pairwise_arbiter_count: pairwise.arbiterCount, comparison_graph_connected: pairwise.graphConnected },
  };
}
