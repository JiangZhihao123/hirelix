import { and, desc, gte, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import {
  hirelix_beta_invite_events,
  hirelix_beta_invites,
  hirelix_growth_landing_events,
} from "@/db/schema";
import {
  buildOpsConversionData,
  emptyBetaInviteOpsSummary,
  getOpsRangeWindow,
  maskIp,
  normalizeOpsRange,
  type BetaInviteOpsSummary,
  type GrowthEventRecord,
  type IpAttribution,
  type IpNetworkType,
} from "@/lib/ops-conversion";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = process.env.OPS_DASHBOARD_SECRET;
  if (!secret) return false;
  return req.nextUrl.searchParams.get("secret") === secret;
}

type IpWhoResponse = {
  success?: boolean;
  ip?: string;
  continent?: string;
  country?: string;
  region?: string;
  city?: string;
  connection?: {
    asn?: number;
    org?: string;
    isp?: string;
  };
  security?: {
    proxy?: boolean;
    vpn?: boolean;
    tor?: boolean;
    hosting?: boolean;
  };
};

type IpApiResponse = {
  status?: string;
  country?: string;
  regionName?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string;
  hosting?: boolean;
  proxy?: boolean;
  mobile?: boolean;
};

const DATA_CENTER_ORG_PATTERN =
  /amazon|aws|google|cloud|microsoft|azure|digitalocean|linode|akamai|ovh|hetzner|vultr|oracle|alibaba|tencent|huawei|cloudflare|fastly|datadog|vercel|netlify|render|fly\.io|github|gitlab|mailgun|sendgrid|mandrill|proofpoint|mimecast|barracuda|palo alto|zscaler|netskope|ipxo|akari|security|hosting|colo|datacenter|data center/i;

function uniqueIpAddresses(rows: GrowthEventRecord[]) {
  return [...new Set(rows.map((row) => row.ip_address).filter((ip): ip is string => Boolean(ip)))];
}

function classifyNetworkType(params: { hosting?: boolean; mobile?: boolean; org?: string; isp?: string }): IpNetworkType {
  const orgText = `${params.org ?? ""} ${params.isp ?? ""}`;
  if (params.hosting || DATA_CENTER_ORG_PATTERN.test(orgText)) return "data_center";
  if (!orgText.trim()) return "unknown";
  if (
    params.mobile ||
    /telecom|communications|broadband|fiber|cable|wireless|mobile|residential|verizon|comcast|charter|at&t|t-mobile|vodafone|orange|telefonica|deutsche telekom|bt group/i.test(orgText)
  ) {
    return "residential";
  }
  return "business";
}

function fallbackCloudAttribution(ipAddress: string): IpAttribution | null {
  if (ipAddress.startsWith("72.145.") || ipAddress.startsWith("72.144.") || ipAddress.startsWith("72.146.") || ipAddress.startsWith("72.147.")) {
    return {
      ipAddress,
      maskedIp: maskIp(ipAddress),
      country: "未知",
      region: "",
      city: "",
      networkType: "data_center",
      org: "Microsoft",
      asn: "AS8075",
    };
  }
  if (ipAddress.startsWith("34.") || ipAddress.startsWith("104.197.")) {
    return {
      ipAddress,
      maskedIp: maskIp(ipAddress),
      country: "未知",
      region: "",
      city: "",
      networkType: "data_center",
      org: "Google Cloud",
      asn: "",
    };
  }
  if (ipAddress.startsWith("172.186.") || ipAddress.startsWith("135.232.")) {
    return {
      ipAddress,
      maskedIp: maskIp(ipAddress),
      country: "未知",
      region: "",
      city: "",
      networkType: "data_center",
      org: "Microsoft Azure",
      asn: "",
    };
  }
  return null;
}

