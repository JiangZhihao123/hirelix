import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_candidate_comparisons, hirelix_profile_experiences, hirelix_profiles } from "@/db/schema";
import { generateLlmJson, getDefaultLlmModel, getLightweightLlmModel, resolveDeepSeekThinkingMode } from "@/lib/llm-client";
import {
  areOrderSwapDecisionsConsistent,
  buildConnectedComparisonPairs,
  fitDavidsonRanking,
  stableDecisionToPresentedOutcome,
  type ComparisonOutcome,
  type DavidsonRank,
  type StableCandidateToken,
} from "@/lib/candidate-index/ranking";
import { runWithConcurrency } from "@/lib/search/concurrency";

type CandidateBundleProfile = Pick<typeof hirelix_profiles.$inferSelect,
  | "id" | "linkedin_url" | "name" | "current_title" | "current_company"
  | "seniority" | "years_experience" | "role_families" | "skills" | "domains"
  | "capabilities" | "country_code" | "state_or_region" | "city" | "metro_area"
  | "highest_degree" | "schools" | "fields_of_study" | "profile_summary"
  | "semantic_evidence" | "raw_profile"
>;

type CandidateBundleExperience = Pick<typeof hirelix_profile_experiences.$inferSelect,
  | "id" | "profile_id" | "source_ordinal" | "title" | "company" | "start_date"
  | "end_date" | "is_current" | "location" | "description" | "search_document"
>;

export type CandidateBundle = {
  profile: CandidateBundleProfile;
  experiences: CandidateBundleExperience[];
  retrievalEvidence: Record<string, unknown>;
};

export type Qualification = {
  profileId: string;
  decision: "advance" | "maybe" | "reject";
  supportingEvidence: string[];
  missingInformation: string[];
  rejectionReasons: string[];
  comparisonCard: ComparisonCard;
  model: string;
};

type EvidenceLevel<T extends string> = {
  level: T;
  evidence: string[];
};

export type ComparisonCard = {
  mandatoryEligibility: EvidenceLevel<"pass" | "unknown" | "fail">;
  coreWork: EvidenceLevel<"direct" | "equivalent" | "adjacent" | "none">;
  productionOwnership: EvidenceLevel<"strong" | "moderate" | "limited" | "unknown">;
  seniorityAlignment: EvidenceLevel<"aligned" | "underleveled" | "overleveled" | "unknown">;
  careerDirection: EvidenceLevel<"aligned" | "mixed" | "adjacent" | "unknown">;
  joinSignals: EvidenceLevel<"positive" | "negative" | "mixed" | "none">;
};

const comparisonCardDimension = (levels: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["level", "evidence"],
  properties: {
    level: { type: "string", enum: levels },
    evidence: { type: "array", maxItems: 6, items: { type: "string" } },
  },
});

export type FinalJudgment = {
  profileId: string;
  decision: "contact" | "review" | "hold" | "reject";
  joinLikelihood: "high" | "medium" | "low" | "unknown";
  joinLikelihoodScore: number;
  joinLikelihoodReasons: string[];
  joinLikelihoodRisks: string[];
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
    required: ["decision", "supporting_evidence", "missing_information", "rejection_reasons", "comparison_card"],
    properties: {
      decision: { type: "string", enum: ["advance", "maybe", "reject"] },
      supporting_evidence: { type: "array", maxItems: 10, items: { type: "string" } },
      missing_information: { type: "array", maxItems: 10, items: { type: "string" } },
      rejection_reasons: { type: "array", maxItems: 10, items: { type: "string" } },
      comparison_card: {
        type: "object",
        additionalProperties: false,
        required: ["mandatory_eligibility", "core_work", "production_ownership", "seniority_alignment", "career_direction", "join_signals"],
        properties: {
          mandatory_eligibility: comparisonCardDimension(["pass", "unknown", "fail"]),
          core_work: comparisonCardDimension(["direct", "equivalent", "adjacent", "none"]),
          production_ownership: comparisonCardDimension(["strong", "moderate", "limited", "unknown"]),
          seniority_alignment: comparisonCardDimension(["aligned", "underleveled", "overleveled", "unknown"]),
          career_direction: comparisonCardDimension(["aligned", "mixed", "adjacent", "unknown"]),
          join_signals: comparisonCardDimension(["positive", "negative", "mixed", "none"]),
        },
      },
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
      decision: { type: "string", enum: ["candidate_1", "candidate_2", "tie", "qualification_review_required"] },
      decisive_dimensions: { type: "array", maxItems: 8, items: { type: "string" } },
      reason: { type: "string" },
      evidence: { type: "array", maxItems: 12, items: { type: "string" } },
      risks: { type: "array", maxItems: 8, items: { type: "string" } },
      qualification_review_candidate: { type: ["string", "null"], enum: ["candidate_1", "candidate_2", null] },
    },
  },
} as const;

