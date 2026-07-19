import type { BrightDataProfile } from "@/lib/brightdata";
import { hybridRetrieve, type HybridSearchIntent } from "@/lib/candidate-index/retrieval";
import { precheckBrightProfile } from "@/lib/candidate-index/intake";
import { buildRerankDocument, rerankDocuments } from "@/lib/candidate-index/reranker";
import { indexBrightProfiles } from "@/lib/candidate-index/store";
import {
  judgeFinalCandidate,
  loadCandidateBundles,
  qualifyCandidate,
  runPairwiseRanking,
  type FinalJudgment,
  type Qualification,
} from "@/lib/candidate-index/judgment";
import { runWithConcurrency } from "@/lib/search/concurrency";
import { setSearchStatus } from "@/lib/search/persistence";
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

export function buildCandidateIndexSearchIntent(jdText: string, parsed: Record<string, unknown>) {
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
    `Location: ${countries.join("; ") || "Unknown"}; ${String(hiringBrief.work_model || "unknown")}`,
  ].join("\n");
  const intent: HybridSearchIntent = {
    searchDocument,
    lexicalQuery: lexicalTerms.length > 0 ? lexicalTerms.map((term) => `"${term.replaceAll('"', "")}"`).join(" OR ") : jdText.slice(0, 500),
    allowedCountries: countries,
    minimumYearsExperience: minimumYears,
    requiredDegree: null,
  };
  return {
    intent,
    judgmentInput: {
      raw_jd: jdText,
      title,
      hiring_brief: hiringBrief,
      required_skills: requiredSkills,
      domains,
      allowed_countries: countries,
      minimum_years_experience: minimumYears,
    },
  };
}

