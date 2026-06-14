import { NextRequest, NextResponse } from "next/server";
import { isInternalApiAuthorizationValid } from "@/lib/internal-api-secret";
import { processNextSearchJob } from "@/lib/search";

export const maxDuration = 300;

function isAuthorized(req: NextRequest) {
  return isInternalApiAuthorizationValid(req.headers.get("authorization"));
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
