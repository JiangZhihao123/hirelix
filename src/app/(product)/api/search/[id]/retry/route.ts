import { NextRequest, NextResponse } from "next/server";
import { isStaleProcessingSearch } from "@/lib/search-state";
import { enqueueSearchJob, kickSearchJobRunner } from "@/lib/search-jobs";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

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

  // Fetch the existing search
  const { data: search } = await supabaseAdmin
    .from("hirelix_searches")
    .select("id, user_id, jd_text, parsed_requirements, status, updated_at")
    .eq("id", id)
    .single();

  if (!search || search.user_id !== user.id) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  const canRetry =
    search.status === "error"
    || search.status === "degraded"
    || isStaleProcessingSearch(search.status, (search as { updated_at?: string | null }).updated_at);

  if (!canRetry) {
    return NextResponse.json({ error: "Only failed or stalled searches can be retried" }, { status: 400 });
  }

  const candidateCount = (search.parsed_requirements as Record<string, unknown>)?.candidate_count as number || 5;
  await enqueueSearchJob({
    searchId: id,
    userId: user.id,
    jdText: search.jd_text,
    candidateCount,
  });

  const timestamp = new Date().toISOString();
  await supabaseAdmin
    .from("hirelix_searches")
    .update({
      status: "queued",
      pipeline_step: "queued",
      error_message: null,
      warning_message: null,
      queued_at: timestamp,
      search_completed_at: null,
      partial_ready_at: null,
      done_at: null,
      updated_at: timestamp,
    })
    .eq("id", id);

  kickSearchJobRunner(process.env.APP_BASE_URL || req.nextUrl.origin, {
    searchId: id,
  });

  return NextResponse.json({ ok: true });
}
