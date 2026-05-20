import { NextRequest, NextResponse } from "next/server";
import { isRunningSearchStatus } from "@/lib/search-state";
import {
  enqueueSearchJob,
  kickSearchJobRunner,
  resolveSearchJobRunnerBaseUrl,
} from "@/lib/search";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_searches, hirelix_snapshot_profiles } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { toJsonbSafeRecord } from "@/lib/jsonb-safe";

export const maxDuration = 30;

const RERUN_MODE = "snapshot_profile_cache";

function getSnapshotRefs(parsedRequirements: Record<string, unknown> | null) {
  const metadata =
    parsedRequirements?.recall_metadata &&
    typeof parsedRequirements.recall_metadata === "object"
      ? parsedRequirements.recall_metadata as Record<string, unknown>
      : null;
  const standardSnapshotId =
    typeof metadata?.snapshot_id === "string" && metadata.snapshot_id
      ? metadata.snapshot_id
      : null;
  const additionalSnapshots = Array.isArray(metadata?.additional_snapshots)
    ? metadata.additional_snapshots
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const snapshot = entry as Record<string, unknown>;
        const round = typeof snapshot.round === "string" ? snapshot.round : null;
        const snapshotId = typeof snapshot.snapshot_id === "string" ? snapshot.snapshot_id : null;
        return round && snapshotId ? { round, snapshotId } : null;
      })
      .filter((entry): entry is { round: string; snapshotId: string } => Boolean(entry))
    : [];

  return standardSnapshotId
    ? [{ round: "standard", snapshotId: standardSnapshotId }, ...additionalSnapshots]
    : [];
}

async function countSnapshotProfileRows(snapshotId: string, sourceRound: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hirelix_snapshot_profiles)
    .where(
      and(
        eq(hirelix_snapshot_profiles.snapshot_id, snapshotId),
        eq(hirelix_snapshot_profiles.source_round, sourceRound),
      ),
    );
  return rows[0]?.count ?? 0;
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

  if (isRunningSearchStatus(search.status)) {
    return NextResponse.json(
      { error: "This shortlist is already running" },
      { status: 409 },
    );
  }

  const parsedRequirements =
    search.parsed_requirements && typeof search.parsed_requirements === "object"
      ? search.parsed_requirements as Record<string, unknown>
      : null;
  const snapshotRefs = getSnapshotRefs(parsedRequirements);
  if (snapshotRefs.length === 0) {
    return NextResponse.json(
      { error: "This shortlist has no reusable snapshot cache yet" },
      { status: 409 },
    );
  }

  const missingRounds: string[] = [];
  for (const ref of snapshotRefs) {
    const rowCount = await countSnapshotProfileRows(ref.snapshotId, ref.round);
    if (rowCount <= 0) {
      missingRounds.push(`${ref.round}:${ref.snapshotId}`);
    }
  }
  if (missingRounds.length > 0) {
    return NextResponse.json(
      {
        error: "This shortlist is missing cached snapshot profiles",
        missing_rounds: missingRounds,
      },
      { status: 409 },
    );
  }

  const candidateCount =
    typeof parsedRequirements?.candidate_count === "number"
      ? parsedRequirements.candidate_count
      : 5;
  const timestamp = new Date().toISOString();
  const nextParsedRequirements = toJsonbSafeRecord({
    ...(parsedRequirements ?? {}),
    rerun_mode: RERUN_MODE,
    rerun_requested_at: timestamp,
    rerun_snapshot_ids: snapshotRefs.map((ref) => ref.snapshotId),
    display_stats: {
      ...(
        parsedRequirements?.display_stats && typeof parsedRequirements.display_stats === "object"
          ? parsedRequirements.display_stats as Record<string, unknown>
          : {}
      ),
      deep_review_count: 0,
      deep_review_requested_count: 0,
      deep_review_completed_count: 0,
      visible_candidate_count: 0,
    },
  });

  await enqueueSearchJob({
    searchId: id,
    userId: user.id,
    jdText: search.jd_text,
    candidateCount,
  });

  const ts = new Date(timestamp);
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
      parsed_requirements: nextParsedRequirements,
      updated_at: ts,
    })
    .where(eq(hirelix_searches.id, id));

  kickSearchJobRunner(resolveSearchJobRunnerBaseUrl(req.nextUrl.origin), {
    searchId: id,
  });

  return NextResponse.json({
    ok: true,
    mode: RERUN_MODE,
    snapshot_ids: snapshotRefs.map((ref) => ref.snapshotId),
  });
}