function compatibilityMetadata(params: {
  profile: Awaited<ReturnType<typeof loadCandidateBundles>>[number]["profile"];
  experiences: Awaited<ReturnType<typeof loadCandidateBundles>>[number]["experiences"];
  finalRank: number;
  matchScore: number;
  qualification: Qualification;
  finalDecision: FinalJudgment["decision"];
  finalJudgment: FinalJudgment | null;
  evidencePack: Record<string, unknown>;
}) {
  const recommended = params.finalDecision === "contact" || params.finalDecision === "review";
  const rejected = params.finalDecision === "reject";
  const deliveryBucket = params.finalDecision === "contact"
    ? "reach_first"
    : params.finalDecision === "review"
      ? "review_next"
      : rejected ? "not_recommended" : "lower_priority";
  const advanceRecommendation = recommended ? "advance" : rejected ? "reject" : "hold";
  return {
    analysis_stage: "candidate_index_v1",
    scored_rank: params.finalRank,
    quality_score: params.matchScore,
    overall_score: params.matchScore,
    advance_score: params.matchScore,
    advance_recommendation: advanceRecommendation,
    delivery_bucket: deliveryBucket,
    ...(recommended ? { display_tier: params.finalDecision === "contact" ? "priority_outreach" : "worth_reviewing" } : {}),
    is_recommended: recommended,
    final_decision: params.finalDecision,
    join_likelihood: params.finalJudgment?.joinLikelihood || "unknown",
    join_likelihood_score: params.finalJudgment?.joinLikelihoodScore || 0,
    join_likelihood_reasons: params.finalJudgment?.joinLikelihoodReasons || [],
    join_likelihood_risks: params.finalJudgment?.joinLikelihoodRisks || [],
    evidence_pack: params.evidencePack,
    work_history: params.experiences.map((item) => ({
      title: item.title,
      company: item.company,
      start_date: item.start_date,
      end_date: item.is_current ? null : item.end_date,
      summary: item.description,
    })),
    education: (params.profile.schools || []).map((school, index) => ({
      school,
      degree: index === 0 ? params.profile.highest_degree : null,
      major: params.profile.fields_of_study?.[index] || null,
    })),
    about: params.profile.profile_summary,
    canonical_profile: params.profile.raw_profile,
    raw_profile: params.profile.raw_profile,
    suitability: {
      fit_decision: params.finalDecision === "contact" ? "strong_fit" : params.finalDecision === "review" ? "viable_fit" : rejected ? "reject" : "risky_fit",
      actionability: params.finalDecision === "contact" ? "ready_to_act" : params.finalDecision === "review" ? "needs_review" : "not_actionable",
      bucket: params.finalDecision === "contact" ? "strong_now" : params.finalDecision === "review" ? "consider_next" : "do_not_show",
      match_score: params.matchScore,
      quality_score: params.matchScore,
      overall_score: params.matchScore,
      advance_score: params.matchScore,
      advance_recommendation: advanceRecommendation,
      primary_risk: params.qualification.rejectionReasons[0] || params.qualification.missingInformation[0] || null,
      first_contact_confidence: params.finalDecision === "contact" ? "high" : params.finalDecision === "review" ? "medium" : "low",
      subscription_trigger_score: params.matchScore,
      shortlist_decision: recommended ? "yes" : "no",
      shortlist_reason: params.qualification.supportingEvidence[0] || null,
      blocking_constraints: params.qualification.rejectionReasons,
      blocking_severity: rejected ? "hard" : "none",
      scoring_breakdown: {
        capability_score: params.matchScore,
        relevance_score: params.matchScore,
        join_likelihood_score: params.finalJudgment?.joinLikelihoodScore || 0,
        join_likelihood_reasons: params.finalJudgment?.joinLikelihoodReasons || [],
        quality_score: params.matchScore,
        overall_score: params.matchScore,
        advance_score: params.matchScore,
      },
      constraint_verdicts: { location_fit: "unknown", work_model_fit: "unclear", must_have_coverage: params.qualification.decision === "advance" ? "strong" : params.qualification.decision === "maybe" ? "partial" : "weak" },
      constraint_risks: params.qualification.missingInformation,
      risk_flags: params.qualification.rejectionReasons,
      why_this_candidate: params.qualification.supportingEvidence,
      why_not_higher: [
        ...(params.finalJudgment?.joinLikelihoodRisks || []),
        ...params.qualification.missingInformation,
      ],
      evidence_quality: params.qualification.supportingEvidence.length >= 2 ? "high" : "medium",
    },
  };
}

