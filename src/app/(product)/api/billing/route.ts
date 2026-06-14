import { NextRequest, NextResponse } from "next/server";
import {
  createBillingPortalSessionForUser,
  getBillingSummaryForUser,
} from "@/lib/billing-server";
import { getUserFromApiRequest } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const billing = await getBillingSummaryForUser(user.id);
  return NextResponse.json({ billing });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await createBillingPortalSessionForUser(user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    portalUrl: result.portalUrl,
    cancelUrl: result.cancelUrl,
    updatePaymentMethodUrl: result.updatePaymentMethodUrl,
  });
}
