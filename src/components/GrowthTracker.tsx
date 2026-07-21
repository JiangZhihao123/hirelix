"use client";

import { useEffect } from "react";
import { getAnalyticsContextFromBrowser } from "@/lib/analytics";

const VISITOR_KEY = "hirelix.growth.visitor_id";
const SESSION_KEY = "hirelix.growth.session_id";

function readCookie(name: string) {
  const entry = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function getOrCreateStorageValue(storage: Storage, key: string) {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  storage.setItem(key, value);
  return value;
}

export function GrowthTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const visitorId = getOrCreateStorageValue(window.localStorage, VISITOR_KEY);
    const sessionId = getOrCreateStorageValue(window.sessionStorage, SESSION_KEY);
    window.__hirelixGrowthIdentity = {
      visitor_id: visitorId,
      session_id: sessionId,
      invite_code: readCookie("hirelix_invite_code"),
    };

    if (!window.__hirelixGrowthTrack) {
      window.__hirelixGrowthTrack = async (
        eventType,
        metadata = {},
        options = {},
      ) => {
        const params = new URLSearchParams(window.location.search);
        const attribution = getAnalyticsContextFromBrowser();
        const payload = JSON.stringify({
          visitor_id: visitorId,
          session_id: sessionId,
          email_id: params.get("utm_content"),
          batch_id: params.get("batch"),
          recipient: params.get("to"),
          company: params.get("company"),
          page_url: window.location.href,
          referrer: document.referrer,
          event_type: eventType,
          metadata: {
            utm_source: attribution.utm_source ?? null,
            utm_medium: attribution.utm_medium ?? null,
            utm_campaign: attribution.utm_campaign,
            utm_content: attribution.utm_content ?? null,
            utm_term: attribution.utm_term ?? null,
            gclid: attribution.gclid ?? null,
            traffic_source: attribution.traffic_source,
            page_variant: params.get("page_variant"),
            intent_path: params.get("intent_path"),
            invite_code: readCookie("hirelix_invite_code"),
            device_type: window.innerWidth < 768 ? "mobile" : "desktop",
            ...metadata,
          },
        });

        if (!options.awaitResponse && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/growth/landing-event", blob);
          return true;
        }

        try {
          const response = await fetch("/api/growth/landing-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: !options.awaitResponse,
          });
          return response.ok;
        } catch {
          return false;
        }
      };
    }
  });

  return null;
}
