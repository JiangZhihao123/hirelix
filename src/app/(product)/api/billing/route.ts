import { NextRequest, NextResponse } from "next/server";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const billing = await getBillingSummaryForUser(user.id, {
    includeAdminDiagnostics: isAdminEmail(user.email, process.env.ADMIN_EMAIL),
  });
  return NextResponse.json({ billing });
}
