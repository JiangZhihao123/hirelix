import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { hirelix_growth_landing_events } from "@/db/schema";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "engaged_10s",
  "hero_input_start",
  "hero_submit_attempt",
  "sample_view",
  "signin_view",
  "pricing_plan_select",
  "preview_request_click",
  "book_feedback_click",
  "reply_email_click",
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

export async function POST(req: NextRequest) {
  let body: LandingEventBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = textValue(body.event_type, 80);
  if (!eventType || !ALLOWED_EVENTS.has(eventType)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }

  try {
    await db.insert(hirelix_growth_landing_events).values({
      event_type: eventType,
      visitor_id: textValue(body.visitor_id, 120),
      session_id: textValue(body.session_id, 120),
      email_id: textValue(body.email_id, 200),
      batch_id: textValue(body.batch_id, 80),
      recipient: textValue(body.recipient, 320),
      company: textValue(body.company, 200),
      page_url: textValue(body.page_url, 1000),
      referrer: textValue(body.referrer, 1000),
      ip_address: getIpAddress(req),
      user_agent: getHeader(req, "user-agent"),
      metadata: metadataValue(body.metadata),
    });
  } catch (error) {
    console.error("[growth:landing_event_failed]", {
      event_type: eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