export const FINAL_SCHEMA = {
  name: "candidate_final_judgment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "decision",
      "join_likelihood",
      "join_likelihood_score",
      "join_likelihood_reasons",
      "join_likelihood_risks",
      "match_reasons",
      "evidence",
      "risks",
      "missing_information",
      "recommended_next_action",
    ],
    properties: {
      decision: { type: "string", enum: ["contact", "review", "hold", "reject"] },
      join_likelihood: { type: "string", enum: ["high", "medium", "low", "unknown"] },
      join_likelihood_score: { type: "number", minimum: 0, maximum: 100 },
      join_likelihood_reasons: { type: "array", maxItems: 10, items: { type: "string" } },
      join_likelihood_risks: { type: "array", maxItems: 10, items: { type: "string" } },
      match_reasons: { type: "array", maxItems: 10, items: { type: "string" } },
      evidence: { type: "array", maxItems: 12, items: { type: "string" } },
      risks: { type: "array", maxItems: 8, items: { type: "string" } },
      missing_information: { type: "array", maxItems: 8, items: { type: "string" } },
      recommended_next_action: { type: "string" },
    },
  },
} as const;

export const CANDIDATE_JUDGMENT_PROMPT_VERSION = 4;

export const QUALIFICATION_SYSTEM_PROMPT = [
  "Return JSON matching output_contract.",
  "Judge only whether the candidate has enough concrete evidence of job fit and eligibility to enter relative ranking for this JD.",
  "Do not estimate willingness to change jobs and do not require active-job-seeking, open-to-work, or other availability signals.",
  "Unknown information is not rejection evidence; employer or school prestige and title similarity are never sufficient.",
  "advance means the profile contains strong direct or clearly equivalent evidence for the core work and mandatory constraints.",
  "maybe means the fit is plausible but evidence for a JD-relevant capability or mandatory fact is incomplete.",
  "Return reject only for a concrete supported mismatch or failed mandatory constraint.",
  "Build comparison_card once from cited profile facts; it is a stable evidence card for later relative comparisons, not a numeric score.",
  "For core_work, direct requires explicit JD-core work and equivalent requires evidence of the same behavior; RAG, chatbots, or adjacent LLM work alone do not prove multi-step agentic reasoning.",
  "Judge core_work independently from production scale: an internship or prototype can be direct core work, while scale belongs only in production_ownership.",
  "Do not downgrade transferable core work merely because it was done in another industry unless the JD explicitly requires domain experience.",
  "For mandatory_eligibility, missing education, authorization, location preference, or availability is unknown rather than fail; US location never proves US work authorization.",
  "Never put assumptions such as likely, probably, inferred, or assumed into evidence; cite only stated facts, and keep join_signals evidence empty when its level is none.",
].join(" ");

