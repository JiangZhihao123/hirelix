import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_growth_landing_events,
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
  FINAL_SHORTLIST_TARGET,
  getInitialSearchTargets,
  normalizeSearchPlanCode,
} from "@/lib/search-execution";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  getInviteCodeFromRequest,
  getRequestMeta,
  markInviteSearchCreated,
} from "@/lib/beta-invites";
import { buildParsedRequirementsForLaunch } from "@/lib/jd-parse";
import { toJsonbSafeRecord } from "@/lib/jsonb-safe";
import { getLogger, errorLogFields } from "@/lib/logger";
import { PUBLIC_SEARCH_CREATE_ERROR_MESSAGE, PUBLIC_SEARCH_FAILURE_MESSAGE } from "@/lib/public-errors";

export const maxDuration = 30;
const DEFAULT_OUTREACH_POOL_TARGET = FINAL_SHORTLIST_TARGET;
const routeLogger = getLogger({ component: "api_search_create" });

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let createdSearchId: string | null = null;

  try {
    const { jd_text, candidate_count, parsed_requirements_override, user_clarification, growth_tracking } = await req.json();
    const inviteCode = getInviteCodeFromRequest(req, growth_tracking);
    const billing = await getBillingSummaryForUser(user.id);
    const planCode = normalizeSearchPlanCode(billing.plan.code);
    const searchTargets = getInitialSearchTargets(planCode);
    const maxCandidates = FINAL_SHORTLIST_TARGET;
    const requestedCandidates = Math.min(
      Math.max(Number(candidate_count) || maxCandidates, 1),
      maxCandidates,
    );

    if (billing.usage.searchesRemaining <= 0) {
      return NextResponse.json(
        {
          error:
            billing.plan.code === "free"
              ? "You have used your free shortlist. Start a subscription to keep sourcing."
              : "You have reached this month's shortlist limit. Your next cycle will reset automatically.",
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

    const parsedRequirements: Record<string, unknown> = toJsonbSafeRecord(
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
        },
    );
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
      routeLogger.error({ user_id: user.id, ...errorLogFields(insertErr) }, "Failed to insert search");
      return NextResponse.json(
        { error: PUBLIC_SEARCH_CREATE_ERROR_MESSAGE },
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

    const invite = await markInviteSearchCreated({
      inviteCode,
      userId: user.id,
      searchId: search.id,
      request: getRequestMeta(req),
    }).catch((inviteError) => {
      routeLogger.error(
        {
          user_id: user.id,
          search_id: search.id,
          ...errorLogFields(inviteError),
        },
        "Failed to mark invite search created",
      );
      return null;
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
          invite_code: invite?.invite_code ?? inviteCode ?? null,
          invite_source: invite?.source ?? null,
          invite_batch_id: invite?.batch_id ?? null,
        },
      });
    } catch (usageError) {
      routeLogger.error(
        {
          user_id: user.id,
          search_id: search.id,
          ...errorLogFields(usageError),
        },
        "Failed to record search usage event",
      );
    }

    if (
      growth_tracking &&
      typeof growth_tracking === "object" &&
      typeof growth_tracking.visitor_id === "string" &&
      typeof growth_tracking.session_id === "string"
    ) {
      try {
        await db.insert(hirelix_growth_landing_events).values({
          event_type: "search_create_success",
          visitor_id: growth_tracking.visitor_id.slice(0, 120),
          session_id: growth_tracking.session_id.slice(0, 120),
          page_url: req.headers.get("referer"),
          referrer: req.headers.get("referer"),
          ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip"),
          user_agent: req.headers.get("user-agent"),
          metadata: {
            candidate_count: maxCandidates,
            invite_code: invite?.invite_code ?? inviteCode ?? null,
            invite_source: invite?.source ?? null,
            invite_batch_id: invite?.batch_id ?? null,
            jd_length_bucket:
              jd_text.trim().length < 50
                ? "1-49"
                : jd_text.trim().length < 200
                  ? "50-199"
                  : jd_text.trim().length < 500
                    ? "200-499"
                    : "500+",
          },
        });
      } catch (growthError) {
        routeLogger.error(
          {
            user_id: user.id,
            search_id: search.id,
            ...errorLogFields(growthError),
          },
          "Failed to record growth search create event",
        );
      }
    }

    return NextResponse.json({ id: search.id });
  } catch (err) {
    routeLogger.error(
      {
        user_id: user.id,
        search_id: createdSearchId,
        ...errorLogFields(err),
      },
      "Failed to create search",
    );
    if (createdSearchId) {
      await db
        .update(hirelix_searches)
        .set({
          status: "error",
          pipeline_step: "error",
          error_message: PUBLIC_SEARCH_FAILURE_MESSAGE,
          updated_at: new Date(),
        })
        .where(eq(hirelix_searches.id, createdSearchId));
    }
    return NextResponse.json(
      { error: PUBLIC_SEARCH_CREATE_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}
