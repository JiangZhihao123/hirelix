import test from "node:test";
import assert from "node:assert/strict";

import {
  bucketPageStaySeconds,
  buildOpsConversionData,
  classifyTraffic,
} from "../src/lib/ops-conversion";

test("classifyTraffic treats non-data-center IP traffic as human", () => {
  assert.equal(
    classifyTraffic({
      ipAttribution: {
        ipAddress: "203.0.113.10",
        maskedIp: "203.0.113.*",
        country: "United States",
        region: "California",
        city: "San Francisco",
        networkType: "business",
        org: "Example Company Network",
        asn: "AS64500",
      },
      userAgent: "Mozilla/5.0 compatible; Googlebot/2.1",
      eventTypes: ["page_view"],
      pageStaySeconds: 1,
    }),
    "human",
  );
});

test("classifyTraffic treats unknown IP type as human", () => {
  assert.equal(
    classifyTraffic({
      userAgent: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      eventTypes: ["page_view"],
      pageStaySeconds: 0,
    }),
    "human",
  );
});

test("classifyTraffic treats data center IP traffic as non-human", () => {
  assert.equal(
    classifyTraffic({
      ipAddress: "72.145.152.67",
      userAgent: "Mozilla/5.0 Chrome/142.0.0.0",
      eventTypes: ["page_view", "engaged_10s", "signin_view"],
      pageStaySeconds: 0,
      activeReadSeconds: 0,
      interactionCount: 0,
      maxScrollDepth: 0,
    }),
    "data_center",
  );

  assert.equal(
    classifyTraffic({
      ipAddress: "34.118.23.107",
      userAgent: "Mozilla/5.0 Mobile Safari/602.1",
      eventTypes: ["page_view", "engaged_10s", "sample_view"],
      pageStaySeconds: 0,
      activeReadSeconds: 0,
      interactionCount: 0,
      maxScrollDepth: 0,
    }),
    "data_center",
  );
});

test("classifyTraffic filters attributed data center IP sessions even with clear form intent", () => {
  assert.equal(
    classifyTraffic({
      ipAttribution: {
        ipAddress: "34.118.23.107",
        maskedIp: "34.118.23.*",
        country: "Poland",
        region: "Mazovia",
        city: "Warsaw",
        networkType: "data_center",
        org: "Google LLC",
        asn: "AS396982",
      },
      ipAddress: "34.118.23.107",
      userAgent: "Mozilla/5.0 Chrome/142.0.0.0",
      eventTypes: ["page_view", "hero_input_start", "hero_submit_attempt"],
      pageStaySeconds: 35,
      activeReadSeconds: 12,
      interactionCount: 4,
      maxScrollDepth: 30,
    }),
    "data_center",
  );
});

test("bucketPageStaySeconds uses the agreed second ranges", () => {
  assert.equal(bucketPageStaySeconds(3), "0-3秒");
  assert.equal(bucketPageStaySeconds(10), "4-10秒");
  assert.equal(bucketPageStaySeconds(30), "11-30秒");
  assert.equal(bucketPageStaySeconds(60), "31-60秒");
  assert.equal(bucketPageStaySeconds(180), "1-3分钟");
  assert.equal(bucketPageStaySeconds(600), "3-10分钟");
  assert.equal(bucketPageStaySeconds(601), "10分钟以上");
});