export const PAIRWISE_COMPARISON_SYSTEM_PROMPT = [
  "Return JSON matching output_contract.",
  "Both candidates passed a minimum job-fit gate; decide who a recruiter should contact first for this specific JD.",
  "Each candidate contains a fixed comparison_card produced independently from the full profile. Compare only those cards and identity context; do not invent, re-extract, or reinterpret omitted profile facts.",
  "candidate_token is a stable identity label that does not indicate quality; never favor the first listed candidate or a particular token.",
  "First assess each candidate independently against exactly the same evidence hierarchy, then compare them dimension by dimension.",
  "Use this fixed priority: (1) explicit mandatory eligibility, (2) concrete evidence of the JD's core work, (3) production ownership and scope, (4) seniority alignment, (5) career direction, and only then (6) evidence-based likelihood of considering the opportunity.",
  "A lower-priority dimension may break a close tie but must not override a material advantage on a higher-priority dimension.",
  "Base mandatory-constraint failures only on explicit contradictory evidence; missing education, work authorization, location preference, or availability is unknown and must not trigger qualification_review_required.",
  "Use evidence-based likelihood of considering the opportunity only as a secondary prioritization factor, especially when job fit is close.",
  "A missing active-job-seeking or availability signal is neutral and must not make an otherwise stronger candidate lose; unknown willingness is unknown, not low.",
  "Explicit positive or negative willingness evidence may affect priority, but a weaker-fit candidate must not win merely because they appear more available.",
  "Read the full career trajectory, current role, scope, direction, work model, location, employment preferences, and explicit availability signals in context.",
  "The payload includes evaluation_date: calculate tenure or recency from exact profile dates and evaluation_date, and never let tenure alone determine willingness.",
  "Every willingness claim or risk must cite an actual profile fact.",
  "Do not speculate about employer prestige, compensation, domain interest, relocation, remote preference, personal circumstances, or protected traits; record unsupported matters as unknown.",
  "Prefer tie when expected recruiting priority is genuinely indistinguishable; do not output a numeric score or confidence.",
  "Use qualification_review_required only when concrete evidence reveals a minimum-qualification problem missed by the gate.",
].join(" ");

export const FINAL_JUDGMENT_SYSTEM_PROMPT = [
  "Return concise JSON matching output_contract; keep each array to the few strongest non-duplicative items and each string under 180 characters.",
  "Make the final recruiter-facing decision for this specific JD from the complete profile, qualification evidence, and relative ranking.",
  "Evaluate job fit and join likelihood as separate questions: job fit determines whether outreach is warranted, while join likelihood determines outreach priority, effort, and messaging.",
  "This is passive recruiting: contact does not require active-job-seeking, open-to-work, or any explicit statement that the person wants to leave.",
  "Use contact when concrete evidence shows strong direct or clearly equivalent fit for the core work and no evidence-based blocker makes outreach unreasonable; unknown willingness alone must not downgrade contact.",
  "Use review only when a JD-relevant capability, mandatory eligibility fact, or material fit question remains genuinely ambiguous and needs recruiter review; do not use review merely because willingness is unknown.",
  "Use hold when the candidate is relevant but materially weaker or has a substantial evidence-based fit or availability risk; use reject only for a clear supported mismatch or failed mandatory constraint.",
  "An explicit positive or negative willingness signal may change priority or expose a blocker, but join likelihood alone must not override compelling job fit.",
  "Read the career trajectory, current role, scope, direction, work model, location, employment preferences, and explicit availability signals in context.",
  "The payload includes evaluation_date: calculate tenure or recency from exact profile dates and evaluation_date, and never let tenure alone determine willingness.",
  "Treat profile signals as evidence, not certainty; every join-likelihood reason or risk must cite an actual profile fact.",
  "Do not speculate about employer prestige, compensation, domain interest, relocation, remote preference, personal circumstances, or protected traits; put unsupported matters in missing_information.",
  "Every claim must point to concrete profile evidence, and missing information is not rejection evidence unless the JD explicitly makes it mandatory.",
].join(" ");

function stringArray(value: unknown, limit = 12) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, limit)
    : [];
}

function comparisonDimension<T extends string>(
  value: unknown,
  levels: readonly T[],
  fallback: T,
): EvidenceLevel<T> {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const level = typeof item.level === "string" && levels.includes(item.level as T) ? item.level as T : fallback;
  return { level, evidence: stringArray(item.evidence, 6) };
}

