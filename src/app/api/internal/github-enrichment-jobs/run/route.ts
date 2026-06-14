import { NextRequest, NextResponse } from "next/server";
import { isInternalApiAuthorizationValid } from "@/lib/internal-api-secret";

export const maxDuration = 300;

function isAuthorized(req: NextRequest) {
  return isInternalApiAuthorizationValid(req.headers.get("authorization"));
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      processed: false,
      hasMore: false,
      disabled: true,
      replacement: "/api/internal/public-evidence-jobs/run",
    },
    { status: 410 },
  );
}