test("buildOpsConversionData keeps filtered traffic out of the main funnel", () => {
  const start = new Date("2026-05-26T00:00:00.000Z");
  const end = new Date("2026-05-27T00:00:00.000Z");
  const data = buildOpsConversionData(
    [
      {
        event_type: "page_view",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/?traffic_source=linkedin",
        referrer: "",
        ip_address: "203.0.113.10",
        user_agent: "Mozilla/5.0 Safari/605.1.15",
        metadata: { traffic_source: "linkedin" },
        created_at: "2026-05-26T01:00:00.000Z",
      },
      {
        event_type: "session_summary",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/?traffic_source=linkedin",
        referrer: "",
        ip_address: "203.0.113.10",
        user_agent: "Mozilla/5.0 Safari/605.1.15",
        metadata: {
          traffic_source: "linkedin",
          page_stay_seconds: 72,
          active_read_seconds: 48,
          interaction_count: 3,
          max_scroll_depth: 60,
        },
        created_at: "2026-05-26T01:01:12.000Z",
      },
      {
        event_type: "hero_submit_attempt",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/?traffic_source=linkedin",
        referrer: "",
        ip_address: "203.0.113.10",
        user_agent: "Mozilla/5.0 Safari/605.1.15",
        metadata: { traffic_source: "linkedin", jd_length_bucket: "200-499" },
        created_at: "2026-05-26T01:01:20.000Z",
      },
    ],
    { range: "today", start, end },
  );

  assert.equal(data.summary.humanVisits, 1);
  assert.equal(data.summary.filteredVisits, 0);
  assert.equal(data.summary.effectiveClicks, 1);
  assert.equal(data.funnel[0].count, 1);
});

test("buildOpsConversionData exposes the production operations snapshot", () => {
  const start = new Date("2026-05-26T00:00:00.000Z");
  const end = new Date("2026-05-27T00:00:00.000Z");
  const data = buildOpsConversionData([], {
    range: "today",
    start,
    end,
    operations: {
      generatedAt: end.toISOString(),
      users: { total: 12, newInRange: 2, activePaid: 1 },
      searches: {
        created: 5,
        completed: 4,
        failed: 1,
        processing: 0,
        successRate: 80,
        medianCompletionMinutes: 11.5,
        candidatesDelivered: 240,
        averageCandidatesPerCompleted: 60,
      },
      billing: {
        completedPayments: 1,
        checkoutStarts: 3,
        checkoutErrors: 0,
        upgradeClicks: 4,
        revenue: [{ currency: "USD", amountMinor: 14900, payments: 1 }],
      },
      jobs: {
        searchQueued: 0,
        searchRunning: 0,
        searchFailed: 1,
        evidenceQueued: 0,
        evidenceRunning: 0,
        evidenceFailed: 0,
        stale: 0,
      },
      index: { totalProfiles: 1000, readyProfiles: 995, pendingProfiles: 4, failedProfiles: 1 },
      searchStatuses: [{ status: "done", count: 4 }],
      recentSearches: [],
    },
  });

  assert.equal(data.operations.searches.successRate, 80);
  assert.equal(data.operations.billing.revenue[0].amountMinor, 14900);
  assert.equal(data.operations.index.readyProfiles, 995);
});

test("buildOpsConversionData uses selected range labels in operator copy", () => {
  const end = new Date("2026-05-26T12:00:00.000Z");
  const start = new Date("2026-05-20T00:00:00.000Z");
  const data = buildOpsConversionData(
    [
      {
        event_type: "page_view",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/?traffic_source=linkedin",
        referrer: "",
        ip_address: "203.0.113.10",
        user_agent: "Mozilla/5.0 Safari/605.1.15",
        metadata: { traffic_source: "linkedin" },
        created_at: "2026-05-26T01:00:00.000Z",
      },
      {
        event_type: "section_view",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/?traffic_source=linkedin",
        referrer: "",
        ip_address: "203.0.113.10",
        user_agent: "Mozilla/5.0 Safari/605.1.15",
        metadata: { traffic_source: "linkedin", section_id: "首屏" },
        created_at: "2026-05-26T01:00:10.000Z",
      },
    ],
    { range: "7d", start, end },
  );

  assert.equal(data.range.label, "最近7天");
  assert.match(data.diagnosis, /^最近7天/);
  assert.equal(data.actionItems.every((item) => !item.title.includes("今天")), true);
  assert.equal(data.actionItems.every((item) => !item.detail.includes("今天")), true);
});