function normalizeComparisonCard(value: unknown): ComparisonCard {
  const card = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    mandatoryEligibility: comparisonDimension(card.mandatory_eligibility, ["pass", "unknown", "fail"], "unknown"),
    coreWork: comparisonDimension(card.core_work, ["direct", "equivalent", "adjacent", "none"], "none"),
    productionOwnership: comparisonDimension(card.production_ownership, ["strong", "moderate", "limited", "unknown"], "unknown"),
    seniorityAlignment: comparisonDimension(card.seniority_alignment, ["aligned", "underleveled", "overleveled", "unknown"], "unknown"),
    careerDirection: comparisonDimension(card.career_direction, ["aligned", "mixed", "adjacent", "unknown"], "unknown"),
    joinSignals: comparisonDimension(card.join_signals, ["positive", "negative", "mixed", "none"], "none"),
  };
}

type CardComparison = {
  outcome: "a" | "b" | "tie";
  decisiveDimension: string;
  reason: string;
  evidence: string[];
};

function compareLevel(first: string, second: string, ranks: Record<string, number>) {
  const difference = (ranks[first] ?? 0) - (ranks[second] ?? 0);
  return difference > 0 ? "a" as const : difference < 0 ? "b" as const : "tie" as const;
}

export function compareComparisonCards(first: ComparisonCard, second: ComparisonCard): CardComparison {
  const dimensions: Array<{
    name: string;
    first: EvidenceLevel<string>;
    second: EvidenceLevel<string>;
    ranks: Record<string, number>;
  }> = [
    {
      name: "mandatory_eligibility",
      first: first.mandatoryEligibility,
      second: second.mandatoryEligibility,
      // Unknown is neutral; only explicit failure loses this dimension.
      ranks: { fail: 0, unknown: 1, pass: 1 },
    },
    {
      name: "core_work",
      first: first.coreWork,
      second: second.coreWork,
      ranks: { none: 0, adjacent: 1, equivalent: 2, direct: 3 },
    },
    {
      name: "production_ownership",
      first: first.productionOwnership,
      second: second.productionOwnership,
      ranks: { unknown: 1, limited: 1, moderate: 2, strong: 3 },
    },
    {
      name: "seniority_alignment",
      first: first.seniorityAlignment,
      second: second.seniorityAlignment,
      ranks: { underleveled: 0, overleveled: 0, unknown: 1, aligned: 1 },
    },
    {
      name: "career_direction",
      first: first.careerDirection,
      second: second.careerDirection,
      ranks: { adjacent: 0, unknown: 1, mixed: 1, aligned: 2 },
    },
    {
      name: "join_signals",
      first: first.joinSignals,
      second: second.joinSignals,
      ranks: { negative: 0, none: 1, mixed: 1, positive: 2 },
    },
  ];
  for (const dimension of dimensions) {
    const outcome = compareLevel(dimension.first.level, dimension.second.level, dimension.ranks);
    if (outcome === "tie") continue;
    return {
      outcome,
      decisiveDimension: dimension.name,
      reason: `${dimension.name}: ${dimension.first.level} vs ${dimension.second.level}`,
      evidence: outcome === "a" ? dimension.first.evidence : dimension.second.evidence,
    };
  }
  return {
    outcome: "tie",
    decisiveDimension: "no_material_difference",
    reason: "The fixed comparison cards contain no material difference at the configured priority levels.",
    evidence: [],
  };
}