export async function runCandidateIndexWorkflow(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  profiles: BrightDataProfile[];
  snapshotId: string | null;
  brightCost?: number;
  brightRequested: number;
}) {
  const { context } = params;
  const { intent, judgmentInput } = buildCandidateIndexSearchIntent(context.jdText, params.parsed);
  const structuralIntake = selectStructurallyIndexableProfiles(params.profiles);
  const profilesToIndex = structuralIntake.selected;
  const indexed = profilesToIndex.length > 0
    ? await indexBrightProfiles(profilesToIndex, {
      snapshotId: params.snapshotId,
      searchId: context.searchId,
      jobId: context.jobId,
      userId: context.userId,
    })
    : { indexedProfileIds: [], reused: 0, rejected: [] };
  if (profilesToIndex.length > 0 && indexed.indexedProfileIds.length === 0) {
    throw new Error(`Candidate index rejected all structurally indexable profiles: ${indexed.rejected.slice(0, 3).map((item) => item.reason).join("; ")}`);
  }
  const retrievalLimit = configuredInt("SEARCH_RETRIEVAL_LIMIT", 1000, 100, 2000);
  const retrieval = await hybridRetrieve(intent, retrievalLimit);
  if (retrieval.length === 0) throw new Error("Candidate index retrieval returned no eligible profiles");
  const rerankLimit = configuredInt("SEARCH_RERANK_LIMIT", 600, 100, 1000);
  const retrievalForRerank = retrieval.slice(0, rerankLimit);
  const retrievalEvidence = new Map(retrievalForRerank.map((item) => [item.profileId, {
    rrf_score: item.score,
    rrf_rank: item.rank,
    channel_ranks: item.channelRanks,
    channel_evidence: item.evidence,
  }]));
  const rerankBundles = await loadCandidateBundles(
    retrievalForRerank.map((item) => item.profileId),
    retrievalEvidence,
  );
  const retrievalById = new Map(retrievalForRerank.map((item) => [item.profileId, item]));
  const rerankResult = await rerankDocuments(
    context.jdText,
    rerankBundles.map((bundle) => ({
      profileId: bundle.profile.id,
      text: buildRerankDocument(bundle),
      retrievalRank: retrievalById.get(bundle.profile.id)?.rank ?? Number.MAX_SAFE_INTEGER,
    })),
  );
  const rerankById = new Map(rerankResult.results.map((item) => [item.profileId, item]));
  const rerankedRetrieval = rerankResult.results.flatMap((item) => {
    const retrievalItem = retrievalById.get(item.profileId);
    return retrievalItem ? [retrievalItem] : [];
  });
  const qualificationInitial = configuredInt("SEARCH_QUALIFICATION_INITIAL_LIMIT", 100, 20, 200);
  const qualificationBatchSize = configuredInt("SEARCH_QUALIFICATION_BATCH_SIZE", 50, 10, 100);
  const qualificationLimit = configuredInt("SEARCH_QUALIFICATION_MAX_LIMIT", 200, qualificationInitial, 500);
  const qualificationAdvanceTarget = configuredInt("SEARCH_QUALIFICATION_ADVANCE_TARGET", 30, 2, 60);
  const qualificationCandidates = rerankedRetrieval.slice(0, qualificationLimit);
  const evidenceByProfile = new Map(qualificationCandidates.map((item) => {
    const rerank = rerankById.get(item.profileId)!;
    return [item.profileId, {
      ...(retrievalEvidence.get(item.profileId) || {}),
      rerank_score: rerank.rerankScore,
      rerank_rank: rerank.rerankRank,
      rerank_model: rerankResult.model,
    }];
  }));
  const rerankBundleById = new Map(rerankBundles.map((bundle) => [bundle.profile.id, bundle]));
  const qualificationBundleById = new Map(qualificationCandidates.flatMap((item) => {
    const bundle = rerankBundleById.get(item.profileId);
    return bundle ? [[item.profileId, { ...bundle, retrievalEvidence: evidenceByProfile.get(item.profileId)! }] as const] : [];
  }));
  const usage = { searchId: context.searchId, jobId: context.jobId, userId: context.userId };
  const qualificationConcurrency = Math.max(1, Math.min(48, Number(process.env.SEARCH_QUALIFICATION_CONCURRENCY || 32)));
  const qualifications: Qualification[] = [];
  const qualificationPool = [] as typeof qualificationCandidates;
  let qualificationStopReason = "pool_exhausted";
  for (let offset = 0; offset < qualificationCandidates.length;) {
    const plan = planQualificationBatch({
      totalCandidates: qualificationCandidates.length,
      evaluatedCount: offset,
      advanceCount: qualifications.filter((item) => item.decision === "advance").length,
      initialLimit: qualificationInitial,
      batchSize: qualificationBatchSize,
      maxLimit: qualificationLimit,
      advanceTarget: qualificationAdvanceTarget,
    });
    if (plan.size === 0) {
      qualificationStopReason = plan.stopReason || qualificationStopReason;
      break;
    }
    const batchItems = qualificationCandidates.slice(offset, offset + plan.size);
    const batchBundles = batchItems.flatMap((item) => {
      const bundle = qualificationBundleById.get(item.profileId);
      return bundle ? [bundle] : [];
    });
    const batchQualifications = await runWithConcurrency(batchBundles, qualificationConcurrency, (bundle) =>
      qualifyCandidate(judgmentInput, bundle, usage),
    );
    qualificationPool.push(...batchItems);
    qualifications.push(...batchQualifications);
    offset += batchItems.length;
    if (batchItems.length === 0) break;
  }
  const finalPlan = planQualificationBatch({
    totalCandidates: qualificationCandidates.length,
    evaluatedCount: qualificationPool.length,
    advanceCount: qualifications.filter((item) => item.decision === "advance").length,
    initialLimit: qualificationInitial,
    batchSize: qualificationBatchSize,
    maxLimit: qualificationLimit,
    advanceTarget: qualificationAdvanceTarget,
  });
  qualificationStopReason = finalPlan.stopReason || qualificationStopReason;
  const qualificationById = new Map(qualifications.map((item) => [item.profileId, item]));
  const advancedIds = qualificationPool
    .filter((item) => qualificationById.get(item.profileId)?.decision === "advance")
    .slice(0, 60)
    .map((item) => item.profileId);

  await setSearchStatus(context.searchId, "deep_scoring", { parsed_requirements: params.parsed });
  const bundles = qualificationPool.flatMap((item) => {
    const bundle = qualificationBundleById.get(item.profileId);
    return bundle ? [bundle] : [];
  });
  const advancedBundles = bundles.filter((bundle) => advancedIds.includes(bundle.profile.id));
  const pairwise = await runPairwiseRanking(judgmentInput, advancedBundles, usage, qualifications);
  for (const profileId of pairwise.qualificationRejectedProfileIds) {
    const qualification = qualificationById.get(profileId);
    if (qualification) {
      qualification.decision = "reject";
      qualification.rejectionReasons = [
        ...qualification.rejectionReasons,
        "Rejected during pairwise qualification review.",
      ];
    }
  }
  const rankingById = new Map(pairwise.rankings.map((item) => [item.profileId, item]));
  const activeAdvancedIds = advancedIds.filter((id) => !pairwise.qualificationRejectedProfileIds.includes(id));
  const advancedOrdered = [...activeAdvancedIds].sort((left, right) =>
    (rankingById.get(left)?.rank ?? Number.POSITIVE_INFINITY) - (rankingById.get(right)?.rank ?? Number.POSITIVE_INFINITY),
  );
  const remainingOrdered = qualificationPool.map((item) => item.profileId).filter((id) => !advancedOrdered.includes(id));
  const orderedIds = [...advancedOrdered, ...remainingOrdered];
  const finalRankById = new Map(orderedIds.map((id, index) => [id, index + 1]));
  const topBundles = orderedIds.slice(0, 20).map((id) => bundles.find((bundle) => bundle.profile.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const finalJudgments = await runWithConcurrency(topBundles, 8, (bundle) =>
    judgeFinalCandidate(judgmentInput, bundle, qualificationById.get(bundle.profile.id)!, rankingById.get(bundle.profile.id) || null, usage),
  );
  const finalById = new Map(finalJudgments.map((item) => [item.profileId, item]));
  const bundleById = new Map(bundles.map((item) => [item.profile.id, item]));
  const qualifiedRetrievalById = new Map(qualificationPool.map((item) => [item.profileId, item]));

  const finalRows: CandidateRowInput[] = orderedIds.flatMap((profileId) => {
    const bundle = bundleById.get(profileId);
    const qualification = qualificationById.get(profileId);
    const retrievalItem = qualifiedRetrievalById.get(profileId);
    if (!bundle || !qualification || !retrievalItem) return [];
    const finalRank = finalRankById.get(profileId)!;
    const matchScore = orderedIds.length === 1 ? 100 : Math.round(100 - ((finalRank - 1) * 99) / (orderedIds.length - 1));
    const judgment = finalById.get(profileId);
    const finalDecision = judgment?.decision || (qualification.decision === "reject" ? "reject" : "hold");
    const ranking = rankingById.get(profileId) || null;
    const evidencePack = {
      retrieval: evidenceByProfile.get(profileId),
      qualification,
      relative_ranking: ranking,
      final_judgment: judgment || null,
    };
    return [{
      profile_id: profileId,
      name: bundle.profile.name,
      headline: bundle.profile.current_title,
      location: [bundle.profile.city, bundle.profile.state_or_region, bundle.profile.country_code].filter(Boolean).join(", ") || null,
      skills: bundle.profile.skills || [],
      experience_years: bundle.profile.years_experience == null ? null : Math.round(Number(bundle.profile.years_experience)),
      match_score: matchScore,
      match_reasons: judgment?.matchReasons || qualification.supportingEvidence,
      profile_url: bundle.profile.linkedin_url,
      github_url: null,
      email: null,
      outreach_draft: null,
      metadata: compatibilityMetadata({ profile: bundle.profile, experiences: bundle.experiences, finalRank, matchScore, qualification, finalDecision, finalJudgment: judgment || null, evidencePack }),
      retrieval_channels: {
        ...retrievalItem.channelRanks,
        reranker: {
          rank: rerankById.get(profileId)?.rerankRank ?? null,
          score: rerankById.get(profileId)?.rerankScore ?? null,
          model: rerankResult.model,
        },
      },
      retrieval_rank: rerankById.get(profileId)?.rerankRank ?? retrievalItem.rank,
      qualification_decision: qualification.decision,
      qualification_evidence: {
        supporting_evidence: qualification.supportingEvidence,
        missing_information: qualification.missingInformation,
        rejection_reasons: qualification.rejectionReasons,
      },
      davidson_score: ranking?.score ?? null,
      rank_low: ranking?.rankLow ?? null,
      rank_high: ranking?.rankHigh ?? null,
      final_rank: finalRank,
      final_decision: finalDecision,
      evidence_pack: evidencePack,
    }];
  });
  const contactCount = finalRows.filter((row) => row.final_decision === "contact").length;
  const reviewCount = finalRows.filter((row) => row.final_decision === "review").length;
  const displayStats: Partial<SearchDisplayStats> = {
    retrieval_count: retrieval.length,
    deep_review_requested_count: Math.min(20, finalRows.length),
    deep_review_completed_count: finalJudgments.length,
    deep_review_count: finalJudgments.length,
    qualified_count: advancedIds.length,
    advanceable_count: advancedIds.length,
    outreach_pool_count: contactCount + reviewCount,
    shortlist_count: contactCount + reviewCount,
    bright_profiles_returned: params.profiles.length,
    bright_profiles_requested: params.brightRequested,
    bright_snapshot_cost: params.brightCost,
    recall_profile_count: params.profiles.length,
    visible_candidate_count: contactCount + reviewCount,
    delivered_candidate_count: finalRows.length,
    priority_outreach_count: contactCount,
    worth_reviewing_count: reviewCount,
  };
  return {
    finalRows,
    displayStats,
    metrics: {
      processed_profile_count: indexed.indexedProfileIds.length,
      indexed_count: indexed.indexedProfileIds.length - indexed.reused,
      reused_count: indexed.reused,
      rejected_count: indexed.rejected.length,
      ingestion: {
        received_count: params.profiles.length,
        indexable_count: profilesToIndex.length,
        incomplete_count: structuralIntake.rejected.length,
        llm_calls: 0,
      },
      intake: null,
      retrieval_count: retrieval.length,
      rerank_input_count: retrievalForRerank.length,
      rerank_output_count: rerankResult.results.length,
      rerank_model: rerankResult.model,
      rerank_input_tokens: rerankResult.inputTokens,
      qualification_pool_count: qualificationPool.length,
      qualification_stop_reason: qualificationStopReason,
      qualification_advance_target: qualificationAdvanceTarget,
      comparison_count: pairwise.comparisonCount,
      unstable_comparison_count: pairwise.unstableCount,
      pairwise_arbiter_count: pairwise.arbiterCount,
      comparison_graph_connected: pairwise.graphConnected,
    },
  };
}
