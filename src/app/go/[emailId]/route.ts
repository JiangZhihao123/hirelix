import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { hirelix_growth_outreach_clicks } from "@/db/schema";

function getBaseUrl() {
  return process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://hirelix.online";
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

function buildDestination(req: NextRequest, emailId: string) {
  const url = new URL(req.url);
  const baseUrl = getBaseUrl();
  const destination = new URL("/", baseUrl);

  destination.searchParams.set("utm_source", "cold_email");
  destination.searchParams.set("utm_medium", "email");
  destination.searchParams.set("utm_campaign", url.searchParams.get("campaign") || "founder_outreach");
  destination.searchParams.set("utm_content", emailId);
  destination.searchParams.set("entry", "landing");
  destination.searchParams.set("intent_path", "direct_jd");
  destination.searchParams.set("traffic_source", "cold_email");

  return destination;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const { emailId } = await params;
  const url = new URL(req.url);
  const destination = buildDestination(req, emailId);

  try {
    await db.insert(hirelix_growth_outreach_clicks).values({
      email_id: emailId,
      batch_id: url.searchParams.get("batch"),
      recipient: url.searchParams.get("to"),
      company: url.searchParams.get("company"),
      source_url: req.url,
      destination_url: destination.toString(),
      ip_address: getIpAddress(req),
      user_agent: getHeader(req, "user-agent"),
      referer: getHeader(req, "referer"),
      metadata: {
        campaign: url.searchParams.get("campaign") || "founder_outreach",
      },
    });
  } catch (error) {
    console.error("[growth:outreach_click_failed]", {
      email_id: emailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.redirect(destination, 302);
}
