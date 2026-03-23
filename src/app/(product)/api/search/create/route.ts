import { NextRequest, NextResponse } from "next/server";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { enqueueSearchJob } from "@/lib/search-jobs";
import {
  getInitialSearchTargets,
  normalizeSearchPlanCode,
} from "@/lib/search-execution";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export const maxDuration = 30;
const DEFAULT_OUTREACH_POOL_TARGET = 25;

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let createdSearchId: string | null = null;

  try {
    const { jd_text, candidate_count } = await req.json();
    const billing = await getBillingSummaryForUser(supabaseAdmin, user.id);
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
              ? "You have used your 1 free shortlist for this month. Upgrade to Pro to unlock more searches, contact details, export, and outreach execution."
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
    const { data: search, error: insertErr } = await supabaseAdmin
      .from("hirelix_searches")
      .insert({
        user_id: user.id,
        jd_text: jd_text.trim(),
        status: "queued",
        pipeline_step: "queued",
        error_message: null,
        warning_message: null,
        parsed_requirements: {
          candidate_count: maxCandidates,
          display_count: searchTargets.displayCount,
          highlight_count: searchTargets.highlightCount,
          requested_candidate_count: requestedCandidates,
          outreach_pool_target: DEFAULT_OUTREACH_POOL_TARGET,
          plan_code: planCode,
          launch_mode: "paid_beta",
          launch_scope: "us_only",
          execution_profile: searchTargets.executionProfile,
          activation_run: false,
          search_phase: "phase_1",
        },
        queued_at: timestamp,
        parse_completed_at: null,
        search_completed_at: null,
        partial_ready_at: null,
        done_at: null,
      })
      .select("id")
      .single();

    if (insertErr || !search) {
      console.error("Insert search error:", insertErr);
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

    try {
      await supabaseAdmin.from("hirelix_usage_events").insert({
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
          launch_mode: "paid_beta",
          launch_scope: "us_only",
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
      await supabaseAdmin
        .from("hirelix_searches")
        .update({
          status: "error",
          pipeline_step: "error",
          error_message: "Failed to enqueue search job",
          warning_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", createdSearchId);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
