import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_candidate_comparisons, hirelix_profile_experiences, hirelix_profiles } from "@/db/schema";
import { generateLlmJson, getDefaultLlmModel, getLightweightLlmModel, resolveDeepSeekThinkingMode } from "@/lib/llm-client";
import { areOrderSwapDecisionsConsistent, buildConnectedComparisonPairs, fitDavidsonRanking, type ComparisonOutcome, type DavidsonRank } from "@/lib/candidate-index/ranking";
import { runWithConcurrency } from "@/lib/search/concurrency";

export type CandidateBundle = {
  profile: typeof hirelix_profiles.$inferSelect;
  experiences: Array<typeof hirelix_profile_experiences.$inferSelect>;
  retrievalEvidence: Record<string, unknown>;
};

export type Qualification = {
  profileId: string;
  decision: "advance" | "maybe" | "reject";
  supportingEvidence: string[];
  missingInformation: string[];
  rejectionReasons: string[];
  model: string;
};

export type FinalJudgment = {
  profileId: string;
  decision: "contact" | "review" | "hold" | "reject";
  matchReasons: string[];
  evidence: string[];
  risks: string[];
  missingInformation: string[];
  recommendedNextAction: string;
};

export const QUALIFICATION_SCHEMA = {
  name: "candidate_qualification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "supporting_evidence", "missing_information", "rejection_reasons"],
    properties: {
      decision: { type: "string", enum: ["advance", "maybe", "reject"] },
      supporting_evidence: { type: "array", maxItems: 10, items: { type: "string" } },
      missing_information: { type: "array", maxItems: 10, items: { type: "string" } },
      rejection_reasons: { type: "array", maxItems: 10, items: { type: "string" } },
    },
  },
} as const;

export const COMPARISON_SCHEMA = {
  name: "candidate_pairwise_comparison",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "decisive_dimensions", "reason", "evidence", "risks", "qualification_review_candidate"],
    properties: {
      decision: { type: "string", enum: ["candidate_a", "candidate_b", "tie", "qualification_review_required"] },
      decisive_dimensions: { type: "array", maxItems: 8, items: { type: "string" } },
      reason: { type: "string" },
      evidence: { type: "array", maxItems: 12, items: { type: "string" } },
      risks: { type: "array", maxItems: 8, items: { type: "string" } },
      qualification_review_candidate: { type: ["string", "null"], enum: ["candidate_a", "candidate_b", null] },
    },
  },
} as const;

export const FINAL_SCHEMA = {
  name: "candidate_final_judgment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "match_reasons", "evidence", "risks", "missing_information", "recommended_next_action"],
    properties: {
      decision: { type: "string", enum: ["contact", "review", "hold", "reject"] },
      match_reasons: { type: "array", maxItems: 10, items: { type: "string" } },
      evidence: { type: "array", maxItems: 12, items: { type: "string" } },
      risks: { type: "array", maxItems: 8, items: { type: "string" } },
      missing_information: { type: "array", maxItems: 8, items: { type: "string" } },
      recommended_next_action: { type: "string" },
    },
  },
} as const;

function stringArray(value: unknown, limit = 12) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, limit)
    : [];
}

function candidatePrompt(bundle: CandidateBundle) {
  return {
    profile_id: bundle.profile.id,
    name: bundle.profile.name,
    current_title: bundle.profile.current_title,
    current_company: bundle.profile.current_company,
    seniority: bundle.profile.seniority,
    years_experience: bundle.profile.years_experience,
    roles: bundle.profile.role_families,
    skills: bundle.profile.skills,
    domains: bundle.profile.domains,
    capabilities: bundle.profile.capabilities,
    location: {
      country: bundle.profile.country_code,
      state: bundle.profile.state_or_region,
      city: bundle.profile.city,
      metro: bundle.profile.metro_area,
    },
    education: {
      highest_degree: bundle.profile.highest_degree,
      schools: bundle.profile.schools,
      fields_of_study: bundle.profile.fields_of_study,
    },
    evidence: bundle.profile.semantic_evidence,
    retrieval_evidence: bundle.retrievalEvidence,
    experiences: bundle.experiences.map((item) => ({
      id: item.id,
      title: item.title,
      company: item.company,
      period: [item.start_date, item.is_current ? "Present" : item.end_date],
      location: item.location,
      description: item.description,
      search_document: item.search_document,
    })),
  };
}

