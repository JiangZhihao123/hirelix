import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_user_settings } from "@/db/schema";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { getLogger, errorLogFields } from "@/lib/logger";

/** GET /api/settings — returns user settings */
const routeLogger = getLogger({ component: "api_settings" });

export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settingsRows, billing] = await Promise.all([
    db
      .select({ company_profile: hirelix_user_settings.company_profile })
      .from(hirelix_user_settings)
      .where(eq(hirelix_user_settings.user_id, user.id))
      .limit(1),
    getBillingSummaryForUser(user.id),
  ]);
  const data = settingsRows[0];

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
  const ts = new Date();
  const baseValues = {
    user_id: user.id,
    updated_at: ts,
    ...(body.company_profile !== undefined ? { company_profile: body.company_profile } : {}),
  };

  const setOnConflict: Record<string, unknown> = { updated_at: ts };
  if (body.company_profile !== undefined) {
    setOnConflict.company_profile = body.company_profile;
  }

  try {
    await db
      .insert(hirelix_user_settings)
      .values(baseValues)
      .onConflictDoUpdate({
        target: hirelix_user_settings.user_id,
        set: setOnConflict,
      });
  } catch (error) {
    routeLogger.error(
      {
        user_id: user.id,
        ...errorLogFields(error),
      },
      "Failed to save settings",
    );
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