function deterministicComparisonResult(
  first: CandidateBundle,
  second: CandidateBundle,
  firstToken: StableCandidateToken,
  comparisonCards: Map<string, ComparisonCard>,
): ComparisonResult {
  const firstCard = comparisonCards.get(first.profile.id);
  const secondCard = comparisonCards.get(second.profile.id);
  if (!firstCard || !secondCard) throw new Error("Pairwise ranking requires a comparison card for every candidate");
  const comparison = compareComparisonCards(firstCard, secondCard);
  const secondToken = firstToken === "candidate_1" ? "candidate_2" : "candidate_1";
  const rawDecision = comparison.outcome === "a"
    ? firstToken
    : comparison.outcome === "b"
      ? secondToken
      : "tie";
  const payload = { first_profile_id: first.profile.id, second_profile_id: second.profile.id, firstToken, comparison };
  return {
    rawDecision,
    outcome: comparison.outcome,
    reviewProfileId: null,
    decisiveDimensions: [comparison.decisiveDimension],
    reason: comparison.reason,
    evidence: comparison.evidence,
    risks: [],
    model: "evidence-card-comparator-v1",
    requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

async function withJudgmentRetry<T>(operation: () => Promise<T>, maxAttempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
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
  const profiles = await db.select({
    id: hirelix_profiles.id,
    linkedin_url: hirelix_profiles.linkedin_url,
    name: hirelix_profiles.name,
    current_title: hirelix_profiles.current_title,
    current_company: hirelix_profiles.current_company,
    seniority: hirelix_profiles.seniority,
    years_experience: hirelix_profiles.years_experience,
    role_families: hirelix_profiles.role_families,
    skills: hirelix_profiles.skills,
    domains: hirelix_profiles.domains,
    capabilities: hirelix_profiles.capabilities,
    country_code: hirelix_profiles.country_code,
    state_or_region: hirelix_profiles.state_or_region,
    city: hirelix_profiles.city,
    metro_area: hirelix_profiles.metro_area,
    highest_degree: hirelix_profiles.highest_degree,
    schools: hirelix_profiles.schools,
    fields_of_study: hirelix_profiles.fields_of_study,
    profile_summary: hirelix_profiles.profile_summary,
    semantic_evidence: hirelix_profiles.semantic_evidence,
    raw_profile: hirelix_profiles.raw_profile,
  }).from(hirelix_profiles).where(inArray(hirelix_profiles.id, profileIds));
  const experiences = await db.select({
    id: hirelix_profile_experiences.id,
    profile_id: hirelix_profile_experiences.profile_id,
    source_ordinal: hirelix_profile_experiences.source_ordinal,
    title: hirelix_profile_experiences.title,
    company: hirelix_profile_experiences.company,
    start_date: hirelix_profile_experiences.start_date,
    end_date: hirelix_profile_experiences.end_date,
    is_current: hirelix_profile_experiences.is_current,
    location: hirelix_profile_experiences.location,
    description: hirelix_profile_experiences.description,
    search_document: hirelix_profile_experiences.search_document,
  }).from(hirelix_profile_experiences).where(inArray(hirelix_profile_experiences.profile_id, profileIds));
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
  const { data } = await withJudgmentRetry(() => generateLlmJson<Record<string, unknown>>({
    model,
    system: QUALIFICATION_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      output_contract: QUALIFICATION_SCHEMA.schema,
      jd,
      candidate: candidatePrompt(bundle),
    }),
    maxOutputTokens: 2400,
    timeoutMs: 90_000,
    temperature: 0,
    jsonSchema: QUALIFICATION_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_QUALIFICATION_THINKING", "disabled"),
    usageEvent: { ...usage, stage: modelOverride ? "qualification_review" : "qualification", candidateIndexes: null },
  }));
  const comparisonCard = normalizeComparisonCard(data.comparison_card);
  const modelDecision = data.decision === "advance" || data.decision === "reject" ? data.decision : "maybe";
  const decision = comparisonCard.mandatoryEligibility.level === "fail" ? "reject" : modelDecision;
  const rejectionReasons = stringArray(data.rejection_reasons, 10);
  return {
    profileId: bundle.profile.id,
    decision,
    supportingEvidence: stringArray(data.supporting_evidence, 10),
    missingInformation: stringArray(data.missing_information, 10),
    rejectionReasons: comparisonCard.mandatoryEligibility.level === "fail" && rejectionReasons.length === 0
      ? ["Comparison card contains an explicit mandatory-eligibility failure."]
      : rejectionReasons,
    comparisonCard,
    model,
  };
}

function comparisonCandidatePrompt(bundle: CandidateBundle, card: ComparisonCard) {
  return {
    name: bundle.profile.name,
    current_title: bundle.profile.current_title,
    current_company: bundle.profile.current_company,
    location: {
      country: bundle.profile.country_code,
      state: bundle.profile.state_or_region,
      city: bundle.profile.city,
    },
    comparison_card: card,
  };
}

