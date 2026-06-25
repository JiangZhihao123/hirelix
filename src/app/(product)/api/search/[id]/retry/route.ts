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
import { DEFAULT_SEARCH_PROFILE_SCAN_BATCH_LIMIT } from "@/lib/search-execution";
import { buildRetryParsedRequirements } from "@/lib/search-retry";

export const maxDuration = 30;

function positiveInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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

  const parsedRequirements = readRecord(search.parsed_requirements);
  const displayStats = readRecord(parsedRequirements?.display_stats);
  const recallMetadata = readRecord(parsedRequirements?.recall_metadata);
  const candidateCount =
    positiveInt(parsedRequirements?.profile_scan_budget) ??
    positiveInt(displayStats?.bright_profiles_requested) ??
    positiveInt(recallMetadata?.bright_profiles_requested) ??
    positiveInt(parsedRequirements?.candidate_count) ??
    DEFAULT_SEARCH_PROFILE_SCAN_BATCH_LIMIT;

  await enqueueSearchJob({
    searchId: id,
    userId: user.id,
    jdText: search.jd_text,
    candidateCount,
  });

  const ts = new Date();
  const nextParsedRequirements = buildRetryParsedRequirements(parsedRequirements);
  await db
    .update(hirelix_searches)
    .set({
      status: "queued",
      pipeline_step: "queued",
      error_message: null,
      queued_at: ts,
      search_completed_at: null,
      partial_ready_at: null,
      done_at: null,
      parsed_requirements: nextParsedRequirements,
      updated_at: ts,
    })
    .where(eq(hirelix_searches.id, id));

  kickSearchJobRunner(resolveSearchJobRunnerBaseUrl(req.nextUrl.origin), {
    searchId: id,
  });

  return NextResponse.json({ ok: true });
}
