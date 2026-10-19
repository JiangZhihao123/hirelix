"use client";

import { trackGrowthEvent } from "./growth-client";
import { telemetryRoute } from "./telemetry";

/**
 * Client helper for calling our API with the current user's session.
 *
 * better-auth uses an HttpOnly session cookie that is sent automatically with
 * same-origin requests when `credentials: 'include'` is set. There is no
 * Bearer token to manage anymore — the previous Supabase-style refresh logic
 * is gone.
 */

export async function fetchWithUserSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const started = performance.now();
  const raw = input instanceof Request ? input.url : String(input);
  const method = (
    init.method || (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const url = new URL(
    raw,
    typeof window === "undefined" ? "http://localhost" : window.location.origin,
  );
  const track =
    typeof window !== "undefined" &&
    url.origin === window.location.origin &&
    url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/api/growth/") &&
    !url.pathname.startsWith("/api/ops/");
  const report = (ok: boolean, status: number) => {
    if (track && (method !== "GET" || !ok))
      void trackGrowthEvent(
        ok ? "product_action_success" : "product_action_failed",
        {
          endpoint: telemetryRoute(url.pathname),
          method,
          status,
          duration_ms: Math.round(performance.now() - started),
        },
      );
  };
  try {
    const response = await fetch(input, {
      ...init,
      credentials: init.credentials ?? "include",
    });
    report(response.ok, response.status);
    return response;
  } catch (error) {
    if (
      !init.signal?.aborted &&
      !(input instanceof Request && input.signal.aborted)
    )
      report(false, 0);
    throw error;
  }
}
