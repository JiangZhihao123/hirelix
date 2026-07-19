import { after, NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { hirelix_growth_landing_events } from "@/db/schema";
import { getLogger } from "@/lib/logger";

const DEFAULT_PREVIEW_REQUEST_RECIPIENT = "jzh_spring@163.com";
const DEFAULT_ALERT_TIMEOUT_MS = 1200;
const growthLandingLogger = getLogger({ component: "growth_landing_event" });

export const ALLOWED_LANDING_EVENTS = new Set([
  "page_view",
  "session_summary",
  "engaged_10s",
  "engaged_30s",
  "engaged_60s",
  "engaged_180s",
  "section_view",
  "hero_input_start",
  "hero_submit_attempt",
  "try_for_free_click",
  "sample_view",
  "signin_view",
  "google_signin_click",
  "password_signin",
  "signup_success",
  "new_search_view",
  "search_create_success",
  "search_create_failed",
  "pricing_plan_select",
  "preview_request_click",
  "preview_request_submit",
  "book_feedback_click",
  "reply_email_click",
  "invite_activate_click",
  "email_otp_requested",
  "email_otp_verified",
  "search_processing_view",
  "search_results_view",
  "results_summary_view",
  "search_done",
  "candidate_expand",
  "upgrade_cta_click",
  "upgrade_value_exposed",
  "results_unlock_cta_viewed",
  "results_unlock_cta_clicked",
  "contact_unlock_gate_view",
  "client_brief_gate_view",
  "checkout_start",
  "checkout_success",
  "checkout_error",
  "retry_search_click",
  "plan_status_card_click",
]);

type LandingEventBody = {
  event_type?: unknown;
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

type LandingEventDecision =
  | {
      action: "record";
      eventType: string;
      metadata: Record<string, unknown>;
    }
  | {
      action: "ignore";
      eventType: string | null;
      reason: "invalid_event_type" | "ops_page";
    }
  | {
      action: "reject";
      error: string;
      reason: "invalid_preview_request";
      status: 400;
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

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
}

function getMetadataText(metadata: Record<string, unknown>, key: string, maxLength = 500) {
  return textValue(metadata[key], maxLength);
}

function isOpsPage(value: string | null) {
  if (!value) return false;
  try {
    return new URL(value).pathname.startsWith("/ops/");
  } catch {
    return value.includes("/ops/");
  }
}

export function validateLandingEventForRecording(params: {
  eventType: string | null;
  metadata: Record<string, unknown>;
  pageUrl: string | null;
}): LandingEventDecision {
  if (!params.eventType || !ALLOWED_LANDING_EVENTS.has(params.eventType)) {
    return {
      action: "ignore",
      eventType: params.eventType,
      reason: "invalid_event_type",
    };
  }

  if (isOpsPage(params.pageUrl) || isOpsPage(getMetadataText(params.metadata, "route", 120))) {
    return {
      action: "ignore",
      eventType: params.eventType,
      reason: "ops_page",
    };
  }

  if (params.eventType === "preview_request_submit") {
    const replyEmail = getMetadataText(params.metadata, "reply_email", 160);
    const rolePreview = getMetadataText(params.metadata, "role_preview", 500);
    if (!isValidEmail(replyEmail) || !rolePreview || rolePreview.length < 12) {
      return {
        action: "reject",
        error: "Invalid preview request",
        reason: "invalid_preview_request",
        status: 400,
      };
    }
    return {
      action: "record",
      eventType: params.eventType,
      metadata: {
        ...params.metadata,
        reply_email: replyEmail,
        role_preview: rolePreview,
        role_length: rolePreview.length,
      },
    };
  }

  return {
    action: "record",
    eventType: params.eventType,
    metadata: params.metadata,
  };
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
  return process.env.GROWTH_PREVIEW_REQUEST_ALERT_EMAIL ||
    process.env.GROWTH_OUTREACH_ALERT_EMAIL ||
    DEFAULT_PREVIEW_REQUEST_RECIPIENT;
}

function getAlertFromEmail() {
  return process.env.GROWTH_PREVIEW_REQUEST_ALERT_FROM_EMAIL ||
    process.env.GROWTH_OUTREACH_ALERT_FROM_EMAIL ||
    process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL ||
    "Hirelix <notifications@hirelix.online>";
}

function getAlertTimeoutMs() {
  const value = Number.parseInt(process.env.GROWTH_PREVIEW_REQUEST_ALERT_TIMEOUT_MS || "", 10);
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
    typeof params.metadata.reply_email === "string" ? params.metadata.reply_email : "unknown";
  const rolePreview =
    typeof params.metadata.role_preview === "string" ? params.metadata.role_preview : "";
  const label = params.company || params.recipient || params.email_id || replyEmail;
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
    const message = typeof data?.message === "string"
      ? data.message
      : `Resend failed with status ${response.status}`;
    throw new Error(message);
  }
}

export async function POST(req: NextRequest) {
  let body: LandingEventBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = textValue(body.event_type, 80);
  const metadata = metadataValue(body.metadata);
  const pageUrl = textValue(body.page_url, 1000);
  const decision = validateLandingEventForRecording({ eventType, metadata, pageUrl });
  if (decision.action === "ignore") {
    if (decision.reason === "invalid_event_type") {
      growthLandingLogger.warn({
        event: "landing_event_ignored",
        reason: decision.reason,
        event_type: decision.eventType,
      });
    }
    return NextResponse.json({ ok: true, ignored: true, reason: decision.reason });
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
    await db.insert(hirelix_growth_landing_events).values({
      event_type: decision.eventType,
      visitor_id: textValue(body.visitor_id, 120),
      session_id: textValue(body.session_id, 120),
      email_id: emailId,
      batch_id: batchId,
      recipient,
      company,
      page_url: pageUrl,
      referrer: textValue(body.referrer, 1000),
      ip_address: getIpAddress(req),
      user_agent: getHeader(req, "user-agent"),
      metadata: decision.metadata,
    });
  } catch (error) {
    growthLandingLogger.error({
      event: "landing_event_record_failed",
      event_type: decision.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
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
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  return NextResponse.json({ ok: true });
}
