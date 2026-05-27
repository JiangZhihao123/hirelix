import test from "node:test";
import assert from "node:assert/strict";

import {
  generateInviteCode,
  isInviteUnavailable,
  isLikelyInviteScanner,
  sanitizeInviteCode,
} from "../src/lib/beta-invites";

test("generateInviteCode returns URL-safe invite codes", () => {
  const code = generateInviteCode();
  assert.match(code, /^[A-Za-z0-9]+$/);
  assert.equal(code.length, 18);
});

test("sanitizeInviteCode accepts only compact invite codes", () => {
  assert.equal(sanitizeInviteCode("AbC123xyz_-"), "AbC123xyz_-");
  assert.equal(sanitizeInviteCode("short"), null);
  assert.equal(sanitizeInviteCode("bad code"), null);
  assert.equal(sanitizeInviteCode("x".repeat(81)), null);
});

test("isInviteUnavailable blocks expired and revoked invites", () => {
  const now = new Date("2026-05-27T12:00:00.000Z");
  assert.equal(isInviteUnavailable({ status: "reserved", expires_at: new Date("2026-05-28T00:00:00.000Z") }, now), null);
  assert.equal(isInviteUnavailable({ status: "revoked", expires_at: null }, now), "revoked");
  assert.equal(isInviteUnavailable({ status: "expired", expires_at: null }, now), "expired");
  assert.equal(isInviteUnavailable({ status: "reserved", expires_at: new Date("2026-05-27T11:59:59.000Z") }, now), "expired");
});

test("isLikelyInviteScanner catches bot and preview user agents", () => {
  assert.equal(
    isLikelyInviteScanner({
      userAgent: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    }),
    true,
  );
  assert.equal(
    isLikelyInviteScanner({
      userAgent: "Mozilla/5.0 compatible; Googlebot/2.1",
    }),
    true,
  );
});

test("isLikelyInviteScanner catches common cloud security ranges without interaction", () => {
  assert.equal(
    isLikelyInviteScanner({
      ipAddress: "72.145.152.67",
      userAgent: "Mozilla/5.0 Chrome/142.0.0.0",
    }),
    true,
  );
  assert.equal(
    isLikelyInviteScanner({
      ipAddress: "34.118.23.107",
      userAgent: "Mozilla/5.0 Safari/605.1",
    }),
    true,
  );
});

test("isLikelyInviteScanner lets clear interaction win", () => {
  assert.equal(
    isLikelyInviteScanner({
      ipAddress: "34.118.23.107",
      userAgent: "Mozilla/5.0 Safari/605.1",
      hasInteraction: true,
    }),
    false,
  );
});
