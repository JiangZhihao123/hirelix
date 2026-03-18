import { NextRequest, NextResponse } from "next/server";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

/** GET /api/settings — returns user settings */
export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data }, billing] = await Promise.all([
    supabaseAdmin
    .from("hirelix_user_settings")
    .select("company_profile")
    .eq("user_id", user.id)
    .maybeSingle(),
    getBillingSummaryForUser(supabaseAdmin, user.id),
  ]);

  return NextResponse.json({
    company_profile: data?.company_profile || null,
    billing,
  });
}

/** POST /api/settings — save user settings */
export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (body.company_profile !== undefined) {
    updates.company_profile = body.company_profile;
  }

  const { error } = await supabaseAdmin
    .from("hirelix_user_settings")
    .upsert(updates, { onConflict: "user_id" });

  if (error) {
    console.error("Save settings error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
