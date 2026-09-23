/** Shared by the search worker, API, and result UI. No model or database dependencies. */
export const SEARCH_DECISION_VERSION = 2;

export type SearchRequirement = {
  id: string;
  description: string;
  kind: "core_work" | "capability" | "seniority" | "location" | "work_model" | "eligibility";
  priority: "required" | "preferred";
  verification: "before_outreach" | "during_outreach";
};

export type SearchDecisionContract = {
  version: number;
  inputHash: string;
  title: string;
  requirements: SearchRequirement[];
  location: {
    scope: string | null;
    terms: string[];
    countries: string[];
    strict: boolean;
    workModel: string;
    relocationAllowed: string;
  };
};

export type RequirementEvidence = {
  requirementId: string;
  description: string;
  status: "supported" | "contradicted" | "unknown";
  explanation: string;
  /** References into the profile snapshot supplied to this judgment. */
  sources: string[];
};

export type CandidateAssessment = {
  coreFit: "direct" | "equivalent" | "adjacent" | "insufficient";
  requirements: RequirementEvidence[];
};

export type CandidateDecision = "contact" | "review" | "hold" | "reject";

export type CandidateDecisionRecord = {
  version: number;
  contractHash: string;
  decision: CandidateDecision;
  modelDecision: CandidateDecision;
  assessment: CandidateAssessment;
  unresolvedRequirements: string[];
  blockingRequirements: string[];
  reconciliation: string | null;
  sourceEvidence?: Record<string, string>;
  provenance: {
    profileHash: string | null;
    snapshotId: string | null;
    retrievedAt: string | null;
    evaluatedAt: string;
    representationVersion: number | null;
  };
};

export type SearchOutcome = {
  version: number;
  status: "ready" | "partial" | "verification_needed" | "no_matches";
  contactCount: number;
  reviewCount: number;
  holdCount: number;
  rejectedCount: number;
  evaluatedCount: number;
  retrievedCount: number;
  targetCount: number;
  stopReason: string;
  explanation: string;
};

