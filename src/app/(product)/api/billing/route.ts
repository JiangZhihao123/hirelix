import { NextRequest, NextResponse } from "next/server";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const billing = await getBillingSummaryForUser(supabaseAdmin, user.id);
  return NextResponse.json({ billing });
}
