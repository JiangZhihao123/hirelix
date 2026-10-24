"use client";

type GrowthMetadataValue = string | number | boolean | null;

const pending: Array<() => void> = [];
export function flushGrowthEvents() {
  pending.splice(0).forEach((send) => send());
}

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
  const deliver = () => {
    try {
      return Promise.resolve(
        window.__hirelixGrowthTrack?.(eventType, metadata, options) ?? false,
      ).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  };
  if (window.__hirelixGrowthTrack) return deliver();
  if (pending.length >= 20) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      const index = pending.indexOf(send);
      if (index >= 0) pending.splice(index, 1);
      resolve(false);
    }, 1000);
    const send = () => {
      clearTimeout(timeout);
      resolve(deliver());
    };
    pending.push(send);
  });
}

export function getGrowthIdentity() {
  if (typeof window === "undefined") return null;
  return window.__hirelixGrowthIdentity ?? null;
}
