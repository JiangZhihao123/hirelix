import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { hirelix_growth_landing_events } from "@/db/schema";
import { ATTRIBUTION_FIELDS, acquisitionMetadata, readAcquisitionCookie } from "./growth-attribution";
import { analyticsDatabaseIsLocal, analyticsUserIsInternal } from "./telemetry-server";
import { telemetryBot } from "./telemetry";
import { classifyTraffic, isLocalOrPrivateIp } from "./growth-traffic";
import { getLogger } from "./logger";

/** Called only by better-auth's user.create.after hook, never by a browser event. */
export async function recordAcquisitionSignup(user: { id: string; email?: string; createdAt: Date }, headers?: Headers) {
  try {
    const local = await analyticsDatabaseIsLocal();
    const ip = headers?.get(process.env.VERCEL === "1" ? "x-vercel-forwarded-for" : "x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = headers?.get("user-agent") || "";
    if (!local && (telemetryBot(ua) || isLocalOrPrivateIp(ip) || classifyTraffic({ ipAddress: ip }) === "data_center")) return;
    const attribution = readAcquisitionCookie(headers?.get("cookie") || "");
    await db.insert(hirelix_growth_landing_events).values({
      id: randomUUID(),
      event_type: "signup_success",
      visitor_id: attribution?.visitor_id || null,
      session_id: attribution?.session_id || null,
      // The auth callback URL and its parameters never enter analytics.
      page_url: "/auth/signup",
      created_at: user.createdAt,
      metadata: {
        ...(attribution ? Object.fromEntries(ATTRIBUTION_FIELDS.filter(key => attribution.latest[key]).map(key => [key, attribution.latest[key]])) : { traffic_source: "unattributed" }),
        ...(attribution ? acquisitionMetadata(attribution) : {}),
        telemetry_version: 2,
        registration_verified: true,
        user_id: user.id,
        device_type: /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop",
        internal: local || await analyticsUserIsInternal(user.id, user.email),
      },
    });
  } catch (error) {
    // A failed measurement must not turn successful account creation into an
    // auth failure. This is observable and never reported as an attributed signup.
    getLogger({ component: "growth_signup" }).error({ error_type: error instanceof Error ? error.name : "Unknown" }, "Could not record signup attribution");
  }
}
