import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function getUser(req: NextRequest) {
  const token = getUserFromRequest(req);
  if (!token) return null;
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  return user;
}

/** GET /api/settings — returns user settings (PDL key masked) */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("hirelix_user_settings")
    .select("pdl_api_key")
    .eq("user_id", user.id)
    .single();

  const hasKey = !!(data?.pdl_api_key);
  const masked = hasKey
    ? data.pdl_api_key.slice(0, 6) + "..." + data.pdl_api_key.slice(-4)
    : null;

  return NextResponse.json({ has_pdl_key: hasKey, pdl_api_key_masked: masked });
}

/** POST /api/settings — save user settings */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pdl_api_key } = await req.json();

  if (pdl_api_key !== undefined) {
    const keyValue = typeof pdl_api_key === "string" && pdl_api_key.trim().length > 0
      ? pdl_api_key.trim()
      : null;

    const { error } = await supabaseAdmin
      .from("hirelix_user_settings")
      .upsert(
        { user_id: user.id, pdl_api_key: keyValue, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("Save settings error:", error);
      return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
