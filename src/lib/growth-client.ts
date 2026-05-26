"use client";

type GrowthMetadataValue = string | number | boolean | null;

const GOOGLE_SIGNIN_STARTED_KEY = "hirelix.growth.google_signin_started_at";
const GOOGLE_SIGNIN_WINDOW_MS = 10 * 60 * 1000;

function isOpsRoute() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/ops/");
}

export function getJdLengthBucket(text: string) {
  const length = text.trim().length;
  if (length <= 0) return "0";
  if (length < 50) return "1-49";
  if (length < 200) return "50-199";
  if (length < 500) return "200-499";
  return "500+";
}

export function trackGrowthEvent(
  eventType: string,
  metadata: Record<string, GrowthMetadataValue> = {},
  options: { awaitResponse?: boolean } = {},
) {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (isOpsRoute()) return Promise.resolve(false);
  return window.__hirelixGrowthTrack?.(eventType, metadata, options) ?? Promise.resolve(false);
}

export function getGrowthIdentity() {
  if (typeof window === "undefined") return null;
  return window.__hirelixGrowthIdentity ?? null;
}

export function markGrowthGoogleSignInStarted() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(GOOGLE_SIGNIN_STARTED_KEY, String(Date.now()));
}

export function consumeRecentGrowthGoogleSignInStarted() {
  if (typeof window === "undefined") return false;
  const rawValue = window.sessionStorage.getItem(GOOGLE_SIGNIN_STARTED_KEY);
  if (!rawValue) return false;
  window.sessionStorage.removeItem(GOOGLE_SIGNIN_STARTED_KEY);

  const startedAt = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt <= GOOGLE_SIGNIN_WINDOW_MS;
}
