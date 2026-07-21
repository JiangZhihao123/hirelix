import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAttributionQuery,
  getAnalyticsContextFromParams,
  isRecentSignup,
} from "../src/lib/analytics";

test("isRecentSignup distinguishes a new OAuth user from a returning user", () => {
  const now = Date.parse("2026-07-19T12:00:00.000Z");

  assert.equal(isRecentSignup("2026-07-19T11:55:00.000Z", now), true);
  assert.equal(isRecentSignup("2026-07-18T12:00:00.000Z", now), false);
  assert.equal(isRecentSignup("not-a-date", now), false);
  assert.equal(isRecentSignup(null, now), false);
});

test("analytics context recognizes Google Ads and keeps every campaign field", () => {
  const params = new URLSearchParams({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "us_recruiter_search",
    utm_content: "jd_to_shortlist",
    utm_term: "candidate sourcing software",
    gclid: "test-click-id",
  });

  assert.deepEqual(getAnalyticsContextFromParams(params), {
    device_type: "desktop",
    traffic_source: "google_ads",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "us_recruiter_search",
    utm_content: "jd_to_shortlist",
    utm_term: "candidate sourcing software",
    gclid: "test-click-id",
    page_variant: "unassigned",
    intent_path: "unknown",
    entry_mode: "workspace",
  });
});

test("attribution query forwards Google click attribution through auth callback", () => {
  const params = buildAttributionQuery({
    intentPath: "signin",
    pageVariant: "control",
    trafficSource: "google_ads",
    utmCampaign: "us_recruiter_search",
    utmSource: "google",
    utmMedium: "cpc",
    utmContent: "jd_to_shortlist",
    utmTerm: "candidate sourcing software",
    gclid: "test-click-id",
    entryMode: "free_trial",
  });

  assert.equal(params.get("traffic_source"), "google_ads");
  assert.equal(params.get("utm_source"), "google");
  assert.equal(params.get("utm_medium"), "cpc");
  assert.equal(params.get("utm_campaign"), "us_recruiter_search");
  assert.equal(params.get("utm_content"), "jd_to_shortlist");
  assert.equal(params.get("utm_term"), "candidate sourcing software");
  assert.equal(params.get("gclid"), "test-click-id");
});
