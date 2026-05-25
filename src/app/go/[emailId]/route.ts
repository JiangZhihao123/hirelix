import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { hirelix_growth_outreach_clicks } from "@/db/schema";

const DEFAULT_CLICK_ALERT_RECIPIENT = "jzh_spring@163.com";

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getClickAlertRecipient() {
  return process.env.GROWTH_OUTREACH_ALERT_EMAIL || DEFAULT_CLICK_ALERT_RECIPIENT;
}

function getClickAlertFromEmail() {
  return process.env.GROWTH_OUTREACH_ALERT_FROM_EMAIL || process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL;
}

async function notifyClick(params: {
  emailId: string;
  batchId: string | null;
  recipient: string | null;
  company: string | null;
  destinationUrl: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getClickAlertFromEmail();
  const to = getClickAlertRecipient();
  if (!apiKey || !from || !to) return;

  const label = params.company || params.recipient || params.emailId;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <p>A cold-email recipient clicked a Hirelix outreach link.</p>
      <ul>
        <li><strong>Email ID:</strong> ${escapeHtml(params.emailId)}</li>
        <li><strong>Batch:</strong> ${escapeHtml(params.batchId || "unknown")}</li>
        <li><strong>Recipient:</strong> ${escapeHtml(params.recipient || "unknown")}</li>
        <li><strong>Company:</strong> ${escapeHtml(params.company || "unknown")}</li>
        <li><strong>IP:</strong> ${escapeHtml(params.ipAddress || "unknown")}</li>
        <li><strong>User agent:</strong> ${escapeHtml(params.userAgent || "unknown")}</li>
      </ul>
      <p><a href="${escapeHtml(params.destinationUrl)}">Open tracked destination</a></p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Hirelix outreach click: ${label}`,
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const { emailId } = await params;
  const url = new URL(req.url);
  const destination = buildDestination(req, emailId);
  const batchId = url.searchParams.get("batch");
  const recipient = url.searchParams.get("to");
  const company = url.searchParams.get("company");
  const ipAddress = getIpAddress(req);
  const userAgent = getHeader(req, "user-agent");

  try {
    await db.insert(hirelix_growth_outreach_clicks).values({
      email_id: emailId,
      batch_id: batchId,
      recipient,
      company,
      source_url: req.url,
      destination_url: destination.toString(),
      ip_address: ipAddress,
      user_agent: userAgent,
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

  try {
    await notifyClick({
      emailId,
      batchId,
      recipient,
      company,
      destinationUrl: destination.toString(),
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error("[growth:outreach_click_alert_failed]", {
      email_id: emailId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.redirect(destination, 302);
}
