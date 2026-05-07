import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_searches,
  hirelix_usage_events,
} from "@/db/schema";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import {
  enqueueSearchJob,
  kickSearchJobRunner,
  resolveSearchJobRunnerBaseUrl,
} from "@/lib/search";
import {
  getInitialSearchTargets,
  normalizeSearchPlanCode,
} from "@/lib/search-execution";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { buildParsedRequirementsForLaunch } from "@/lib/jd-parse";

export const maxDuration = 30;
const DEFAULT_OUTREACH_POOL_TARGET = 20;

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let createdSearchId: string | null = null;

  try {
    const { jd_text, candidate_count, parsed_requirements_override, user_clarification } = await req.json();
    const billing = await getBillingSummaryForUser(user.id);
    const planCode = normalizeSearchPlanCode(billing.plan.code);
    const searchTargets = getInitialSearchTargets(planCode);
    const requestedCandidates = Math.min(
      Math.max(Number(candidate_count) || searchTargets.highlightCount, 1),
      searchTargets.candidateCount,
    );
    const maxCandidates = searchTargets.candidateCount;

    if (billing.usage.searchesRemaining <= 0) {
      return NextResponse.json(
        {
          error:
            billing.plan.code === "free"
              ? "You have used your free shortlists for this month. Upgrade to keep sourcing with more searches, contact details, export, and outreach execution."
              : "You have reached this month's search limit. Add a Search Pack or wait for your next billing cycle.",
        },
        { status: 403 },
      );
    }

    if (!jd_text || typeof jd_text !== "string" || jd_text.trim().length < 50) {
      return NextResponse.json(
        { error: "Job description is too short (min 50 chars)" },
        { status: 400 },
      );
    }

    const timestamp = new Date().toISOString();
    const baseOverride =
      parsed_requirements_override && typeof parsed_requirements_override === "object"
        ? (parsed_requirements_override as Record<string, unknown>)
        : null;
    const overrideWithClarification =
      baseOverride && user_clarification && typeof user_clarification === "string"
        ? { ...baseOverride, user_clarification: user_clarification.trim() }
        : baseOverride;

    const parsedRequirements: Record<string, unknown> =
      overrideWithClarification
        ? buildParsedRequirementsForLaunch(
          overrideWithClarification,
          jd_text.trim(),
          {
            candidateCount: maxCandidates,
            displayCount: searchTargets.displayCount,
            highlightCount: searchTargets.highlightCount,
            requestedCandidateCount: requestedCandidates,
            outreachPoolTarget: DEFAULT_OUTREACH_POOL_TARGET,
            planCode,
            executionProfile: searchTargets.executionProfile,
          },
        )
        : {
          search_started_at: timestamp,
          candidate_count: maxCandidates,
          display_count: searchTargets.displayCount,
          highlight_count: searchTargets.highlightCount,
          requested_candidate_count: requestedCandidates,
          outreach_pool_target: DEFAULT_OUTREACH_POOL_TARGET,
          plan_code: planCode,
          launch_mode: "tech_recruiter_mvp",
          launch_scope: "linkedin_plus_github",
          execution_profile: searchTargets.executionProfile,
          activation_run: false,
          search_phase: "mvp_focus",
        };
    let search: { id: string } | undefined;
    try {
      const ts = new Date(timestamp);
      const inserted = await db
        .insert(hirelix_searches)
        .values({
          user_id: user.id,
          title:
            typeof parsedRequirements.title === "string" && parsedRequirements.title.trim().length > 0
              ? parsedRequirements.title.trim()
              : null,
          jd_text: jd_text.trim(),
          status: "queued",
          pipeline_step: "queued",
          error_message: null,
          warning_message: null,
          parsed_requirements: parsedRequirements,
          queued_at: ts,
          parse_completed_at:
            parsed_requirements_override && typeof parsed_requirements_override === "object"
              ? ts
              : null,
          search_completed_at: null,
          partial_ready_at: null,
          done_at: null,
        })
        .returning({ id: hirelix_searches.id });
      search = inserted[0];
    } catch (insertErr) {
      console.error("Insert search error:", insertErr);
      return NextResponse.json(
        { error: "Failed to create search" },
        { status: 500 },
      );
    }

    if (!search) {
      return NextResponse.json(
        { error: "Failed to create search" },
        { status: 500 },
      );
    }

    createdSearchId = search.id;

    await enqueueSearchJob({
      searchId: search.id,
      userId: user.id,
      jdText: jd_text.trim(),
      candidateCount: maxCandidates,
    });
    kickSearchJobRunner(resolveSearchJobRunnerBaseUrl(req.nextUrl.origin), {
      searchId: search.id,
    });

    try {
      await db.insert(hirelix_usage_events).values({
        user_id: user.id,
        event_type: "search_created",
        related_id: search.id,
        metadata: {
          plan_code: billing.plan.code,
          candidate_count: maxCandidates,
          display_count: searchTargets.displayCount,
          highlight_count: searchTargets.highlightCount,
          requested_candidate_count: requestedCandidates,
          outreach_pool_target: DEFAULT_OUTREACH_POOL_TARGET,
          launch_mode: "tech_recruiter_mvp",
          launch_scope: "linkedin_plus_github",
          execution_profile: searchTargets.executionProfile,
          activation_run: false,
        },
      });
    } catch (usageError) {
      console.error("Search usage event error:", usageError);
    }

    return NextResponse.json({ id: search.id });
  } catch (err) {
    console.error("Search create error:", err);
    if (createdSearchId) {
      await db
        .update(hirelix_searches)
        .set({
          status: "error",
          pipeline_step: "error",
          error_message: "Failed to enqueue search job",
          warning_message: null,
          updated_at: new Date(),
        })
        .where(eq(hirelix_searches.id, createdSearchId));
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
