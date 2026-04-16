import { NextRequest, NextResponse } from "next/server";
import { processNextSearchJob } from "@/lib/search";

export const maxDuration = 300;

function isAuthorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let searchId: string | null = null;
  try {
    const body = await req.json();
    searchId = typeof body?.searchId === "string" ? body.searchId : null;
  } catch {
    searchId = null;
  }

  const result = await processNextSearchJob(searchId);

  return NextResponse.json(result);
}