export const ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["core_fit", "requirements"],
  properties: {
    core_fit: { type: "string", enum: ["direct", "equivalent", "adjacent", "insufficient"] },
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement_id", "status", "explanation", "sources"],
        properties: {
          requirement_id: { type: "string" },
          status: { type: "string", enum: ["supported", "contradicted", "unknown"] },
          explanation: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readDecisionContract(value: unknown): SearchDecisionContract | null {
  const item = record(value);
  if (item.version !== SEARCH_DECISION_VERSION || typeof item.inputHash !== "string" || !Array.isArray(item.requirements) || !item.location) return null;
  return item as unknown as SearchDecisionContract;
}

/** Missing rows and unsupported citations remain unknown; they never become positive evidence. */
export function normalizeAssessment(
  value: unknown,
  contract: SearchDecisionContract,
  sourceReferences: Iterable<string>,
): CandidateAssessment {
  const item = record(value);
  const allowedSources = new Set(sourceReferences);
  const rows = Array.isArray(item.requirements) ? item.requirements.map(record) : [];
  const coreFit = ["direct", "equivalent", "adjacent"].includes(String(item.core_fit))
    ? item.core_fit as CandidateAssessment["coreFit"] : "insufficient";
  return {
    coreFit,
    requirements: contract.requirements.map((requirement) => {
      const matches = rows.filter((row) => row.requirement_id === requirement.id);
      const row = matches.length === 1 ? matches[0] : {};
      const sources = Array.isArray(row.sources)
        ? [...new Set(row.sources.filter((source): source is string => typeof source === "string" && allowedSources.has(source)))] : [];
      const claimed = row.status === "supported" || row.status === "contradicted" ? row.status : "unknown";
      return {
        requirementId: requirement.id,
        description: requirement.description,
        status: sources.length === 0 ? "unknown" : claimed,
        explanation: typeof row.explanation === "string" && row.explanation.trim()
          ? row.explanation.trim() : "The available profile does not establish this requirement.",
        sources,
      };
    }),
  };
}

/** Enforce evidence contracts, without reimplementing semantic recruiting judgment. */
export function resolveCandidateDecision(params: {
  contract: SearchDecisionContract;
  assessment: CandidateAssessment;
  modelDecision: CandidateDecision;
  previousDecision?: string;
  reconciliation?: string | null;
}) {
  const byId = new Map(params.assessment.requirements.map((item) => [item.requirementId, item]));
  const blocking = params.contract.requirements.filter((requirement) =>
    requirement.priority === "required" && byId.get(requirement.id)?.status === "contradicted",
  );
  const unresolved = params.contract.requirements.filter((requirement) =>
    requirement.priority === "required" && requirement.verification === "before_outreach" && byId.get(requirement.id)?.status !== "supported",
  );
  let decision = params.modelDecision;
  if (blocking.length > 0) decision = "reject";
  else if (decision === "contact" && (unresolved.length > 0 || !["direct", "equivalent"].includes(params.assessment.coreFit))) decision = "review";
  // A final review may recover a candidate, but must explain the earlier uncertainty or conflict.
  if (decision === "contact" && params.previousDecision && params.previousDecision !== "advance" && !params.reconciliation?.trim()) decision = "review";
  return {
    decision,
    unresolvedRequirements: unresolved.map((item) => item.id),
    blockingRequirements: blocking.map((item) => item.id),
  };
}

export function getDecisionRecord(candidate: { metadata?: unknown; evidence_pack?: unknown }): CandidateDecisionRecord | null {
  const metadata = record(candidate.metadata);
  const evidence = record(candidate.evidence_pack);
  const value = record(metadata.decision_record || evidence.decision_record);
  return value.version === SEARCH_DECISION_VERSION && typeof value.decision === "string"
    ? value as unknown as CandidateDecisionRecord : null;
}

export function usesEvidenceRanking(candidate: { metadata?: unknown }) {
  const metadata = record(candidate.metadata);
  return typeof metadata.analysis_stage === "string" && metadata.analysis_stage.startsWith("candidate_index_");
}

export function candidateDecision(candidate: { final_decision?: string | null; metadata?: unknown; evidence_pack?: unknown }): CandidateDecision {
  const decision = getDecisionRecord(candidate)?.decision || candidate.final_decision;
  if (decision === "contact" || decision === "review" || decision === "reject" || decision === "hold") return decision;
  const bucket = record(candidate.metadata).delivery_bucket;
  return bucket === "reach_first" ? "contact" : bucket === "review_next" ? "review" : bucket === "not_recommended" ? "reject" : "hold";
}

export function buildSearchOutcome(params: {
  candidates: Array<{ final_decision?: string | null; metadata?: unknown; evidence_pack?: unknown }>;
  retrievedCount: number;
  targetCount: number;
  stopReason: string;
  explanation?: string;
}): SearchOutcome {
  const counts = { contact: 0, review: 0, hold: 0, reject: 0 };
  params.candidates.forEach((candidate) => { counts[candidateDecision(candidate)] += 1; });
  const status = counts.contact >= params.targetCount ? "ready" : counts.contact > 0 ? "partial" : counts.review > 0 ? "verification_needed" : "no_matches";
  const explanation = params.explanation || (status === "ready"
    ? "The recommended candidates have evidence for the required work. Review the stated checks before contacting them."
    : status === "partial" ? "The current search found a limited number of candidates with enough evidence for outreach. Other profiles need verification or did not meet the role requirements."
      : status === "verification_needed" ? "No candidate yet has enough confirmed profile evidence for a recommendation. The verification list shows the specific gaps to resolve."
        : "The evaluated profiles did not establish a suitable match. The full pool and reasons remain available.");
  return { version: SEARCH_DECISION_VERSION, status, contactCount: counts.contact, reviewCount: counts.review, holdCount: counts.hold, rejectedCount: counts.reject, evaluatedCount: params.candidates.length, retrievedCount: params.retrievedCount, targetCount: params.targetCount, stopReason: params.stopReason, explanation };
}

/** Keep worker recovery data out of repeatedly-polled browser payloads. */
export function publicSearchRequirements(value: unknown) {
  const result = { ...record(value) };
  delete result.candidate_index_checkpoint;
  return result;
}
