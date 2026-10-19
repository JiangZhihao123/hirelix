import { after, NextRequest, NextResponse } from "next/server";

import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  telemetryMetadata,
  telemetryRoute,
  telemetryReferrer,
  telemetryBot,
} from "@/lib/telemetry";
import {
  analyticsUserIsInternal,
  analyticsDatabaseIsLocal,
} from "@/lib/telemetry-server";
import { db } from "@/db/client";
import { hirelix_growth_landing_events } from "@/db/schema";
import { getLogger } from "@/lib/logger";
import { isLocalOrPrivateIp, classifyTraffic } from "@/lib/growth-traffic";
import { validateLandingEventForRecording } from "@/lib/growth-landing-validation";

const DEFAULT_PREVIEW_REQUEST_RECIPIENT = "jzh_spring@163.com";
const DEFAULT_ALERT_TIMEOUT_MS = 1200;
const growthLandingLogger = getLogger({ component: "growth_landing_event" });

type LandingEventBody = {
  event_type?: unknown;
  event_id?: unknown;
  visitor_id?: unknown;
  session_id?: unknown;
  email_id?: unknown;
  batch_id?: unknown;
  recipient?: unknown;
  company?: unknown;
  page_url?: unknown;
  referrer?: unknown;
  metadata?: unknown;
};

function textValue(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function getHeader(req: NextRequest, name: string) {
  const value = req.headers.get(name);
  return value && value.trim() ? value.trim() : null;
}

function getIpAddress(req: NextRequest) {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return getHeader(req, "x-real-ip");
}

function metadataValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => {
      return (
        item === null ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean"
      );
    }),
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAlertRecipient() {
  return (
    process.env.GROWTH_PREVIEW_REQUEST_ALERT_EMAIL ||
    process.env.GROWTH_OUTREACH_ALERT_EMAIL ||
    DEFAULT_PREVIEW_REQUEST_RECIPIENT
  );
}

function getAlertFromEmail() {
  return (
    process.env.GROWTH_PREVIEW_REQUEST_ALERT_FROM_EMAIL ||
    process.env.GROWTH_OUTREACH_ALERT_FROM_EMAIL ||
    process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL ||
    "Hirelix <notifications@hirelix.online>"
  );
}

function getAlertTimeoutMs() {
  const value = Number.parseInt(
    process.env.GROWTH_PREVIEW_REQUEST_ALERT_TIMEOUT_MS || "",
    10,
  );
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_ALERT_TIMEOUT_MS;
}

