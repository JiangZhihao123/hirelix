import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_search_jobs,
  hirelix_searches,
  hirelix_usage_events,
  hirelix_user_settings,
} from "@/db/schema";
import { isAdminEmail as matchesAdminEmail } from "@/lib/admin";
import { getUserFromApiRequest } from "@/lib/api-auth";

export function isAdminEmail(email: string | undefined): boolean {
  return matchesAdminEmail(email, process.env.ADMIN_EMAIL);
}

export async function requireAdmin(
  req: NextRequest,
): Promise<{ user: { id: string; email: string } } | NextResponse> {
  const user = await getUserFromApiRequest(req);
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user: { id: user.id, email: user.email! } };
}

export async function HEAD(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  return new NextResponse(null, { status: 204 });
}

// GET /api/admin — 全量统计数据
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [userSettings, totalUsersRows, usageThisMonth, recentSearches, recentErrors, schedulerJobs] =
    await Promise.all([
      db
        .select({
          subscription_plan: hirelix_user_settings.subscription_plan,
          subscription_status: hirelix_user_settings.subscription_status,
          created_at: hirelix_user_settings.created_at,
        })
        .from(hirelix_user_settings),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(hirelix_user_settings),
      db
        .select({
          user_id: hirelix_usage_events.user_id,
          event_type: hirelix_usage_events.event_type,
          created_at: hirelix_usage_events.created_at,
        })
        .from(hirelix_usage_events)
        .where(
          and(
            gte(hirelix_usage_events.created_at, monthStart),
            lt(hirelix_usage_events.created_at, monthEnd),
          ),
        ),
      db
        .select({
          id: hirelix_searches.id,
          user_id: hirelix_searches.user_id,
          title: hirelix_searches.title,
          status: hirelix_searches.status,
          pipeline_step: hirelix_searches.pipeline_step,
          error_message: hirelix_searches.error_message,
          created_at: hirelix_searches.created_at,
        })
        .from(hirelix_searches)
        .orderBy(desc(hirelix_searches.created_at))
        .limit(20),
      db
        .select({
          id: hirelix_searches.id,
          user_id: hirelix_searches.user_id,
          title: hirelix_searches.title,
          error_message: hirelix_searches.error_message,
          created_at: hirelix_searches.created_at,
        })
        .from(hirelix_searches)
        .where(eq(hirelix_searches.status, "error"))
        .orderBy(desc(hirelix_searches.created_at))
        .limit(10),
      db
        .select({
          status: hirelix_search_jobs.status,
          attempt_count: hirelix_search_jobs.attempt_count,
          created_at: hirelix_search_jobs.created_at,
          updated_at: hirelix_search_jobs.updated_at,
        })
        .from(hirelix_search_jobs)
        .orderBy(desc(hirelix_search_jobs.created_at))
        .limit(50),
    ]);

  const totalUsers = totalUsersRows[0]?.count ?? 0;

  const planDist: Record<string, number> = {};
  for (const s of userSettings) {
    const key = `${s.subscription_plan ?? "free"}/${s.subscription_status ?? "none"}`;
    planDist[key] = (planDist[key] ?? 0) + 1;
  }

  const searchesThisMonth = usageThisMonth.filter(
    (e) => e.event_type === "search_created",
  ).length;
  const enrichesThisMonth = usageThisMonth.filter(
    (e) => e.event_type === "candidate_enriched",
  ).length;

  const activeUserIds = new Set(usageThisMonth.map((e) => e.user_id));

  const jobStatusDist: Record<string, number> = {};
  for (const j of schedulerJobs) {
    jobStatusDist[j.status] = (jobStatusDist[j.status] ?? 0) + 1;
  }

  return NextResponse.json({
    overview: {
      totalUsers,
      proUsers: userSettings.filter(
        (s) =>
          (s.subscription_plan === "starter_monthly" ||
            s.subscription_plan === "starter_annual" ||
            s.subscription_plan === "pro_monthly" ||
            s.subscription_plan === "pro_annual" ||
            s.subscription_plan === "business_monthly" ||
            s.subscription_plan === "agency_monthly") &&
          s.subscription_status === "active",
      ).length,
      activeUsersThisMonth: activeUserIds.size,
      searchesThisMonth,
      enrichesThisMonth,
    },
    planDistribution: planDist,
    recentSearches,
    recentErrors,
    schedulerHealth: jobStatusDist,
  });
}
