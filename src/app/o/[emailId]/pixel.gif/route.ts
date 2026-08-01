import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { hirelix_growth_landing_events } from "@/db/schema";
import {
  classifyEmailImageRequest,
  isValidEmailPixelId,
} from "@/lib/email-open-tracking";
import { getLogger } from "@/lib/logger";

const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const emailOpenLogger = getLogger({ component: "email_open_pixel" });

function getHeader(req: NextRequest, name: string) {
  const value = req.headers.get(name);
  return value && value.trim() ? value.trim() : null;
}

function getIpAddress(req: NextRequest) {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return getHeader(req, "x-real-ip");
}

function safeQueryValue(value: string | null, maxLength: number) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function pixelResponse() {
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      "Content-Length": String(TRANSPARENT_GIF.byteLength),
      "Content-Type": "image/gif",
      Expires: "0",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const { emailId } = await params;
  if (!isValidEmailPixelId(emailId)) return pixelResponse();

  const url = new URL(req.url);
  const userAgent = getHeader(req, "user-agent");
  const requestClass = classifyEmailImageRequest(userAgent);
  const ipAddress = getIpAddress(req);
  const batchId = safeQueryValue(url.searchParams.get("batch"), 80);
  const campaign = safeQueryValue(url.searchParams.get("campaign"), 80);
  const recipient = getHeader(req, "x-email-recipient") || safeQueryValue(url.searchParams.get("to"), 320);
  const company = safeQueryValue(url.searchParams.get("company"), 200);

  emailOpenLogger.info({
    event: "email_open_pixel_requested",
    email_id: emailId,
    batch_id: batchId,
    campaign,
    request_class: requestClass,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  try {
    await db.insert(hirelix_growth_landing_events).values({
      event_type: "email_image_loaded",
      email_id: emailId,
      batch_id: batchId,
      recipient,
      company,
      page_url: url.origin + url.pathname,
      referrer: getHeader(req, "referer"),
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: {
        campaign,
        request_class: requestClass,
        signal_quality: "weak",
        interpretation: "image_loaded_not_confirmed_read",
        accept: getHeader(req, "accept"),
        via: getHeader(req, "via"),
      },
    });
  } catch (error) {
    emailOpenLogger.error({
      event: "email_open_pixel_record_failed",
      email_id: emailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return pixelResponse();
}