export async function loadCandidateBundles(
  profileIds: string[],
  evidenceByProfile: Map<string, Record<string, unknown>>,
) {
  if (profileIds.length === 0) return [];
  const profiles = await db.select().from(hirelix_profiles).where(inArray(hirelix_profiles.id, profileIds));
  const experiences = await db.select().from(hirelix_profile_experiences).where(inArray(hirelix_profile_experiences.profile_id, profileIds));
  const byProfile = new Map<string, typeof experiences>();
  for (const experience of experiences) {
    const rows = byProfile.get(experience.profile_id) || [];
    rows.push(experience);
    byProfile.set(experience.profile_id, rows);
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return profileIds.flatMap((profileId) => {
    const profile = profileById.get(profileId);
    return profile ? [{
      profile,
      experiences: (byProfile.get(profileId) || []).sort((a, b) => a.source_ordinal - b.source_ordinal),
      retrievalEvidence: evidenceByProfile.get(profileId) || {},
    }] : [];
  });
}

export async function qualifyCandidate(
  jd: Record<string, unknown>,
  bundle: CandidateBundle,
  usage: { searchId: string; jobId: string; userId: string },
  modelOverride?: string,
): Promise<Qualification> {
  const model = modelOverride || process.env.SEARCH_LIGHT_MODEL || getLightweightLlmModel();
  const { data } = await generateLlmJson<Record<string, unknown>>({
    model,
    system: "Judge only whether the candidate clears the minimum contact threshold for this JD. Use concrete profile evidence. Unknown information is not rejection evidence. Employer or school prestige and title similarity are never sufficient. Return reject only for a supported mismatch; maybe means plausible but insufficient evidence.",
    prompt: JSON.stringify({
      output_contract: QUALIFICATION_SCHEMA.schema,
      jd,
      candidate: candidatePrompt(bundle),
    }),
    maxOutputTokens: 1800,
    timeoutMs: 60_000,
    temperature: 0,
    jsonSchema: QUALIFICATION_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_QUALIFICATION_THINKING", "disabled"),
    usageEvent: { ...usage, stage: modelOverride ? "qualification_review" : "qualification", candidateIndexes: null },
  });
  const decision = data.decision === "advance" || data.decision === "reject" ? data.decision : "maybe";
  return {
    profileId: bundle.profile.id,
    decision,
    supportingEvidence: stringArray(data.supporting_evidence, 10),
    missingInformation: stringArray(data.missing_information, 10),
    rejectionReasons: stringArray(data.rejection_reasons, 10),
    model,
  };
}

type ComparisonResult = {
  rawDecision: "candidate_a" | "candidate_b" | "tie" | "qualification_review_required";
  outcome: "a" | "b" | "tie" | null;
  reviewProfileId: string | null;
  decisiveDimensions: string[];
  reason: string;
  evidence: string[];
  risks: string[];
  model: string;
  requestHash: string;
};

async function compareCandidates(
  jd: Record<string, unknown>,
  first: CandidateBundle,
  second: CandidateBundle,
  usage: { searchId: string; jobId: string; userId: string },
): Promise<ComparisonResult> {
  const model = process.env.SEARCH_JUDGE_MODEL || getDefaultLlmModel();
  const payload = {
    output_contract: COMPARISON_SCHEMA.schema,
    jd,
    candidate_a: candidatePrompt(first),
    candidate_b: candidatePrompt(second),
  };
  const requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const { data } = await generateLlmJson<Record<string, unknown>>({
    model,
    system: "Both candidates already passed a minimum qualification gate. If a recruiter can contact only one first for this JD, choose the candidate with stronger concrete JD-relevant evidence. Allow tie. Do not output a numeric score or confidence. Use qualification_review_required only when profile evidence reveals a clear minimum-qualification problem missed by the gate.",
    prompt: JSON.stringify(payload),
    maxOutputTokens: 1800,
    timeoutMs: 60_000,
    temperature: 0,
    jsonSchema: COMPARISON_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PAIRWISE_THINKING", "disabled"),
    usageEvent: { ...usage, stage: "pairwise_comparison" },
  });
  const rawDecision = data.decision === "candidate_a" || data.decision === "candidate_b" || data.decision === "tie"
    ? data.decision
    : "qualification_review_required";
  const reviewProfileId = rawDecision === "qualification_review_required"
    ? data.qualification_review_candidate === "candidate_b" ? second.profile.id : first.profile.id
    : null;
  return {
    rawDecision,
    outcome: rawDecision === "candidate_a" ? "a" : rawDecision === "candidate_b" ? "b" : rawDecision === "tie" ? "tie" : null,
    reviewProfileId,
    decisiveDimensions: stringArray(data.decisive_dimensions, 8),
    reason: typeof data.reason === "string" ? data.reason : "",
    evidence: stringArray(data.evidence),
    risks: stringArray(data.risks, 8),
    model,
    requestHash,
  };
}

function graphComponents(ids: string[], comparisons: ComparisonOutcome[]) {
  const adjacent = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const item of comparisons) { adjacent.get(item.a)?.add(item.b); adjacent.get(item.b)?.add(item.a); }
  const remaining = new Set(ids);
  const components: string[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value as string;
    const component: string[] = [];
    const queue = [first];
    remaining.delete(first);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacent.get(current) || []) {
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

async function persistComparison(params: {
  searchId: string; pairKey: string; attempt: number; presentedOrder: "ab" | "ba";
  canonicalA: string; canonicalB: string; result: ComparisonResult; orderSwap: boolean; stable: boolean; included: boolean;
}) {
  await db.insert(hirelix_candidate_comparisons).values({
    search_id: params.searchId,
    candidate_a_profile_id: params.canonicalA,
    candidate_b_profile_id: params.canonicalB,
    pair_key: params.pairKey,
    attempt: params.attempt,
    presented_order: params.presentedOrder,
    decision: params.result.rawDecision,
    decisive_dimensions: params.result.decisiveDimensions,
    reason: params.result.reason,
    evidence: params.result.evidence,
    risks: params.result.risks,
    qualification_review_profile_id: params.result.reviewProfileId,
    is_order_swap: params.orderSwap,
    is_stable: params.stable,
    included_in_fit: params.included,
    model: params.result.model,
    prompt_version: 1,
    request_hash: params.result.requestHash,
  }).onConflictDoUpdate({
    target: [
      hirelix_candidate_comparisons.search_id,
      hirelix_candidate_comparisons.pair_key,
      hirelix_candidate_comparisons.attempt,
      hirelix_candidate_comparisons.presented_order,
    ],
    set: { decision: params.result.rawDecision, is_stable: params.stable, included_in_fit: params.included },
  });
}

export async function runPairwiseRanking(
  jd: Record<string, unknown>,
  bundles: CandidateBundle[],
  usage: { searchId: string; jobId: string; userId: string },
): Promise<{ rankings: DavidsonRank[]; comparisonCount: number; unstableCount: number; graphConnected: boolean; qualificationRejectedProfileIds: string[] }> {
  if (bundles.length < 2) {
    return { rankings: bundles.map((item) => ({ profileId: item.profile.id, score: 0, rank: 1, rankLow: 1, rankHigh: 1 })), comparisonCount: 0, unstableCount: 0, graphConnected: true, qualificationRejectedProfileIds: [] };
  }
  const byId = new Map(bundles.map((item) => [item.profile.id, item]));
  const pairs = buildConnectedComparisonPairs([...byId.keys()], { seed: usage.searchId });
  let unstableCount = 0;
  const outcomes: ComparisonOutcome[] = [];
  const concurrency = Math.max(1, Math.min(8, Number(process.env.SEARCH_PAIRWISE_CONCURRENCY || 6)));
  const results = await runWithConcurrency(pairs, concurrency, async (pair) => {
    const first = await compareCandidates(jd, byId.get(pair.a)!, byId.get(pair.b)!, usage);
    if (!first.outcome) {
      await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 1, presentedOrder: "ab", canonicalA: pair.a, canonicalB: pair.b, result: first, orderSwap: false, stable: false, included: false });
      if (!first.reviewProfileId) return { outcome: null, rejectedProfileId: null };
      const reviewedBundle = byId.get(first.reviewProfileId)!;
      const reviewed = await qualifyCandidate(
        jd,
        reviewedBundle,
        usage,
        process.env.SEARCH_ARBITER_MODEL || "deepseek-v4-pro",
      );
      if (reviewed.decision === "reject") {
        return { outcome: null, rejectedProfileId: first.reviewProfileId };
      }
      const retry = await compareCandidates(jd, byId.get(pair.a)!, byId.get(pair.b)!, usage);
      await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 2, presentedOrder: "ab", canonicalA: pair.a, canonicalB: pair.b, result: retry, orderSwap: false, stable: Boolean(retry.outcome), included: Boolean(retry.outcome) });
      return {
        outcome: retry.outcome ? { a: pair.a, b: pair.b, outcome: retry.outcome } as ComparisonOutcome : null,
        rejectedProfileId: null,
      };
    }
    if (!pair.orderSwap) {
      await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 1, presentedOrder: "ab", canonicalA: pair.a, canonicalB: pair.b, result: first, orderSwap: false, stable: true, included: true });
      return { outcome: { a: pair.a, b: pair.b, outcome: first.outcome } as ComparisonOutcome, rejectedProfileId: null };
    }
    const swapped = await compareCandidates(jd, byId.get(pair.b)!, byId.get(pair.a)!, usage);
    const stable = swapped.outcome != null && areOrderSwapDecisionsConsistent(first.outcome, swapped.outcome);
    await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 1, presentedOrder: "ab", canonicalA: pair.a, canonicalB: pair.b, result: first, orderSwap: false, stable, included: stable });
    await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 1, presentedOrder: "ba", canonicalA: pair.a, canonicalB: pair.b, result: swapped, orderSwap: true, stable, included: false });
    if (!stable) {
      unstableCount += 1;
      const retry = await compareCandidates(jd, byId.get(pair.a)!, byId.get(pair.b)!, usage);
      await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 2, presentedOrder: "ab", canonicalA: pair.a, canonicalB: pair.b, result: retry, orderSwap: false, stable: false, included: false });
      return { outcome: null, rejectedProfileId: null };
    }
    return { outcome: { a: pair.a, b: pair.b, outcome: first.outcome } as ComparisonOutcome, rejectedProfileId: null };
  });
  const qualificationRejectedProfileIds = [...new Set(results.map((item) => item.rejectedProfileId).filter((item): item is string => Boolean(item)))];
  outcomes.push(...results.map((item) => item.outcome).filter((item): item is ComparisonOutcome => Boolean(item)));
  if (qualificationRejectedProfileIds.length > 0) {
    for (const profileId of qualificationRejectedProfileIds) {
      await db.update(hirelix_candidate_comparisons).set({ included_in_fit: false }).where(and(
        eq(hirelix_candidate_comparisons.search_id, usage.searchId),
        or(
          eq(hirelix_candidate_comparisons.candidate_a_profile_id, profileId),
          eq(hirelix_candidate_comparisons.candidate_b_profile_id, profileId),
        ),
      ));
    }
  }
  const activeIds = [...byId.keys()].filter((id) => !qualificationRejectedProfileIds.includes(id));
  const activeOutcomes = outcomes.filter((item) => activeIds.includes(item.a) && activeIds.includes(item.b));
  outcomes.length = 0;
  outcomes.push(...activeOutcomes);

  if (activeIds.length < 2) {
    return {
      rankings: activeIds.map((profileId) => ({ profileId, score: 0, rank: 1, rankLow: 1, rankHigh: 1 })),
      comparisonCount: outcomes.length,
      unstableCount,
      graphConnected: true,
      qualificationRejectedProfileIds,
    };
  }

  let components = graphComponents(activeIds, outcomes);
  let repair = 1;
  while (components.length > 1) {
    const a = components[0][0];
    const b = components[1][0];
    const pairKey = [a, b].sort().join(":");
    const result = await compareCandidates(jd, byId.get(a)!, byId.get(b)!, usage);
    if (!result.outcome) throw new Error("Unable to connect pairwise comparison graph after qualification review request");
    const outcome = a < b ? result.outcome : result.outcome === "a" ? "b" : result.outcome === "b" ? "a" : "tie";
    const canonicalA = a < b ? a : b;
    const canonicalB = a < b ? b : a;
    outcomes.push({ a: canonicalA, b: canonicalB, outcome });
    await persistComparison({ searchId: usage.searchId, pairKey, attempt: 100 + repair, presentedOrder: a === canonicalA ? "ab" : "ba", canonicalA, canonicalB, result, orderSwap: false, stable: true, included: true });
    components = graphComponents(activeIds, outcomes);
    repair += 1;
  }
  return {
    rankings: fitDavidsonRanking(activeIds, outcomes, { bootstrapRounds: 200, seed: usage.searchId }),
    comparisonCount: outcomes.length,
    unstableCount,
    graphConnected: components.length === 1,
    qualificationRejectedProfileIds,
  };
}

