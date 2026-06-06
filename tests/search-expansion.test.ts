import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSearchExpansionFeedbackInput,
  normalizeStoredSearchExpansionFeedback,
  toSearchExpansionFeedbackRecord,
} from "@/lib/search-expansion";

test("normalizeSearchExpansionFeedbackInput defaults to a useful expansion reason", () => {
  const feedback = normalizeSearchExpansionFeedbackInput(null);
  assert.equal(feedback.reasonCode, "too_few_strong_candidates");
  assert.equal(feedback.reasonLabel, "Too few strong candidates");
  assert.equal(feedback.note, null);
});

test("normalizeSearchExpansionFeedbackInput keeps recruiter feedback compact", () => {
  const feedback = normalizeSearchExpansionFeedbackInput({
    feedback_reason: "missing_must_have_skill",
    feedback_note: "  Need stronger Kafka   and Flink platform ownership.  ",
  });
  assert.equal(feedback.reasonCode, "missing_must_have_skill");
  assert.equal(feedback.reasonLabel, "Missing a must-have skill");
  assert.equal(feedback.note, "Need stronger Kafka and Flink platform ownership.");
});

test("normalizeStoredSearchExpansionFeedback reads persisted metadata", () => {
  const requestedAt = "2026-06-06T12:00:00.000Z";
  const feedback = normalizeStoredSearchExpansionFeedback({
    reason_code: "wrong_seniority",
    reason_label: "Wrong seniority",
    user_feedback: "Need staff-level ICs.",
    requested_at: requestedAt,
  });
  assert.equal(feedback?.reasonCode, "wrong_seniority");
  assert.equal(feedback?.reasonLabel, "Wrong seniority");
  assert.equal(feedback?.note, "Need staff-level ICs.");
  assert.equal(feedback?.requestedAt, requestedAt);
});

test("toSearchExpansionFeedbackRecord persists snake_case metadata", () => {
  const feedback = normalizeSearchExpansionFeedbackInput({
    reason_code: "wrong_location",
    user_feedback: "US remote only.",
  });
  assert.deepEqual(
    toSearchExpansionFeedbackRecord(feedback, "2026-06-06T12:00:00.000Z"),
    {
      reason_code: "wrong_location",
      reason_label: "Wrong location",
      user_feedback: "US remote only.",
      requested_at: "2026-06-06T12:00:00.000Z",
    },
  );
});
