import test from "node:test";
import assert from "node:assert/strict";

import {
  bucketPageStaySeconds,
  buildOpsConversionData,
  classifyTraffic,
} from "../src/lib/ops-conversion";

test("classifyTraffic filters obvious bot user agents", () => {
  assert.equal(
    classifyTraffic({
      userAgent: "Mozilla/5.0 compatible; Googlebot/2.1",
      eventTypes: ["page_view"],
      pageStaySeconds: 20,
    }),
    "bot",
  );
});

test("classifyTraffic filters social preview user agents", () => {
  assert.equal(
    classifyTraffic({
      userAgent: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      eventTypes: ["page_view"],
      pageStaySeconds: 20,
    }),
    "preview",
  );
});

test("classifyTraffic treats interaction signals as human", () => {
  assert.equal(
    classifyTraffic({
      userAgent: "Mozilla/5.0 Safari/605.1.15",
      eventTypes: ["section_view"],
      pageStaySeconds: 2,
      interactionCount: 1,
    }),
    "human",
  );
});

test("classifyTraffic does not treat passive timing events as human", () => {
  assert.equal(
    classifyTraffic({
      userAgent: "Mozilla/5.0 Safari/605.1.15",
      eventTypes: ["page_view", "engaged_10s", "session_summary"],
      pageStaySeconds: 10,
      activeReadSeconds: 0,
      interactionCount: 0,
      maxScrollDepth: 0,
    }),
    "low_quality",
  );
});

test("classifyTraffic marks 0-3 second no-interaction sessions as low quality", () => {
  assert.equal(
    classifyTraffic({
      userAgent: "Mozilla/5.0 Safari/605.1.15",
      eventTypes: ["page_view"],
      pageStaySeconds: 3,
      interactionCount: 0,
      maxScrollDepth: 0,
    }),
    "low_quality",
  );
});

test("classifyTraffic marks longer passive sessions as suspicious", () => {
  assert.equal(
    classifyTraffic({
      userAgent: "Mozilla/5.0 Safari/605.1.15",
      eventTypes: ["page_view", "engaged_30s", "session_summary"],
      pageStaySeconds: 30,
      activeReadSeconds: 0,
      interactionCount: 0,
      maxScrollDepth: 0,
    }),
    "suspicious",
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
      {
        event_type: "page_view",
        visitor_id: "visitor-bot",
        session_id: "session-bot",
        page_url: "https://hirelix.online/",
        referrer: "",
        ip_address: "198.51.100.8",
        user_agent: "curl/8.0",
        metadata: {},
        created_at: "2026-05-26T02:00:00.000Z",
      },
    ],
    { range: "today", start, end },
  );

  assert.equal(data.summary.humanVisits, 1);
  assert.equal(data.summary.filteredVisits, 1);
  assert.equal(data.summary.effectiveClicks, 1);
  assert.equal(data.funnel[0].count, 1);
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

  assert.equal(data.summary.humanVisits, 1);
  assert.equal(data.summary.loginAttempts, 1);
  assert.equal(data.summary.successfulLogins, 1);
  assert.equal(data.recentHumanEvents.filter((event) => event.label === "登录成功").length, 1);
});