export type ComparisonResult = {
  rawDecision: "candidate_1" | "candidate_2" | "tie" | "qualification_review_required";
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
  firstToken: StableCandidateToken = "candidate_1",
  usageStage = "pairwise_comparison",
  comparisonCards?: Map<string, ComparisonCard>,
): Promise<ComparisonResult> {
  const secondToken: StableCandidateToken = firstToken === "candidate_1" ? "candidate_2" : "candidate_1";
  const model = process.env.SEARCH_JUDGE_MODEL || getDefaultLlmModel();
  const maxOutputTokens = model.includes("pro") ? 8000 : 3000;
  const payload = {
    output_contract: COMPARISON_SCHEMA.schema,
    evaluation_date: new Date().toISOString().slice(0, 10),
    jd,
    candidates: [
      { candidate_token: firstToken, candidate: comparisonCandidatePrompt(first, comparisonCards?.get(first.profile.id) || normalizeComparisonCard(null)) },
      { candidate_token: secondToken, candidate: comparisonCandidatePrompt(second, comparisonCards?.get(second.profile.id) || normalizeComparisonCard(null)) },
    ],
  };
  const requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const { data } = await withJudgmentRetry(() => generateLlmJson<Record<string, unknown>>({
    model,
    system: PAIRWISE_COMPARISON_SYSTEM_PROMPT,
    prompt: JSON.stringify(payload),
    maxOutputTokens,
    timeoutMs: 90_000,
    temperature: 0,
    jsonSchema: COMPARISON_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PAIRWISE_THINKING", "enabled"),
    usageEvent: { ...usage, stage: usageStage },
  }));
  const rawDecision = data.decision === "candidate_1" || data.decision === "candidate_2" || data.decision === "tie"
    ? data.decision
    : "qualification_review_required";
  const reviewProfileId = rawDecision === "qualification_review_required"
    ? data.qualification_review_candidate === secondToken ? second.profile.id : first.profile.id
    : null;
  return {
    rawDecision,
    outcome: rawDecision === "qualification_review_required"
      ? null
      : stableDecisionToPresentedOutcome(rawDecision, firstToken),
    reviewProfileId,
    decisiveDimensions: stringArray(data.decisive_dimensions, 8),
    reason: typeof data.reason === "string" ? data.reason : "",
    evidence: stringArray(data.evidence),
    risks: stringArray(data.risks, 8),
    model,
    requestHash,
  };
}

export async function auditCandidateOrderSwap(
  jd: Record<string, unknown>,
  canonicalFirst: CandidateBundle,
  canonicalSecond: CandidateBundle,
  usage: { searchId: string; jobId: string; userId: string },
  comparisonCards: Map<string, ComparisonCard>,
) {
  const first = await compareCandidates(
    jd,
    canonicalFirst,
    canonicalSecond,
    usage,
    "candidate_1",
    "pairwise_order_audit",
    comparisonCards,
  );
  const swapped = await compareCandidates(
    jd,
    canonicalSecond,
    canonicalFirst,
    usage,
    "candidate_2",
    "pairwise_order_audit",
    comparisonCards,
  );
  return {
    first,
    swapped,
    stable: first.outcome != null
      && swapped.outcome != null
      && areOrderSwapDecisionsConsistent(first.outcome, swapped.outcome),
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
    prompt_version: CANDIDATE_JUDGMENT_PROMPT_VERSION,
    request_hash: params.result.requestHash,
  }).onConflictDoUpdate({
    target: [
      hirelix_candidate_comparisons.search_id,
      hirelix_candidate_comparisons.pair_key,
      hirelix_candidate_comparisons.attempt,
      hirelix_candidate_comparisons.presented_order,
    ],
    set: {
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
      prompt_version: CANDIDATE_JUDGMENT_PROMPT_VERSION,
      request_hash: params.result.requestHash,
    },
  });
}