async function lookupIpAttribution(ipAddress: string): Promise<IpAttribution> {
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ipAddress)}?security=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`ip lookup failed: ${response.status}`);
    const data = (await response.json()) as IpWhoResponse;
    if (data.success === false) throw new Error("ip lookup unsuccessful");

    return {
      ipAddress,
      maskedIp: maskIp(ipAddress),
      country: data.country || "未知",
      region: data.region || "",
      city: data.city || "",
      networkType: classifyNetworkType({
        hosting: data.security?.hosting,
        org: data.connection?.org,
        isp: data.connection?.isp,
      }),
      org: data.connection?.org || data.connection?.isp || "",
      asn: data.connection?.asn ? `AS${data.connection.asn}` : "",
    };
  } catch {
    try {
      const response = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(ipAddress)}?fields=status,country,regionName,city,isp,org,as,hosting,proxy,mobile`,
        { cache: "no-store", signal: AbortSignal.timeout(2500) },
      );
      if (!response.ok) throw new Error(`ip-api failed: ${response.status}`);
      const data = (await response.json()) as IpApiResponse;
      if (data.status !== "success") throw new Error("ip-api unsuccessful");

      return {
        ipAddress,
        maskedIp: maskIp(ipAddress),
        country: data.country || "未知",
        region: data.regionName || "",
        city: data.city || "",
        networkType: classifyNetworkType({
          hosting: data.hosting,
          mobile: data.mobile,
          org: data.org,
          isp: data.isp,
        }),
        org: data.org || data.isp || "",
        asn: data.as?.match(/AS\d+/)?.[0] ?? "",
      };
    } catch {
      return fallbackCloudAttribution(ipAddress) ?? {
        ipAddress,
        maskedIp: maskIp(ipAddress),
        country: "未知",
        region: "",
        city: "",
        networkType: "unknown",
        org: "",
        asn: "",
      };
    }
  }
}

async function lookupIpAttributions(rows: GrowthEventRecord[]) {
  const entries: Array<readonly [string, IpAttribution]> = [];
  const ipAddresses = uniqueIpAddresses(rows);
  for (let index = 0; index < ipAddresses.length; index += 6) {
    const batch = ipAddresses.slice(index, index + 6);
    entries.push(
      ...(await Promise.all(
        batch.map(async (ipAddress) => [ipAddress, await lookupIpAttribution(ipAddress)] as const),
      )),
    );
  }
  return new Map(entries);
}

async function getBetaInviteSummary(start: Date, end: Date): Promise<BetaInviteOpsSummary> {
  const summary = emptyBetaInviteOpsSummary();
  const [createdRows, activatedRows, eventRows] = await Promise.all([
    db
      .select({
        source: hirelix_beta_invites.source,
        count: sql<number>`count(*)::int`,
      })
      .from(hirelix_beta_invites)
      .where(
        and(
          gte(hirelix_beta_invites.created_at, start),
          lt(hirelix_beta_invites.created_at, end),
        ),
      )
      .groupBy(hirelix_beta_invites.source),
    db
      .select({
        source: hirelix_beta_invites.source,
        count: sql<number>`count(*)::int`,
      })
      .from(hirelix_beta_invites)
      .where(
        and(
          gte(hirelix_beta_invites.activated_at, start),
          lt(hirelix_beta_invites.activated_at, end),
        ),
      )
      .groupBy(hirelix_beta_invites.source),
    db
      .select({
        event_type: hirelix_beta_invite_events.event_type,
        count: sql<number>`count(DISTINCT ${hirelix_beta_invite_events.invite_code})::int`,
      })
      .from(hirelix_beta_invite_events)
      .where(
        and(
          gte(hirelix_beta_invite_events.created_at, start),
          lt(hirelix_beta_invite_events.created_at, end),
        ),
      )
      .groupBy(hirelix_beta_invite_events.event_type),
  ]);

  for (const row of createdRows) {
    summary.sent += row.count;
    if (row.source === "referral") summary.referralSent += row.count;
  }
  for (const row of activatedRows) {
    summary.activated += row.count;
    if (row.source === "referral") summary.referralActivated += row.count;
  }
  for (const row of eventRows) {
    if (row.event_type === "invite_opened") summary.opened = row.count;
    if (row.event_type === "invite_scan_detected") summary.scans = row.count;
    if (row.event_type === "invite_search_created") summary.searchCreated = row.count;
  }

  return summary;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const range = normalizeOpsRange(req.nextUrl.searchParams.get("range"));
  const { start, end } = getOpsRangeWindow(range);

  const rows = await db
    .select({
      id: hirelix_growth_landing_events.id,
      event_type: hirelix_growth_landing_events.event_type,
      visitor_id: hirelix_growth_landing_events.visitor_id,
      session_id: hirelix_growth_landing_events.session_id,
      email_id: hirelix_growth_landing_events.email_id,
      batch_id: hirelix_growth_landing_events.batch_id,
      recipient: hirelix_growth_landing_events.recipient,
      company: hirelix_growth_landing_events.company,
      page_url: hirelix_growth_landing_events.page_url,
      referrer: hirelix_growth_landing_events.referrer,
      ip_address: hirelix_growth_landing_events.ip_address,
      user_agent: hirelix_growth_landing_events.user_agent,
      metadata: hirelix_growth_landing_events.metadata,
      created_at: hirelix_growth_landing_events.created_at,
    })
    .from(hirelix_growth_landing_events)
    .where(
      and(
        gte(hirelix_growth_landing_events.created_at, start),
        lt(hirelix_growth_landing_events.created_at, end),
      ),
    )
    .orderBy(desc(hirelix_growth_landing_events.created_at))
    .limit(5000);

  const records = rows as GrowthEventRecord[];
  const [ipAttribution, betaInvites] = await Promise.all([
    lookupIpAttributions(records),
    getBetaInviteSummary(start, end),
  ]);
  const data = buildOpsConversionData(records, {
    range,
    start,
    end,
    ipAttribution,
    betaInvites,
  });

  return NextResponse.json(data);
}
