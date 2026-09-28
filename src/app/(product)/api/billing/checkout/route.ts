import { NextRequest, NextResponse } from "next/server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { isAgentPlan } from "@/lib/agent-plan";
import { getCheckoutConfig } from "@/lib/billing";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Sign in to subscribe." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || !isAgentPlan(body.plan)) return NextResponse.json({ error: "Choose a valid Agent plan." }, { status: 400 });
  const config = getCheckoutConfig();
  const priceId = body.plan === "agent_monthly" ? config.agentMonthlyPriceId : config.agentAnnualPriceId;
  if (!config.enabled || !priceId) return NextResponse.json({ error: "Subscriptions are not available yet. Please contact support@hirelix.online." }, { status: 503 });
  const subscriptions = await db.execute(sql`SELECT paddle_subscription_id FROM hirelix_user_settings WHERE user_id=${user.id}::uuid AND paddle_subscription_id IS NOT NULL AND subscription_status IN ('active','trialing','past_due','paused')`);
  if (subscriptions.length) return NextResponse.json({ error: "You already have a subscription. Manage your existing subscription or contact support before changing plans." }, { status: 409 });
  // Paddle.js owns payment collection; the signed webhook alone grants access.
  return NextResponse.json({ priceId, customer: { email: user.email }, customData: { user_id: user.id, purchase_type: body.plan } });
}
