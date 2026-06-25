import test from "node:test";
import assert from "node:assert/strict";

import {
  validateLandingEventForRecording,
} from "../src/app/api/growth/landing-event/route";

test("growth landing event records try-for-free clicks", () => {
  const decision = validateLandingEventForRecording({
    eventType: "try_for_free_click",
    metadata: { route: "/" },
    pageUrl: "https://hirelix.online/",
  });

  assert.equal(decision.action, "record");
  if (decision.action === "record") {
    assert.equal(decision.eventType, "try_for_free_click");
  }
});

test("growth landing event softly ignores unknown analytics events", () => {
  const decision = validateLandingEventForRecording({
    eventType: "frontend_experiment_click",
    metadata: { route: "/" },
    pageUrl: "https://hirelix.online/",
  });

  assert.deepEqual(decision, {
    action: "ignore",
    eventType: "frontend_experiment_click",
    reason: "invalid_event_type",
  });
});

test("growth landing event keeps preview request validation strict", () => {
  const decision = validateLandingEventForRecording({
    eventType: "preview_request_submit",
    metadata: {
      reply_email: "not-an-email",
      role_preview: "short",
    },
    pageUrl: "https://hirelix.online/",
  });

  assert.deepEqual(decision, {
    action: "reject",
    error: "Invalid preview request",
    reason: "invalid_preview_request",
    status: 400,
  });
});

test("growth landing event normalizes valid preview request metadata", () => {
  const decision = validateLandingEventForRecording({
    eventType: "preview_request_submit",
    metadata: {
      reply_email: "  recruiter@example.com  ",
      role_preview: "  Senior backend engineer for distributed systems  ",
    },
    pageUrl: "https://hirelix.online/",
  });

  assert.equal(decision.action, "record");
  if (decision.action === "record") {
    assert.equal(decision.metadata.reply_email, "recruiter@example.com");
    assert.equal(decision.metadata.role_preview, "Senior backend engineer for distributed systems");
    assert.equal(decision.metadata.role_length, 47);
  }
});
