import { NextRequest, NextResponse } from "next/server";
import { isInternalApiAuthorizationValid } from "@/lib/internal-api-secret";
import { processNextPublicEvidenceJob } from "@/lib/public-evidence-jobs";

export const maxDuration = 300;

function isAuthorized(req: NextRequest) {
  return isInternalApiAuthorizationValid(req.headers.get("authorization"));
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let candidateId: string | null = null;
  try {
    const body = await req.json();
    candidateId = typeof body?.candidateId === "string" ? body.candidateId : null;
  } catch {
    candidateId = null;
  }

  const result = await processNextPublicEvidenceJob(candidateId);
  return NextResponse.json(result);
}
