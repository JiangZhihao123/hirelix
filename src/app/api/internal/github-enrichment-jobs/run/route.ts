import { NextRequest, NextResponse } from "next/server";
import { processNextGithubEnrichmentJob } from "@/lib/github-enrichment-jobs";

export const maxDuration = 300;

function isAuthorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
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

  const result = await processNextGithubEnrichmentJob(candidateId);

  return NextResponse.json(result);
}
