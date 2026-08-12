import { NextRequest, NextResponse } from "next/server";

import { getUserFromApiRequest } from "@/lib/api-auth";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { errorLogFields, getLogger } from "@/lib/logger";
import { getRedemptionErrorMessage, redeemStarterCode } from "@/lib/redemption-server";

const routeLogger = getLogger({ component: "api_billing_redeem" });

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => null) as { code?: unknown } | null;
    const result = await redeemStarterCode({
      code: body?.code,
      userId: user.id,
      userEmail: user.email,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: getRedemptionErrorMessage(result.reason), reason: result.reason },
        { status: result.reason === "invalid_code" ? 400 : 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      endsAt: result.endsAt.toISOString(),
      billing: await getBillingSummaryForUser(user.id),
    });
  } catch (error) {
    routeLogger.error({ user_id: user.id, ...errorLogFields(error) }, "Failed to redeem beta code");
    return NextResponse.json({ error: "Unable to redeem this beta code." }, { status: 500 });
  }
}