export async function judgeFinalCandidate(
  jd: Record<string, unknown>,
  bundle: CandidateBundle,
  qualification: Qualification,
  ranking: DavidsonRank | null,
  usage: { searchId: string; jobId: string; userId: string },
): Promise<FinalJudgment> {
  const model = process.env.SEARCH_ARBITER_MODEL || "deepseek-v4-pro";
  const { data } = await generateLlmJson<Record<string, unknown>>({
    model,
    system: "Make the final recruiter-facing decision for this JD from the complete profile and evidence pack. Every positive claim must point to concrete work evidence. Do not convert missing information into a rejection unless the JD explicitly makes it mandatory.",
    prompt: JSON.stringify({
      output_contract: FINAL_SCHEMA.schema,
      jd,
      candidate: candidatePrompt(bundle),
      qualification,
      relative_ranking: ranking,
    }),
    maxOutputTokens: 2200,
    timeoutMs: 60_000,
    temperature: 0,
    jsonSchema: FINAL_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_FINAL_JUDGMENT_THINKING", "enabled"),
    usageEvent: { ...usage, stage: "final_judgment" },
  });
  const decision = data.decision === "contact" || data.decision === "review" || data.decision === "reject" ? data.decision : "hold";
  return {
    profileId: bundle.profile.id,
    decision,
    matchReasons: stringArray(data.match_reasons, 10),
    evidence: stringArray(data.evidence),
    risks: stringArray(data.risks, 8),
    missingInformation: stringArray(data.missing_information, 8),
    recommendedNextAction: typeof data.recommended_next_action === "string" ? data.recommended_next_action : decision,
  };
}
