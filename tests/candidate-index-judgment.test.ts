import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDIDATE_JUDGMENT_PROMPT_VERSION,
  FINAL_JUDGMENT_SYSTEM_PROMPT,
  PAIRWISE_COMPARISON_SYSTEM_PROMPT,
  QUALIFICATION_SYSTEM_PROMPT,
  normalizeFinalJudgment,
} from "@/lib/candidate-index/judgment";


test("qualification prompt does not treat job-seeking signals as qualification", () => {
  assert.match(QUALIFICATION_SYSTEM_PROMPT, /do not estimate willingness/i);
  assert.match(QUALIFICATION_SYSTEM_PROMPT, /do not require active-job-seeking/i);
});

test("pairwise prompt prioritizes fit and treats unknown willingness as neutral", () => {
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /overall recruiting-priority judgment/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /do not calculate a score by adding dimension labels/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /stable identity label/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /missing education.*unknown/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /evaluate job fit and evidence-based likelihood.*together/i);
  assert.match(PAIRWISE_COMPARISON_SYSTEM_PROMPT, /missing active-job-seeking or availability signal is neutral/i);
});

test("final prompt lets strong passive candidates reach contact", () => {
  assert.equal(CANDIDATE_JUDGMENT_PROMPT_VERSION, 5);
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
