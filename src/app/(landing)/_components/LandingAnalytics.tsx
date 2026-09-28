"use client";

import { useEffect } from "react";
import {
  ANALYTICS_EVENTS,
  trackEvent,
  getAnalyticsContextFromBrowser,
} from "@/lib/analytics";
import {
  ENGAGEMENT_EVENT_THRESHOLDS,
  hasReachedEngagementThreshold,
} from "@/lib/growth-engagement";

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

export function LandingAnalytics() {
  const experiments = { pageVariant: "personal-agent" };
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const attribution = getAnalyticsContextFromBrowser({
      entry_mode: "landing",
      page_variant: experiments.pageVariant,
    });
    trackEvent(ANALYTICS_EVENTS.landingView, attribution);

    const visitorKey = "hirelix.growth.visitor_id";
    const existingVisitorId = window.localStorage.getItem(visitorKey);
    const visitorId = existingVisitorId || crypto.randomUUID();
    if (!existingVisitorId) {
      window.localStorage.setItem(visitorKey, visitorId);
    }

    const existingSessionId = window.__hirelixGrowthIdentity?.session_id;
    const sessionId = existingSessionId || crypto.randomUUID();
    const previousGrowthTrack = window.__hirelixGrowthTrack;
    const previousGrowthIdentity = window.__hirelixGrowthIdentity;
    window.__hirelixGrowthIdentity = {
      visitor_id: visitorId,
      session_id: sessionId,
      invite_code: getCookieValue("hirelix_invite_code"),
    };

    const startedAt = Date.now();
    let activeReadSeconds = 0;
    let lastTickAt = startedAt;
    let interactionCount = 0;
    let maxScrollDepth = 0;
    const seenSections = new Set<string>();
    const common = {
      visitor_id: visitorId,
      session_id: sessionId,
      email_id: params.get("utm_content"),
      batch_id: params.get("batch"),
      recipient: params.get("to"),
      company: params.get("company"),
      page_url: window.location.href,
      referrer: document.referrer,
      metadata: {
        utm_source: attribution.utm_source ?? null,
        utm_medium: attribution.utm_medium ?? null,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content ?? null,
        utm_term: attribution.utm_term ?? null,
        gclid: attribution.gclid ?? null,
        traffic_source: attribution.traffic_source,
        page_variant: params.get("page_variant") || experiments.pageVariant,
        intent_path: params.get("intent_path"),
        invite_code: getCookieValue("hirelix_invite_code"),
        device_type: window.innerWidth < 768 ? "mobile" : "desktop",
      },
    };

    async function sendGrowthEvent(
      eventType: string,
      metadata: Record<string, string | number | boolean | null> = {},
      options: { awaitResponse?: boolean } = {},
    ) {
      const payload = JSON.stringify({
        ...common,
        event_type: eventType,
        metadata: {
          ...common.metadata,
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
    }

    function getMaxScrollDepth() {
      const scrollable = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      return Math.min(
        100,
        Math.max(0, Math.round((window.scrollY / scrollable) * 100)),
      );
    }

    function getSessionMetadata() {
      const pageStaySeconds = Math.max(
        0,
        Math.round((Date.now() - startedAt) / 1000),
      );
      return {
        page_stay_seconds: pageStaySeconds,
        active_read_seconds: activeReadSeconds,
        max_scroll_depth: Math.max(maxScrollDepth, getMaxScrollDepth()),
        interaction_count: interactionCount,
        section_view_count: seenSections.size,
        visibility_state: document.visibilityState,
      };
    }

    function markInteraction() {
      interactionCount += 1;
      maxScrollDepth = Math.max(maxScrollDepth, getMaxScrollDepth());
    }

    function sendSessionSummary() {
      void sendGrowthEvent("session_summary", getSessionMetadata());
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") sendSessionSummary();
    }

    sendGrowthEvent("page_view", {
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
    });

    const activeTimer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.round((now - lastTickAt) / 1000));
      if (document.visibilityState === "visible") {
        activeReadSeconds += elapsed;
      }
      lastTickAt = now;
      maxScrollDepth = Math.max(maxScrollDepth, getMaxScrollDepth());
    }, 1000);

    const recordedEngagementEvents = new Set<string>();
    const engagementTimer = window.setInterval(() => {
      const sessionMetadata = getSessionMetadata();
      for (const eventType of Object.keys(ENGAGEMENT_EVENT_THRESHOLDS)) {
        if (recordedEngagementEvents.has(eventType)) continue;
        if (
          !hasReachedEngagementThreshold({
            eventType,
            activeReadSeconds: sessionMetadata.active_read_seconds,
            pageStaySeconds: sessionMetadata.page_stay_seconds,
          })
        ) {
          continue;
        }
        recordedEngagementEvents.add(eventType);
        void sendGrowthEvent(eventType, sessionMetadata);
      }
    }, 1000);

    const interactionEvents = [
      "pointermove",
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
    ] as const;
    for (const eventName of interactionEvents) {
      window.addEventListener(eventName, markInteraction, { passive: true });
    }

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          const sectionId = element.dataset.growthSection || element.id;
          if (!sectionId || seenSections.has(sectionId)) continue;
          seenSections.add(sectionId);
          void sendGrowthEvent("section_view", {
            section_id: sectionId,
            page_stay_seconds: Math.round((Date.now() - startedAt) / 1000),
            max_scroll_depth: getMaxScrollDepth(),
          });
        }
      },
      { threshold: 0.35 },
    );

    window.requestAnimationFrame(() => {
      document
        .querySelectorAll<HTMLElement>("[data-growth-section]")
        .forEach((element) => {
          sectionObserver.observe(element);
        });
    });

    window.addEventListener("pagehide", sendSessionSummary);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    window.__hirelixGrowthTrack = sendGrowthEvent;

    return () => {
      window.clearInterval(activeTimer);
      window.clearInterval(engagementTimer);
      for (const eventName of interactionEvents) {
        window.removeEventListener(eventName, markInteraction);
      }
      sectionObserver.disconnect();
      window.removeEventListener("pagehide", sendSessionSummary);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sendSessionSummary();
      if (window.__hirelixGrowthTrack === sendGrowthEvent) {
        window.__hirelixGrowthTrack = previousGrowthTrack;
      }
      if (window.__hirelixGrowthIdentity?.session_id === sessionId) {
        window.__hirelixGrowthIdentity = previousGrowthIdentity;
      }
    };
  }, [experiments.pageVariant]);

  return null;
}