test("buildOpsConversionData ignores ops dashboard visits and login noise", () => {
  const start = new Date("2026-05-26T00:00:00.000Z");
  const end = new Date("2026-05-27T00:00:00.000Z");
  const data = buildOpsConversionData(
    [
      {
        event_type: "signup_success",
        visitor_id: "operator",
        session_id: "operator-session",
        page_url: "https://hirelix.online/ops/123",
        referrer: "",
        ip_address: "203.0.113.10",
        user_agent: "Mozilla/5.0 Chrome/125.0",
        metadata: { route: "/ops/123", has_email: true },
        created_at: "2026-05-26T09:43:00.000Z",
      },
      {
        event_type: "page_view",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/?traffic_source=cold_email",
        referrer: "",
        ip_address: "198.51.100.9",
        user_agent: "Mozilla/5.0 Safari/605.1.15",
        metadata: { traffic_source: "cold_email" },
        created_at: "2026-05-26T10:00:00.000Z",
      },
      {
        event_type: "section_view",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/?traffic_source=cold_email",
        referrer: "",
        ip_address: "198.51.100.9",
        user_agent: "Mozilla/5.0 Safari/605.1.15",
        metadata: {
          traffic_source: "cold_email",
          section_id: "首屏",
          interaction_count: 1,
          max_scroll_depth: 12,
        },
        created_at: "2026-05-26T10:00:12.000Z",
      },
    ],
    { range: "today", start, end },
  );

  assert.equal(data.summary.humanVisits, 1);
  assert.equal(data.summary.successfulLogins, 0);
  assert.equal(data.recentHumanEvents.some((event) => event.label === "登录成功"), false);
});

test("buildOpsConversionData counts signup success only after a Google sign-in click in the same session", () => {
  const start = new Date("2026-05-26T00:00:00.000Z");
  const end = new Date("2026-05-27T00:00:00.000Z");
  const data = buildOpsConversionData(
    [
      {
        event_type: "page_view",
        visitor_id: "existing-user",
        session_id: "existing-session",
        page_url: "https://hirelix.online/",
        referrer: "",
        ip_address: "203.0.113.20",
        user_agent: "Mozilla/5.0 Chrome/125.0",
        metadata: {},
        created_at: "2026-05-26T09:00:00.000Z",
      },
      {
        event_type: "signup_success",
        visitor_id: "existing-user",
        session_id: "existing-session",
        page_url: "https://hirelix.online/",
        referrer: "",
        ip_address: "203.0.113.20",
        user_agent: "Mozilla/5.0 Chrome/125.0",
        metadata: { route: "/", has_email: true },
        created_at: "2026-05-26T09:00:02.000Z",
      },
      {
        event_type: "page_view",
        visitor_id: "new-user",
        session_id: "new-session",
        page_url: "https://hirelix.online/",
        referrer: "",
        ip_address: "203.0.113.21",
        user_agent: "Mozilla/5.0 Chrome/125.0",
        metadata: {},
        created_at: "2026-05-26T10:00:00.000Z",
      },
      {
        event_type: "google_signin_click",
        visitor_id: "new-user",
        session_id: "new-session",
        page_url: "https://hirelix.online/",
        referrer: "",
        ip_address: "203.0.113.21",
        user_agent: "Mozilla/5.0 Chrome/125.0",
        metadata: { route: "/" },
        created_at: "2026-05-26T10:00:10.000Z",
      },
      {
        event_type: "signup_success",
        visitor_id: "new-user",
        session_id: "new-session",
        page_url: "https://hirelix.online/app",
        referrer: "https://hirelix.online/",
        ip_address: "203.0.113.21",
        user_agent: "Mozilla/5.0 Chrome/125.0",
        metadata: { route: "/app", auth_result: "google_oauth_callback" },
        created_at: "2026-05-26T10:00:25.000Z",
      },
    ],
    { range: "today", start, end },
  );

  assert.equal(data.summary.humanVisits, 2);
  assert.equal(data.summary.loginAttempts, 1);
  assert.equal(data.summary.successfulLogins, 1);
  assert.equal(data.recentHumanEvents.filter((event) => event.label === "登录成功").length, 1);
});

