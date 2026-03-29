import { NextRequest, NextResponse } from "next/server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAIL ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
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

// GET /api/admin — 全量统计数据
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [
    { data: userSettings },
    { count: totalUsers },
    { data: usageThisMonth },
    { data: recentSearches },
    { data: recentErrors },
    { data: schedulerJobs },
  ] = await Promise.all([
    // 订阅计划分布
    supabaseAdmin
      .from("hirelix_user_settings")
      .select("subscription_plan, subscription_status, created_at"),

    // 总用户数（auth.users）
    supabaseAdmin.from("hirelix_user_settings").select("*", { count: "exact", head: true }),

    // 本月使用事件
    supabaseAdmin
      .from("hirelix_usage_events")
      .select("user_id, event_type, created_at")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd),

    // 最近 20 条搜索
    supabaseAdmin
      .from("hirelix_searches")
      .select("id, user_id, title, status, pipeline_step, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(20),

    // 最近失败的搜索
    supabaseAdmin
      .from("hirelix_searches")
      .select("id, user_id, title, error_message, created_at")
      .eq("status", "error")
      .order("created_at", { ascending: false })
      .limit(10),

    // 调度器任务队列状态
    supabaseAdmin
      .from("hirelix_search_jobs")
      .select("status, attempt_count, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // 统计计划分布
  const planDist: Record<string, number> = {};
  for (const s of userSettings ?? []) {
    const key = `${s.subscription_plan ?? "free"}/${s.subscription_status ?? "none"}`;
    planDist[key] = (planDist[key] ?? 0) + 1;
  }

  // 本月搜索数 / 丰富化数
  const searchesThisMonth = (usageThisMonth ?? []).filter(
    (e) => e.event_type === "search_created",
  ).length;
  const enrichesThisMonth = (usageThisMonth ?? []).filter(
    (e) => e.event_type === "candidate_enriched",
  ).length;

  // 活跃用户（本月有任意使用事件）
  const activeUserIds = new Set((usageThisMonth ?? []).map((e) => e.user_id));

  // 调度器健康
  const jobStatusDist: Record<string, number> = {};
  for (const j of schedulerJobs ?? []) {
    jobStatusDist[j.status] = (jobStatusDist[j.status] ?? 0) + 1;
  }

  return NextResponse.json({
    overview: {
      totalUsers: totalUsers ?? 0,
      proUsers: (userSettings ?? []).filter(
        (s) =>
          (s.subscription_plan === "pro_monthly" ||
            s.subscription_plan === "pro_annual") &&
          s.subscription_status === "active",
      ).length,
      activeUsersThisMonth: activeUserIds.size,
      searchesThisMonth,
      enrichesThisMonth,
    },
    planDistribution: planDist,
    recentSearches: recentSearches ?? [],
    recentErrors: recentErrors ?? [],
    schedulerHealth: jobStatusDist,
  });
}
