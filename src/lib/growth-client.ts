"use client";

type GrowthMetadataValue = string | number | boolean | null;

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
  return window.__hirelixGrowthTrack?.(eventType, metadata, options) ?? Promise.resolve(false);
}

export function getGrowthIdentity() {
  if (typeof window === "undefined") return null;
  return window.__hirelixGrowthIdentity ?? null;
}
