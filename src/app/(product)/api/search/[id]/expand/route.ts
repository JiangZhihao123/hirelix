import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_searches, hirelix_usage_events } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { toJsonbSafeRecord } from "@/lib/jsonb-safe";
import { getLogger, errorLogFields } from "@/lib/logger";
import {
  enqueueSearchJob,
  kickSearchJobRunner,
  resolveSearchJobRunnerBaseUrl,
} from "@/lib/search";
import { updateSearchUsageEventMetadata } from "@/lib/search/persistence";
import {
  DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT,
  FINAL_SHORTLIST_TARGET,
  normalizeSearchPlanCode,
  resolveExpandedProfileScanBudget,
} from "@/lib/search-execution";
import { isReviewableSearchStatus, isRunningSearchStatus } from "@/lib/search-state";

export const maxDuration = 30;

const routeLogger = getLogger({ component: "api_search_expand" });

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

async function ensureSearchUsageEvent(input: {
  userId: string;
  searchId: string;
  metadata: Record<string, unknown>;
}) {
  const existingRows = await db
    .select({ id: hirelix_usage_events.id })
    .from(hirelix_usage_events)
    .where(
      and(
        eq(hirelix_usage_events.related_id, input.searchId),
        eq(hirelix_usage_events.event_type, "search_created"),
      ),
    )
    .limit(1);

  if (existingRows[0]?.id) {
    await updateSearchUsageEventMetadata(input.searchId, input.metadata);
    return;
  }

  await db.insert(hirelix_usage_events).values({
    user_id: input.userId,
    event_type: "search_created",
    related_id: input.searchId,
    metadata: toJsonbSafeRecord(input.metadata),
  });
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

  try {
    const searchRows = await db
      .select({
        id: hirelix_searches.id,
        user_id: hirelix_searches.user_id,
        jd_text: hirelix_searches.jd_text,
        parsed_requirements: hirelix_searches.parsed_requirements,
        status: hirelix_searches.status,
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
        { error: "This candidate pool is already running." },
        { status: 409 },
      );
    }
    if (!isReviewableSearchStatus(search.status)) {
      return NextResponse.json(
        { error: "This candidate pool is not ready to expand yet." },
        { status: 409 },
      );
    }

    const billing = await getBillingSummaryForUser(user.id);
    const planCode = normalizeSearchPlanCode(billing.plan.code);
    if (planCode === "free") {
      return NextResponse.json(
        { error: "Start a subscription to expand this candidate pool." },
        { status: 403 },
      );
    }

    const parsedRequirements = readRecord(search.parsed_requirements) ?? {};
    const displayStats = readRecord(parsedRequirements.display_stats);
    const recallMetadata = readRecord(parsedRequirements.recall_metadata);
    const currentBudget =
      positiveInt(parsedRequirements.profile_scan_budget) ??
      positiveInt(displayStats?.bright_profiles_requested) ??
      positiveInt(recallMetadata?.bright_profiles_requested) ??
      DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT;
    const returnedProfileCount =
      positiveInt(displayStats?.bright_profiles_returned) ??
      positiveInt(recallMetadata?.bright_profiles_returned);
    const expansion = resolveExpandedProfileScanBudget({
      currentBudget,
      remainingScans: billing.usage.profileScansRemaining,
      returnedProfiles: returnedProfileCount,
    });

    if (expansion.additionalBudget <= 0) {
      return NextResponse.json(
        { error: "No targeted profile scans left this cycle." },
        { status: 403 },
      );
    }
    const timestamp = new Date().toISOString();
    const currentExpansionCount = positiveInt(parsedRequirements.expansion_count) ?? 0;
    const nextDisplayStats = toJsonbSafeRecord({
      ...(displayStats ?? {}),
      bright_profile_budget: expansion.nextBudget,
      bright_profiles_requested: expansion.nextBudget,
      deep_review_count: 0,
      deep_review_requested_count: 0,
      deep_review_completed_count: 0,
      visible_candidate_count: 0,
      expansion_requested_at: timestamp,
      expansion_previous_profile_scan_budget: expansion.currentBudget,
      expansion_additional_profile_scans: expansion.additionalBudget,
    });
    const nextParsedRequirements = toJsonbSafeRecord({
      ...parsedRequirements,
      plan_code: planCode,
      candidate_count: FINAL_SHORTLIST_TARGET,
      display_count: FINAL_SHORTLIST_TARGET,
      requested_candidate_count: FINAL_SHORTLIST_TARGET,
      profile_scan_budget: expansion.nextBudget,
      expand_recall_mode: "fresh_snapshot",
      expansion_requested_at: timestamp,
      expansion_count: currentExpansionCount + 1,
      expansion_previous_profile_scan_budget: expansion.currentBudget,
      expansion_additional_profile_scans: expansion.additionalBudget,
      display_stats: nextDisplayStats,
    });

    const ts = new Date(timestamp);
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

    await ensureSearchUsageEvent({
      userId: user.id,
      searchId: id,
      metadata: {
        plan_code: billing.plan.code,
        candidate_count: FINAL_SHORTLIST_TARGET,
        display_count: FINAL_SHORTLIST_TARGET,
        requested_candidate_count: FINAL_SHORTLIST_TARGET,
        profile_scan_budget: expansion.nextBudget,
        profile_scans_reserved: expansion.nextBudget,
        profile_scans_used: returnedProfileCount ?? 0,
        profile_scans_billing_status: "reserved_for_expand",
        expansion_count: currentExpansionCount + 1,
        expansion_previous_profile_scan_budget: expansion.currentBudget,
        expansion_additional_profile_scans: expansion.additionalBudget,
      },
    });

    await enqueueSearchJob({
      searchId: id,
      userId: user.id,
      jdText: search.jd_text,
      candidateCount: FINAL_SHORTLIST_TARGET,
    });

    kickSearchJobRunner(resolveSearchJobRunnerBaseUrl(req.nextUrl.origin), {
      searchId: id,
    });

    return NextResponse.json({
      ok: true,
      profile_scan_budget: expansion.nextBudget,
      added_profile_scan_budget: expansion.additionalBudget,
      profile_scans_remaining_after_reservation: Math.max(
        0,
        billing.usage.profileScansRemaining - expansion.additionalBudget,
      ),
    });
  } catch (error) {
    routeLogger.error(
      {
        user_id: user.id,
        search_id: id,
        ...errorLogFields(error),
      },
      "Failed to expand search candidate pool",
    );
    return NextResponse.json(
      { error: "Could not expand this candidate pool." },
      { status: 500 },
    );
  }
}
