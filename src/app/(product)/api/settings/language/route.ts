import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { hirelix_user_settings } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { isLocale } from "@/lib/locale";

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [settings] = await db
    .select({ ui_locale: hirelix_user_settings.ui_locale })
    .from(hirelix_user_settings)
    .where(eq(hirelix_user_settings.user_id, user.id))
    .limit(1);
  return NextResponse.json({ ui_locale: settings?.ui_locale || "en" });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => null);
  if (!isLocale(input?.ui_locale))
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  await db.insert(hirelix_user_settings)
    .values({ user_id: user.id, ui_locale: input.ui_locale, updated_at: new Date() })
    .onConflictDoUpdate({
      target: hirelix_user_settings.user_id,
      set: { ui_locale: input.ui_locale, updated_at: new Date() },
    });
  return NextResponse.json({ ui_locale: input.ui_locale });
}
