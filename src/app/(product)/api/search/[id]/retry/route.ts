import { NextRequest, NextResponse } from "next/server";
import { isStaleProcessingSearch } from "@/lib/search-state";
import {
  enqueueSearchJob,
  kickSearchJobRunner,
  resolveSearchJobRunnerBaseUrl,
} from "@/lib/search";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_searches } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchRows = await db
    .select({
      id: hirelix_searches.id,
      user_id: hirelix_searches.user_id,
      jd_text: hirelix_searches.jd_text,
      parsed_requirements: hirelix_searches.parsed_requirements,
      status: hirelix_searches.status,
      updated_at: hirelix_searches.updated_at,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, id))
    .limit(1);
  const search = searchRows[0];

  if (!search || search.user_id !== user.id) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  const canRetry =
    search.status === "error" ||
    search.status === "degraded" ||
    isStaleProcessingSearch(
      search.status,
      search.updated_at?.toISOString() ?? null,
    );

  if (!canRetry) {
    return NextResponse.json(
      { error: "Only failed or stalled searches can be retried" },
      { status: 400 },
    );
  }

  const candidateCount =
    ((search.parsed_requirements as Record<string, unknown>)?.candidate_count as number) || 5;

  await enqueueSearchJob({
    searchId: id,
    userId: user.id,
    jdText: search.jd_text,
    candidateCount,
  });

  const ts = new Date();
  await db
    .update(hirelix_searches)
    .set({
      status: "queued",
      pipeline_step: "queued",
      error_message: null,
      warning_message: null,
      queued_at: ts,
      search_completed_at: null,
      partial_ready_at: null,
      done_at: null,
      updated_at: ts,
    })
    .where(eq(hirelix_searches.id, id));

  kickSearchJobRunner(resolveSearchJobRunnerBaseUrl(req.nextUrl.origin), {
    searchId: id,
  });

  return NextResponse.json({ ok: true });
}