export async function runPairwiseRanking(
  jd: Record<string, unknown>,
  bundles: CandidateBundle[],
  usage: { searchId: string; jobId: string; userId: string },
  qualifications: Qualification[] = [],
): Promise<{ rankings: DavidsonRank[]; comparisonCount: number; unstableCount: number; graphConnected: boolean; qualificationRejectedProfileIds: string[] }> {
  if (bundles.length < 2) {
    return { rankings: bundles.map((item) => ({ profileId: item.profile.id, score: 0, rank: 1, rankLow: 1, rankHigh: 1 })), comparisonCount: 0, unstableCount: 0, graphConnected: true, qualificationRejectedProfileIds: [] };
  }
  const byId = new Map(bundles.map((item) => [item.profile.id, item]));
  const comparisonCards = new Map(qualifications.map((item) => [item.profileId, item.comparisonCard]));
  const pairs = buildConnectedComparisonPairs([...byId.keys()], { seed: usage.searchId });
  const concurrency = Math.max(1, Math.min(32, Number(process.env.SEARCH_PAIRWISE_CONCURRENCY || 24)));
  const outcomes = await runWithConcurrency(pairs, concurrency, async (pair) => {
    const firstBundle = byId.get(pair.a)!;
    const secondBundle = byId.get(pair.b)!;
    const first = deterministicComparisonResult(firstBundle, secondBundle, "candidate_1", comparisonCards);
    await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 1, presentedOrder: "ab", canonicalA: pair.a, canonicalB: pair.b, result: first, orderSwap: false, stable: true, included: true });
    if (pair.orderSwap) {
      const swapped = deterministicComparisonResult(secondBundle, firstBundle, "candidate_2", comparisonCards);
      const stable = swapped.outcome != null && areOrderSwapDecisionsConsistent(first.outcome!, swapped.outcome);
      if (!stable) throw new Error(`Evidence-card comparator changed under order swap for ${pair.pairKey}`);
      await persistComparison({ searchId: usage.searchId, pairKey: pair.pairKey, attempt: 1, presentedOrder: "ba", canonicalA: pair.a, canonicalB: pair.b, result: swapped, orderSwap: true, stable: true, included: false });
    }
    return { a: pair.a, b: pair.b, outcome: first.outcome! } as ComparisonOutcome;
  });
  const activeIds = [...byId.keys()];
  const components = graphComponents(activeIds, outcomes);
  if (components.length !== 1) throw new Error("Evidence-card comparison graph is not connected");
  return {
    rankings: fitDavidsonRanking(activeIds, outcomes, { bootstrapRounds: 200, seed: usage.searchId }),
    comparisonCount: outcomes.length,
    unstableCount: 0,
    graphConnected: true,
    qualificationRejectedProfileIds: [],
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
  const { data } = await withJudgmentRetry(() => generateLlmJson<Record<string, unknown>>({
    model,
    system: FINAL_JUDGMENT_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      output_contract: FINAL_SCHEMA.schema,
      evaluation_date: new Date().toISOString().slice(0, 10),
      jd,
      candidate: candidatePrompt(bundle),
      qualification,
      relative_ranking: ranking,
    }),
    maxOutputTokens: 4000,
    timeoutMs: 90_000,
    temperature: 0,
    jsonSchema: FINAL_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_FINAL_JUDGMENT_THINKING", "enabled"),
    usageEvent: { ...usage, stage: "final_judgment" },
  }), 5);
  return normalizeFinalJudgment(bundle.profile.id, data);
}

export function normalizeFinalJudgment(
  profileId: string,
  data: Record<string, unknown>,
): FinalJudgment {
  const decision = data.decision === "contact" || data.decision === "review" || data.decision === "reject" ? data.decision : "hold";
  const joinLikelihood = data.join_likelihood === "high" || data.join_likelihood === "medium" || data.join_likelihood === "low"
    ? data.join_likelihood
    : "unknown";
  const rawJoinLikelihoodScore = typeof data.join_likelihood_score === "number" && Number.isFinite(data.join_likelihood_score)
    ? data.join_likelihood_score
    : 0;
  return {
    profileId,
    decision,
    joinLikelihood,
    joinLikelihoodScore: joinLikelihood === "unknown"
      ? 50
      : Math.max(0, Math.min(100, Math.round(rawJoinLikelihoodScore))),
    joinLikelihoodReasons: stringArray(data.join_likelihood_reasons, 10),
    joinLikelihoodRisks: stringArray(data.join_likelihood_risks, 10),
    matchReasons: stringArray(data.match_reasons, 10),
    evidence: stringArray(data.evidence),
    risks: stringArray(data.risks, 8),
    missingInformation: stringArray(data.missing_information, 8),
    recommendedNextAction: typeof data.recommended_next_action === "string" ? data.recommended_next_action : decision,
  };
}
