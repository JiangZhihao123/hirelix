import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDIDATE_JUDGMENT_PROMPT_VERSION,
  compareComparisonCards,
  FINAL_JUDGMENT_SYSTEM_PROMPT,
  PAIRWISE_COMPARISON_SYSTEM_PROMPT,
  QUALIFICATION_SYSTEM_PROMPT,
  normalizeFinalJudgment,
} from "@/lib/candidate-index/judgment";

const comparisonCard = (overrides: Partial<Parameters<typeof compareComparisonCards>[0]> = {}) => ({
  mandatoryEligibility: { level: "pass" as const, evidence: [] },
  coreWork: { level: "direct" as const, evidence: ["core"] },
  productionOwnership: { level: "moderate" as const, evidence: ["production"] },
  seniorityAlignment: { level: "aligned" as const, evidence: [] },
  careerDirection: { level: "aligned" as const, evidence: [] },
  joinSignals: { level: "none" as const, evidence: [] },
  ...overrides,
});

test("qualification prompt does not treat job-seeking signals as qualification", () => {
  assert.match(QUALIFICATION_SYSTEM_PROMPT, /do not estimate willingness/i);
  assert.match(QUALIFICATION_SYSTEM_PROMPT, /do not require active-job-seeking/i);
});

test("pairwise prompt prioritizes fit and treats unknown willingness as neutral", () => {
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /fixed priority/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /stable identity label/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /missing education.*unknown/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /secondary prioritization factor/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /missing active-job-seeking or availability signal is neutral/i);
});

test("final prompt lets strong passive candidates reach contact", () => {
  assert.equal(CANDIDATE_JUDGMENT_PROMPT_VERSION, 4);
  assert.match(FINAL_JUDGMENT_SYSTEM_PROMPT, /job fit determines whether outreach is warranted/i);
  assert.match(FINAL_JUDGMENT_SYSTEM_PROMPT, /contact does not require active-job-seeking/i);
  assert.match(FINAL_JUDGMENT_SYSTEM_PROMPT, /unknown willingness alone must not downgrade contact/i);
  assert.match(FINAL_JUDGMENT_SYSTEM_PROMPT, /do not use review merely because willingness is unknown/i);
});

test("normalization preserves contact when join likelihood is unknown", () => {
  const judgment = normalizeFinalJudgment("profile-1", {
    decision: "contact",
    join_likelihood: "unknown",
    join_likelihood_score: 0,
    join_likelihood_reasons: [],
    join_likelihood_risks: [],
    match_reasons: ["Strong production ML evidence"],
    evidence: ["Built production agent systems"],
    risks: [],
    missing_information: ["No explicit job-seeking signal"],
    recommended_next_action: "Send targeted outreach",
  });

  assert.equal(judgment.decision, "contact");
  assert.equal(judgment.joinLikelihood, "unknown");
  assert.equal(judgment.joinLikelihoodScore, 50);
});

test("evidence-card comparison is order invariant and uses willingness only after fit", () => {
  const strongerFit = comparisonCard({
    coreWork: { level: "direct", evidence: ["built agentic production system"] },
    joinSignals: { level: "none", evidence: [] },
  });
  const moreAvailable = comparisonCard({
    coreWork: { level: "equivalent", evidence: ["adjacent reasoning system"] },
    joinSignals: { level: "positive", evidence: ["open to work"] },
  });
  assert.equal(compareComparisonCards(strongerFit, moreAvailable).outcome, "a");
  assert.equal(compareComparisonCards(moreAvailable, strongerFit).outcome, "b");
});

test("evidence-card comparison treats unknown mandatory facts as neutral", () => {
  const known = comparisonCard({ mandatoryEligibility: { level: "pass", evidence: ["US"] } });
  const unknown = comparisonCard({ mandatoryEligibility: { level: "unknown", evidence: [] } });
  assert.equal(compareComparisonCards(known, unknown).outcome, "tie");
  assert.equal(compareComparisonCards(unknown, known).outcome, "tie");
});
