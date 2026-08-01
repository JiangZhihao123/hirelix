import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { hirelix_growth_landing_events } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expected = process.env.OPS_DASHBOARD_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || body.event_type !== "email_sent" || typeof body.email_id !== "string" || !/^[a-z][a-z0-9_-]+_20\d{6,8}$/i.test(body.email_id)) {
    return NextResponse.json({ error: "Invalid email event" }, { status: 400 });
  }

  await db.insert(hirelix_growth_landing_events).values({
    event_type: "email_sent",
    email_id: body.email_id,
    batch_id: typeof body.batch_id === "string" ? body.batch_id.slice(0, 120) : null,
    recipient: typeof body.recipient === "string" ? body.recipient.slice(0, 320) : null,
    company: typeof body.company === "string" ? body.company.slice(0, 200) : null,
    page_url: typeof body.pixel_url === "string" ? body.pixel_url.slice(0, 500) : null,
    metadata: {
      provider: typeof body.provider === "string" ? body.provider : "unknown",
      message_id: typeof body.message_id === "string" ? body.message_id : null,
      subject: typeof body.subject === "string" ? body.subject.slice(0, 300) : null,
    },
  });

  return NextResponse.json({ ok: true });
}