test("buildOpsConversionData returns IP attribution and excludes data center traffic from humans", () => {
  const start = new Date("2026-05-26T00:00:00.000Z");
  const end = new Date("2026-05-27T00:00:00.000Z");
  const data = buildOpsConversionData(
    [
      {
        event_type: "page_view",
        visitor_id: "cloud-user",
        session_id: "cloud-session",
        page_url: "https://hirelix.online/?traffic_source=cold_email",
        referrer: "",
        ip_address: "34.118.23.107",
        user_agent: "Mozilla/5.0 Chrome/142.0.0.0",
        metadata: { traffic_source: "cold_email" },
        created_at: "2026-05-26T10:00:00.000Z",
      },
      {
        event_type: "hero_submit_attempt",
        visitor_id: "cloud-user",
        session_id: "cloud-session",
        page_url: "https://hirelix.online/?traffic_source=cold_email",
        referrer: "",
        ip_address: "34.118.23.107",
        user_agent: "Mozilla/5.0 Chrome/142.0.0.0",
        metadata: { traffic_source: "cold_email", interaction_count: 4, max_scroll_depth: 20 },
        created_at: "2026-05-26T10:00:20.000Z",
      },
    ],
    {
      range: "today",
      start,
      end,
      ipAttribution: {
        "34.118.23.107": {
          ipAddress: "34.118.23.107",
          maskedIp: "34.118.23.*",
          country: "Poland",
          region: "Mazovia",
          city: "Warsaw",
          networkType: "data_center",
          org: "Google LLC",
          asn: "AS396982",
        },
      },
    },
  );

  assert.equal(data.summary.humanVisits, 0);
  assert.equal(data.summary.filteredVisits, 1);
  assert.equal(data.summary.suspiciousVisits, 1);
  assert.equal(data.ipAttribution.length, 1);
  assert.equal(data.ipAttribution[0].maskedIp, "34.118.23.*");
  assert.equal(data.ipAttribution[0].networkType, "data_center");
  assert.equal(data.ipAttribution[0].country, "Poland");
  assert.equal(data.ipAttribution[0].humanSessions, 0);
  assert.equal(data.ipAttribution[0].filteredSessions, 1);
});

test("buildOpsConversionData attaches IP attribution to recent human events", () => {
  const start = new Date("2026-05-26T00:00:00.000Z");
  const end = new Date("2026-05-27T00:00:00.000Z");
  const data = buildOpsConversionData(
    [
      {
        event_type: "page_view",
        visitor_id: "visitor-human",
        session_id: "session-human",
        page_url: "https://hirelix.online/",
        referrer: "https://www.google.com/",
        ip_address: "195.64.124.151",
        user_agent: "Mozilla/5.0 Chrome/146.0.0.0",
        metadata: {},
        created_at: "2026-05-26T09:45:22.000Z",
      },
    ],
    {
      range: "today",
      start,
      end,
      ipAttribution: {
        "195.64.124.151": {
          ipAddress: "195.64.124.151",
          maskedIp: "195.64.124.*",
          country: "Norway",
          region: "Oslo County",
          city: "Oslo",
          networkType: "residential",
          org: "Chiron Software LLC",
          asn: "AS211826",
        },
      },
    },
  );

  assert.equal(data.recentHumanEvents.length, 1);
  assert.equal(data.recentHumanEvents[0].source, "Google");
  assert.equal(data.recentHumanEvents[0].ip.maskedIp, "195.64.124.*");
  assert.equal(data.recentHumanEvents[0].ip.country, "Norway");
  assert.equal(data.recentHumanEvents[0].ip.networkType, "residential");
  assert.equal(data.recentHumanEvents[0].ip.org, "Chiron Software LLC");
});
