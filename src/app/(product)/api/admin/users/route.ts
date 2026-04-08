import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../route";
import { supabaseAdmin } from "@/lib/supabase-server";

// GET /api/admin/users — 用户列表（含本月使用量）
export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [{ data: settings }, { data: usageEvents }] = await Promise.all([
    supabaseAdmin
      .from("hirelix_user_settings")
      .select(
        "user_id, subscription_plan, subscription_status, subscription_renews_at, extra_search_credits, extra_enrich_credits, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),

    supabaseAdmin
      .from("hirelix_usage_events")
      .select("user_id, event_type")
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd),
  ]);

  if (!settings) return NextResponse.json({ users: [] });

  // 按用户统计本月使用
  const usageByUser: Record<string, { searches: number; enriches: number }> = {};
  for (const e of usageEvents ?? []) {
    if (!usageByUser[e.user_id]) usageByUser[e.user_id] = { searches: 0, enriches: 0 };
    if (e.event_type === "search_created") usageByUser[e.user_id].searches++;
    if (e.event_type === "candidate_enriched") usageByUser[e.user_id].enriches++;
  }

  // 从 auth.users 批量获取邮箱
  const userIds = settings.map((s) => s.user_id);
  const emailMap: Record<string, string> = {};

  // Supabase admin API 批量获取用户（每次最多50个）
  for (let i = 0; i < userIds.length; i += 50) {
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 50,
      page: Math.floor(i / 50) + 1,
    });
    for (const u of authUsers?.users ?? []) {
      if (u.email) emailMap[u.id] = u.email;
    }
  }

  const users = settings.map((s) => ({
    userId: s.user_id,
    email: emailMap[s.user_id] ?? "(unknown)",
    plan: s.subscription_plan ?? "free",
    status: s.subscription_status ?? "none",
    renewsAt: s.subscription_renews_at,
    extraSearchCredits: s.extra_search_credits ?? 0,
    extraEnrichCredits: s.extra_enrich_credits ?? 0,
    joinedAt: s.created_at,
    usage: usageByUser[s.user_id] ?? { searches: 0, enriches: 0 },
  }));

  return NextResponse.json({ users });
}

// PATCH /api/admin/users — 手动调整用户配额
export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const { userId, extraSearchCredits, extraEnrichCredits } = body as {
    userId: string;
    extraSearchCredits?: number;
    extraEnrichCredits?: number;
  };

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const update: Record<string, number> = {};
  if (typeof extraSearchCredits === "number") update.extra_search_credits = extraSearchCredits;
  if (typeof extraEnrichCredits === "number") update.extra_enrich_credits = extraEnrichCredits;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("hirelix_user_settings")
    .update(update)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
