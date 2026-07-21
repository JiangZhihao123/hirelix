import test from "node:test";
import assert from "node:assert/strict";

import {
  validateLandingEventForRecording,
} from "../src/app/api/growth/landing-event/route";
import { hasReachedEngagementThreshold } from "../src/lib/growth-engagement";

test("growth engagement requires real page and active-read duration", () => {
  assert.equal(hasReachedEngagementThreshold({
    eventType: "engaged_180s",
    activeReadSeconds: 2,
    pageStaySeconds: 2,
  }), false);
  assert.equal(hasReachedEngagementThreshold({
    eventType: "engaged_180s",
    activeReadSeconds: 180,
    pageStaySeconds: 180,
  }), true);
});

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

test("growth landing event ignores impossible engagement claims", () => {
  const decision = validateLandingEventForRecording({
    eventType: "engaged_60s",
    metadata: { active_read_seconds: 2, page_stay_seconds: 2 },
    pageUrl: "https://hirelix.online/",
  });

  assert.deepEqual(decision, {
    action: "ignore",
    eventType: "engaged_60s",
    reason: "invalid_engagement_duration",
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

test("growth landing event records sourcing brief generation as an activation event", () => {
  const decision = validateLandingEventForRecording({
    eventType: "sourcing_brief_generated",
    metadata: {
      traffic_source: "google_ads",
      utm_campaign: "us_recruiter_search",
      jd_length_bucket: "500+",
    },
    pageUrl: "https://hirelix.online/app/search/new",
  });

  assert.equal(decision.action, "record");
});
