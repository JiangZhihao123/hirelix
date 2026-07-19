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
  type OpsOperationsSnapshot,
} from "@/lib/ops-conversion";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = process.env.OPS_DASHBOARD_SECRET;
  if (!secret) return false;
  const authorization = req.headers.get("authorization");
  return authorization === `Bearer ${secret}`;
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

function resultRows<T>(result: unknown) {
  return result as T[];
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getOperationsSnapshot(
  start: Date,
  end: Date,
  growthEvents: GrowthEventRecord[],
): Promise<OpsOperationsSnapshot> {
  type SummaryRow = {
    total_users: number | string;
    new_users: number | string;
    active_paid_users: number | string;
    searches_created: number | string;
    searches_completed: number | string;
    searches_failed: number | string;
    searches_processing: number | string;
    median_completion_minutes: number | string | null;
    candidates_delivered: number | string;
    average_candidates_per_completed: number | string | null;
  };
  type JobRow = {
    search_queued: number | string;
    search_running: number | string;
    search_failed: number | string;
    evidence_queued: number | string;
    evidence_running: number | string;
    evidence_failed: number | string;
    stale: number | string;
  };
  type IndexRow = {
    total_profiles: number | string;
    ready_profiles: number | string;
    pending_profiles: number | string;
    failed_profiles: number | string;
  };
  type StatusRow = { status: string; count: number | string };
  type RevenueRow = { currency: string | null; amount_minor: number | string; payments: number | string };
  type RecentSearchRow = {
    id: string;
    title: string | null;
    status: string;
    candidate_count: number | string;
    duration_minutes: number | string | null;
    created_at: Date | string;
    error_message: string | null;
  };
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [summaryResult, jobResult, indexResult, statusResult, revenueResult, recentResult] =
    await db.transaction((tx) => Promise.all([
      tx.execute(sql`
        WITH range_searches AS (
          SELECT *
          FROM hirelix_searches
          WHERE created_at >= ${startIso}::timestamptz AND created_at < ${endIso}::timestamptz
        ), candidate_counts AS (
          SELECT c.search_id, count(*)::int AS candidate_count
          FROM hirelix_candidates c
          JOIN range_searches s ON s.id = c.search_id
          GROUP BY c.search_id
        )
        SELECT
          (SELECT count(*)::int FROM "user") AS total_users,
          (SELECT count(*)::int FROM "user" WHERE "createdAt" >= ${startIso}::timestamptz AND "createdAt" < ${endIso}::timestamptz) AS new_users,
          (SELECT count(*)::int FROM hirelix_user_settings
            WHERE coalesce(subscription_plan, 'free') <> 'free'
              AND coalesce(subscription_status, 'active') IN ('active', 'trialing')) AS active_paid_users,
          count(*)::int AS searches_created,
          count(*) FILTER (WHERE status = 'done')::int AS searches_completed,
          count(*) FILTER (WHERE status = 'error')::int AS searches_failed,
          count(*) FILTER (WHERE status NOT IN ('done', 'error'))::int AS searches_processing,
          coalesce(percentile_cont(0.5) WITHIN GROUP (
            ORDER BY extract(epoch FROM (coalesce(done_at, search_completed_at, updated_at) - created_at)) / 60
          ) FILTER (WHERE status = 'done'), 0) AS median_completion_minutes,
          coalesce((SELECT sum(candidate_count)::int FROM candidate_counts), 0) AS candidates_delivered,
          coalesce((SELECT avg(candidate_count) FROM candidate_counts cc
            JOIN range_searches completed ON completed.id = cc.search_id
            WHERE completed.status = 'done'), 0) AS average_candidates_per_completed
        FROM range_searches
      `),
      tx.execute(sql`
        SELECT
          (SELECT count(*)::int FROM hirelix_search_jobs WHERE status IN ('queued', 'retry')) AS search_queued,
          (SELECT count(*)::int FROM hirelix_search_jobs
            WHERE finished_at IS NULL AND (locked_at IS NOT NULL OR status IN ('running', 'processing'))) AS search_running,
          (SELECT count(*)::int FROM hirelix_search_jobs
            WHERE status IN ('failed', 'fatal_error', 'error')
              AND updated_at >= ${startIso}::timestamptz AND updated_at < ${endIso}::timestamptz) AS search_failed,
          (SELECT count(*)::int FROM hirelix_public_evidence_jobs WHERE status IN ('queued', 'retry')) AS evidence_queued,
          (SELECT count(*)::int FROM hirelix_public_evidence_jobs
            WHERE finished_at IS NULL AND (locked_at IS NOT NULL OR status IN ('running', 'processing'))) AS evidence_running,
          (SELECT count(*)::int FROM hirelix_public_evidence_jobs
            WHERE status IN ('failed', 'fatal_error', 'error')
              AND updated_at >= ${startIso}::timestamptz AND updated_at < ${endIso}::timestamptz) AS evidence_failed,
          (
            (SELECT count(*) FROM hirelix_search_jobs
              WHERE finished_at IS NULL AND status IN ('queued', 'retry', 'running', 'processing')
                AND updated_at < now() - interval '30 minutes') +
            (SELECT count(*) FROM hirelix_public_evidence_jobs
              WHERE finished_at IS NULL AND status IN ('queued', 'retry', 'running', 'processing')
                AND updated_at < now() - interval '30 minutes')
          )::int AS stale
      `),
      tx.execute(sql`
        SELECT
          count(*)::int AS total_profiles,
          count(*) FILTER (WHERE processing_status = 'ready')::int AS ready_profiles,
          count(*) FILTER (WHERE processing_status IN ('pending', 'representing', 'embedding'))::int AS pending_profiles,
          count(*) FILTER (WHERE processing_status IN ('failed', 'error'))::int AS failed_profiles
        FROM hirelix_profiles
      `),
      tx.execute(sql`
        SELECT status, count(*)::int AS count
        FROM hirelix_searches
        WHERE created_at >= ${startIso}::timestamptz AND created_at < ${endIso}::timestamptz
        GROUP BY status
        ORDER BY count DESC, status
      `),
      tx.execute(sql`
        SELECT
          coalesce(payload->'data'->>'currency_code', 'USD') AS currency,
          coalesce(sum(nullif(payload->'data'->'details'->'totals'->>'grand_total', '')::bigint), 0) AS amount_minor,
          count(*)::int AS payments
        FROM hirelix_billing_events
        WHERE event_type = 'transaction.completed'
          AND created_at >= ${startIso}::timestamptz AND created_at < ${endIso}::timestamptz
          AND coalesce(payload->'data'->'custom_data'->>'purchase_type', '') <> 'test_payment'
        GROUP BY coalesce(payload->'data'->>'currency_code', 'USD')
      `),
      tx.execute(sql`
        SELECT
          s.id,
          coalesce(nullif(s.title, ''), '未命名岗位') AS title,
          s.status,
          count(c.id)::int AS candidate_count,
          CASE WHEN s.status = 'done' THEN round((extract(epoch FROM (coalesce(s.done_at, s.search_completed_at, s.updated_at) - s.created_at)) / 60)::numeric, 1) ELSE NULL END AS duration_minutes,
          s.created_at,
          s.error_message
        FROM hirelix_searches s
        LEFT JOIN hirelix_candidates c ON c.search_id = s.id
        WHERE s.created_at >= ${startIso}::timestamptz AND s.created_at < ${endIso}::timestamptz
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT 12
      `),
    ]));

  const summary = resultRows<SummaryRow>(summaryResult)[0];
  const jobs = resultRows<JobRow>(jobResult)[0];
  const profileIndex = resultRows<IndexRow>(indexResult)[0];
  const completed = numberValue(summary?.searches_completed);
  const failed = numberValue(summary?.searches_failed);
  const checkoutStarts = growthEvents.filter((event) => event.event_type === "checkout_start").length;

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: numberValue(summary?.total_users),
      newInRange: numberValue(summary?.new_users),
      activePaid: numberValue(summary?.active_paid_users),
    },
    searches: {
      created: numberValue(summary?.searches_created),
      completed,
      failed,
      processing: numberValue(summary?.searches_processing),
      successRate: completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : 0,
      medianCompletionMinutes: Math.round(numberValue(summary?.median_completion_minutes) * 10) / 10,
      candidatesDelivered: numberValue(summary?.candidates_delivered),
      averageCandidatesPerCompleted:
        Math.round(numberValue(summary?.average_candidates_per_completed) * 10) / 10,
    },
    billing: {
      completedPayments: resultRows<RevenueRow>(revenueResult).reduce(
        (total, row) => total + numberValue(row.payments),
        0,
      ),
      checkoutStarts,
      checkoutErrors: growthEvents.filter((event) => event.event_type === "checkout_error").length,
      upgradeClicks: growthEvents.filter((event) =>
        ["upgrade_cta_click", "results_unlock_cta_clicked", "plan_status_card_click"].includes(event.event_type),
      ).length,
      revenue: resultRows<RevenueRow>(revenueResult).map((row) => ({
        currency: row.currency || "USD",
        amountMinor: numberValue(row.amount_minor),
        payments: numberValue(row.payments),
      })),
    },
    jobs: {
      searchQueued: numberValue(jobs?.search_queued),
      searchRunning: numberValue(jobs?.search_running),
      searchFailed: numberValue(jobs?.search_failed),
      evidenceQueued: numberValue(jobs?.evidence_queued),
      evidenceRunning: numberValue(jobs?.evidence_running),
      evidenceFailed: numberValue(jobs?.evidence_failed),
      stale: numberValue(jobs?.stale),
    },
    index: {
      totalProfiles: numberValue(profileIndex?.total_profiles),
      readyProfiles: numberValue(profileIndex?.ready_profiles),
      pendingProfiles: numberValue(profileIndex?.pending_profiles),
      failedProfiles: numberValue(profileIndex?.failed_profiles),
    },
    searchStatuses: resultRows<StatusRow>(statusResult).map((row) => ({
      status: row.status,
      count: numberValue(row.count),
    })),
    recentSearches: resultRows<RecentSearchRow>(recentResult).map((row) => ({
      id: row.id,
      title: row.title || "未命名岗位",
      status: row.status,
      candidateCount: numberValue(row.candidate_count),
      durationMinutes: row.duration_minutes == null ? null : numberValue(row.duration_minutes),
      createdAt: new Date(row.created_at).toISOString(),
      error: row.error_message,
    })),
  };
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
  const [ipAttribution, betaInvites, operations] = await Promise.all([
    lookupIpAttributions(records),
    getBetaInviteSummary(start, end),
    getOperationsSnapshot(start, end, records),
  ]);
  const data = buildOpsConversionData(records, {
    range,
    start,
    end,
    ipAttribution,
    betaInvites,
    operations,
  });

  return NextResponse.json(data);
}