async function notifyPreviewRequest(params: {
  batch_id: string | null;
  company: string | null;
  email_id: string | null;
  metadata: Record<string, unknown>;
  recipient: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getAlertFromEmail();
  const to = getAlertRecipient();
  if (!apiKey || !from || !to) return;

  const replyEmail =
    typeof params.metadata.reply_email === "string"
      ? params.metadata.reply_email
      : "unknown";
  const rolePreview =
    typeof params.metadata.role_preview === "string"
      ? params.metadata.role_preview
      : "";
  const label =
    params.company || params.recipient || params.email_id || replyEmail;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <p>A cold-email visitor submitted a Hirelix preview request.</p>
      <ul>
        <li><strong>Email ID:</strong> ${escapeHtml(params.email_id || "unknown")}</li>
        <li><strong>Batch:</strong> ${escapeHtml(params.batch_id || "unknown")}</li>
        <li><strong>Recipient:</strong> ${escapeHtml(params.recipient || "unknown")}</li>
        <li><strong>Company:</strong> ${escapeHtml(params.company || "unknown")}</li>
        <li><strong>Reply email:</strong> ${escapeHtml(replyEmail)}</li>
      </ul>
      <p><strong>Role / JD snippet:</strong></p>
      <p>${escapeHtml(rolePreview || "not provided")}</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(getAlertTimeoutMs()),
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Hirelix preview request: ${label}`,
      html,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      typeof data?.message === "string"
        ? data.message
        : `Resend failed with status ${response.status}`;
    throw new Error(message);
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 16384)
    return NextResponse.json({ error: "Event too large" }, { status: 413 });
  let body: LandingEventBody;
  try {
    const raw = await req.text();
    if (raw.length > 16384)
      return NextResponse.json({ error: "Event too large" }, { status: 413 });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = textValue(body.event_type, 80);
  const ipAddress = getIpAddress(req);
  const local = await analyticsDatabaseIsLocal();
  if (
    (isLocalOrPrivateIp(ipAddress) ||
      classifyTraffic({ ipAddress }) === "data_center") &&
    !local
  ) {
    return NextResponse.json({ ok: true, ignored: true, reason: "local_ip" });
  }
  const rawMetadata = metadataValue(body.metadata);
  const metadata: Record<string, unknown> =
    eventType === "preview_request_submit" && rawMetadata.telemetry_version !== 2
      ? rawMetadata
      : telemetryMetadata(rawMetadata);
  const pageUrl =
    req.nextUrl.origin +
    telemetryRoute(textValue(body.page_url, 1000) || "/unknown");
  const v2 = rawMetadata.telemetry_version === 2;
  if (
    (telemetryBot(req.headers.get("user-agent") || "") && !local) ||
    (rawMetadata.automated === true && !local)
  )
    return NextResponse.json({ ok: true, ignored: true, reason: "automation" });
  if (v2) {
    if (
      typeof body.event_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.event_id,
      )
    )
      return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
    metadata.telemetry_version = 2;
    if (
      ![rawMetadata.page_id, body.visitor_id, body.session_id].every(
        (value) =>
          typeof value === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
          ),
      )
    )
      return NextResponse.json({ error: "Invalid identity" }, { status: 400 });
    metadata.page_id = rawMetadata.page_id;
    metadata.country =
      textValue(req.headers.get("x-vercel-ip-country"), 4) || "unknown";
    metadata.environment = local ? "local" : "production";
    const user = req.headers.get("cookie")
      ? await getUserFromApiRequest(req)
      : null;
    metadata.user_id = user?.id || null;
    metadata.internal =
      local ||
      (user ? await analyticsUserIsInternal(user.id, user.email) : false);
  }
  const decision = validateLandingEventForRecording({
    eventType,
    metadata,
    pageUrl,
  });
  if (decision.action === "ignore") {
    if (decision.reason === "invalid_event_type") {
      growthLandingLogger.warn({
        event: "landing_event_ignored",
        reason: decision.reason,
        event_type: decision.eventType,
      });
    }
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: decision.reason,
    });
  }
  if (decision.action === "reject") {
    return NextResponse.json(
      { error: decision.error, code: decision.reason },
      { status: decision.status },
    );
  }

  const emailId = textValue(body.email_id, 200);
  const batchId = textValue(body.batch_id, 80);
  const recipient = textValue(body.recipient, 320);
  const company = textValue(body.company, 200);

  try {
    await db
      .insert(hirelix_growth_landing_events)
      .values({
        ...(v2 ? { id: body.event_id as string } : {}),
        event_type: decision.eventType,
        visitor_id: textValue(body.visitor_id, 120),
        session_id: textValue(body.session_id, 120),
        email_id: v2 ? null : emailId,
        batch_id: v2 ? null : batchId,
        recipient: v2 ? null : recipient,
        company: v2 ? null : company,
        page_url: pageUrl,
        referrer: telemetryReferrer(textValue(body.referrer, 1000) || ""),
        ip_address: ipAddress,
        user_agent: getHeader(req, "user-agent"),
        metadata: decision.metadata,
      })
      .onConflictDoNothing();
  } catch (error) {
    growthLandingLogger.error({
      event: "landing_event_record_failed",
      event_type: decision.eventType,
      error_type: error instanceof Error ? error.name : "Unknown",
    });
    return NextResponse.json(
      { error: "Failed to record event" },
      { status: 500 },
    );
  }

  if (decision.eventType === "preview_request_submit") {
    after(() => {
      return notifyPreviewRequest({
        batch_id: batchId,
        company,
        email_id: emailId,
        metadata: decision.metadata,
        recipient,
      }).catch((error) => {
        growthLandingLogger.error({
          event: "preview_request_alert_failed",
          email_id: emailId,
          error_type: error instanceof Error ? error.name : "Unknown",
        });
      });
    });
  }

  return NextResponse.json({ ok: true });
}
