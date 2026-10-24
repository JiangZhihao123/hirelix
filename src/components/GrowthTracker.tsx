"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { flushGrowthEvents } from "@/lib/growth-client";
import { getAnalyticsContextFromBrowser, getAcquisitionMetadataFromBrowser, syncAcquisitionCookie } from "@/lib/analytics";
import {
  telemetryMetadata,
  telemetryRoute,
  telemetryReferrer,
} from "@/lib/telemetry";

function stored(storage: Storage, key: string, fallback: string) {
  try {
    const value = storage.getItem(key) || fallback;
    storage.setItem(key, value);
    return value;
  } catch {
    return fallback;
  }
}
let visitorFallback = "",
  sessionFallback = "";

export function GrowthTracker() {
  const pathname = usePathname();
  const initialPath = useRef(pathname);
  const measuredDocument = useRef(false);
  useEffect(() => {
    if (
      !pathname ||
      pathname.startsWith("/ops") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/recommendation/")
    )
      return;
    visitorFallback ||= crypto.randomUUID();
    sessionFallback ||= crypto.randomUUID();
    let visitorId = visitorFallback,
      sessionId = sessionFallback;
    try {
      visitorId = stored(
        window.localStorage,
        "hirelix.growth.visitor_id",
        visitorFallback,
      );
      sessionId = stored(
        window.sessionStorage,
        "hirelix.growth.session_id",
        sessionFallback,
      );
    } catch {
      /* Storage restrictions must not break the app. */
    }
    window.__hirelixGrowthIdentity = {
      visitor_id: visitorId,
      session_id: sessionId,
    };
    const attribution = getAnalyticsContextFromBrowser();
    const acquisition = getAcquisitionMetadataFromBrowser();
    syncAcquisitionCookie({ visitor_id: visitorId, session_id: sessionId });
    const pageId = crypto.randomUUID(),
      pagePath = telemetryRoute(pathname);
    const started = performance.now();
    let active = 0,
      lastTick = started,
      lastInput = started,
      interactions = 0,
      scroll = 0;
    const depth = () =>
      Math.min(
        100,
        Math.round(
          (100 * window.scrollY) /
            Math.max(
              1,
              document.documentElement.scrollHeight - window.innerHeight,
            ),
        ),
      );
    const send: NonNullable<Window["__hirelixGrowthTrack"]> = async (
      eventType,
      metadata = {},
      options = {},
    ) => {
      const payload = JSON.stringify({
        event_type: eventType,
        event_id: crypto.randomUUID(),
        visitor_id: visitorId,
        session_id: sessionId,
        page_url: location.origin + pagePath,
        referrer: telemetryReferrer(document.referrer),
        metadata: {
          ...telemetryMetadata({
            ...attribution,
            ...acquisition,
            device_type: innerWidth < 768 ? "mobile" : "desktop",
            ...metadata,
          }),
          telemetry_version: 2,
          page_id: pageId,
          automated: navigator.webdriver === true,
        },
      });
      try {
        if (
          !options.awaitResponse &&
          navigator.sendBeacon?.(
            "/api/growth/landing-event",
            new Blob([payload], { type: "application/json" }),
          )
        )
          return true;
      } catch {
        /* A blocked beacon may still permit a regular request. */
      }
      try {
        return (
          await fetch("/api/growth/landing-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          })
        ).ok;
      } catch {
        return false;
      }
    };
    window.__hirelixGrowthTrack = send;
    flushGrowthEvents();
    let recorded = false;
    const pageViewTimer = setTimeout(() => {
      recorded = true;
      startVitals();
      void send("page_view", {
        viewport_width: innerWidth,
        viewport_height: innerHeight,
      });
    }, 0);
    const tick = () => {
      const now = performance.now();
      if (document.visibilityState === "visible" && now - lastInput < 60000)
        active += Math.min(now - lastTick, 5000);
      lastTick = now;
      scroll = Math.max(scroll, depth());
    };
    const summary = () => {
      if (!recorded) return;
      tick();
      void send("session_summary", {
        page_stay_seconds: Math.round((performance.now() - started) / 1000),
        active_read_seconds: Math.round(active / 1000),
        max_scroll_depth: scroll,
        interaction_count: interactions,
      });
    };
    const input = () => {
      lastInput = performance.now();
      interactions++;
    };
    const click = (event: MouseEvent) => {
      input();
      const target =
        event.target instanceof Element
          ? event.target.closest("a,[data-analytics-action]")
          : null;
      if (!target) return;
      const action = target.getAttribute("data-analytics-action");
      if (action) void send("ui_action", { action });
      else if (target instanceof HTMLAnchorElement)
        void send("navigation_click", {
          destination:
            target.origin === location.origin
              ? telemetryRoute(target.href)
              : "/external",
          action:
            target.origin === location.origin
              ? "internal_link"
              : "external_link",
        });
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") summary();
      else {
        lastTick = performance.now();
        lastInput = lastTick;
      }
    };
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.growthSection;
          if (entry.isIntersecting && id && !seen.has(id)) {
            seen.add(id);
            void send("section_view", { section_id: id });
          }
        }
      },
      { threshold: 0.35 },
    );
    document
      .querySelectorAll("[data-growth-section]")
      .forEach((el) => observer.observe(el));
    const error = () => {
      void send("client_error", { action: "unhandled_error" });
    };
    const timer = setInterval(tick, 1000),
      heartbeat = setInterval(() => {
        if (document.visibilityState === "visible") summary();
      }, 15000);
    let vitals: PerformanceObserver | undefined;
    const startVitals = () => {
      try {
        if (!measuredDocument.current && pathname === initialPath.current) {
          measuredDocument.current = true;
          vitals = new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              if (entry.entryType === "largest-contentful-paint")
                void send("web_vital", {
                  metric: "LCP",
                  value: Math.round(entry.startTime),
                });
          });
          vitals.observe({ type: "largest-contentful-paint", buffered: true });
        }
      } catch {
        /* Optional browser metric. */
      }
    };
    window.addEventListener("click", click);
    window.addEventListener("keydown", input);
    window.addEventListener("scroll", input, { passive: true });
    window.addEventListener("pagehide", summary);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", error);
    return () => {
      clearTimeout(pageViewTimer);
      summary();
      clearInterval(timer);
      clearInterval(heartbeat);
      observer.disconnect();
      vitals?.disconnect();
      window.removeEventListener("click", click);
      window.removeEventListener("keydown", input);
      window.removeEventListener("scroll", input);
      window.removeEventListener("pagehide", summary);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", error);
      if (window.__hirelixGrowthTrack === send)
        delete window.__hirelixGrowthTrack;
    };
  }, [pathname]);
  return null;
}
