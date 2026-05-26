import { and, desc, gte, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { hirelix_growth_landing_events } from "@/db/schema";
import {
  buildOpsConversionData,
  getOpsRangeWindow,
  normalizeOpsRange,
  type GrowthEventRecord,
} from "@/lib/ops-conversion";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = process.env.OPS_DASHBOARD_SECRET;
  if (!secret) return false;
  return req.nextUrl.searchParams.get("secret") === secret;
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

  const data = buildOpsConversionData(rows as GrowthEventRecord[], {
    range,
    start,
    end,
  });

  return NextResponse.json(data);
}
