import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAssessment, resolveCandidateDecision, buildSearchOutcome, type SearchDecisionContract } from "@/lib/search/decision-contract";
import { getCandidateDeliveryBucket, getCandidateScoreMetrics } from "@/app/(product)/app/search/[id]/_components/utils";
import type { CandidateRow } from "@/app/(product)/app/search/[id]/_components/types";
import { selectCandidatesForFinalReview } from "@/lib/candidate-index/workflow";
import type { Qualification } from "@/lib/candidate-index/judgment";
import { planSearchNextAction } from "@/lib/candidate-index/search-agent";

const contract: SearchDecisionContract = { version: 2, inputHash: "nyc-backend", title: "Backend engineer", requirements: [
  { id: "work", description: "Own production backend systems using Go OR Java OR Python", kind: "core_work", priority: "required", verification: "before_outreach" },
  { id: "geo", description: "Live within NYC commuting distance", kind: "location", priority: "required", verification: "before_outreach" },
  { id: "interest", description: "Interested in changing jobs", kind: "eligibility", priority: "required", verification: "during_outreach" },
], location: { scope: "NYC metro", terms: ["New York", "Jersey City"], countries: ["US"], strict: true, workModel: "hybrid", relocationAllowed: "no" } };
function assessment(geo = "supported", sources = ["profile.location"]) {
  return normalizeAssessment({ core_fit: "direct", requirements: [
    { requirement_id: "work", status: "supported", explanation: "Built and operated backend APIs", sources: ["exp-0"] },
    { requirement_id: "geo", status: geo, explanation: "Profile location evidence", sources },
  ] }, contract, ["profile.location", "exp-0"]);
}
test("unknown location prevents a confirmed recommendation, but does not reject", () => {
  const result = resolveCandidateDecision({ contract, assessment: assessment("unknown"), modelDecision: "contact" });
  assert.equal(result.decision, "review");
  assert.deepEqual(result.unresolvedRequirements, ["geo"]);
});
test("a contradicted required location rejects even if the model says contact", () => {
  assert.equal(resolveCandidateDecision({ contract, assessment: assessment("contradicted"), modelDecision: "contact" }).decision, "reject");
});
test("invented citation cannot establish eligibility; unknown interest remains a conversation check", () => {
  assert.equal(resolveCandidateDecision({ contract, assessment: assessment("supported", ["invented"]), modelDecision: "contact" }).decision, "review");
  assert.equal(resolveCandidateDecision({ contract, assessment: assessment(), modelDecision: "contact" }).decision, "contact");
});
test("recovery from uncertain qualification requires an explicit reconciliation", () => {
  const args = { contract, assessment: assessment(), modelDecision: "contact" as const, previousDecision: "maybe" };
  assert.equal(resolveCandidateDecision(args).decision, "review");
  assert.equal(resolveCandidateDecision({ ...args, reconciliation: "Current role provides direct ownership evidence absent from the preliminary summary." }).decision, "contact");
});
test("result page preserves canonical contact regardless of legacy willingness score", () => {
  const candidate = { final_decision: "contact", match_score: null, headline: "Open to work", metadata: { analysis_stage: "candidate_index_v2", delivery_bucket: "reach_first", scoring_breakdown: { join_likelihood_score: 10 } } } as unknown as CandidateRow;
  assert.equal(getCandidateDeliveryBucket(candidate), "reach_first");
  assert.deepEqual(getCandidateScoreMetrics(candidate), []);
});
test("final review prioritizes supported core work beyond initial rank and excludes rejects", () => {
  const input = [{ profileId: "reject", decision: "reject", assessment: { coreFit: "direct" } }, { profileId: "adjacent", decision: "maybe", assessment: { coreFit: "adjacent" } }, { profileId: "direct", decision: "maybe", assessment: { coreFit: "direct" } }] as Qualification[];
  assert.deepEqual(selectCandidatesForFinalReview(input, 1), ["direct"]);
  assert.equal(selectCandidatesForFinalReview(input, input.length).length, input.filter((row) => row.decision !== "reject").length);
});
test("review-only output is incomplete and cannot trigger unauthorized sourcing", async () => {
  const outcome = buildSearchOutcome({ candidates: [{ final_decision: "review" }], retrievedCount: 408, targetCount: 3, stopReason: "local_only" });
  assert.equal(outcome.status, "verification_needed");
  assert.equal(outcome.contactCount, 0);
  const action = await planSearchNextAction({ contract, outcome, unresolved: [], sourceAllowed: false, sourceAlreadyRequested: false, scanBudget: 500, usage: { searchId: "test", userId: "test", jobId: "test" } });
  assert.equal(action.action, "finish");
});
