import test from "node:test";
import assert from "node:assert/strict";
import {classifyTraffic,isLocalOrPrivateIp} from "../src/lib/growth-traffic";
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

test("local and private IPs are excluded from human traffic", () => {
  for (const ipAddress of ["127.0.0.1", "::1", "10.0.0.8", "172.16.4.2", "192.168.1.9", "::ffff:127.0.0.1", "fd00::1", "fe80::1"]) {
    assert.equal(isLocalOrPrivateIp(ipAddress), true, ipAddress);
    assert.equal(classifyTraffic({ ipAddress }), "local", ipAddress);
  }
  assert.equal(isLocalOrPrivateIp("8.8.8.8"), false);
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

