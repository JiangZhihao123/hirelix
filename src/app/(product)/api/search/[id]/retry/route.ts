import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = getUserFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Fetch the existing search
  const { data: search } = await supabaseAdmin
    .from("hirelix_searches")
    .select("id, user_id, jd_text, parsed_requirements, status")
    .eq("id", id)
    .single();

  if (!search || search.user_id !== user.id) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  if (search.status !== "error") {
    return NextResponse.json({ error: "Only failed searches can be retried" }, { status: 400 });
  }

  // Reset search status
  await supabaseAdmin
    .from("hirelix_searches")
    .update({
      status: "processing",
      pipeline_step: "queued",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Delete old candidates if any
  await supabaseAdmin.from("hirelix_candidates").delete().eq("search_id", id);

  // Re-run the pipeline via dynamic import to avoid circular deps
  const candidateCount = (search.parsed_requirements as Record<string, unknown>)?.candidate_count as number || 5;
  const userId = user.id;

  after(async () => {
    // Dynamic import the pipeline runner from create route
    const { runPipelineForRetry } = await import("@/app/(product)/api/search/create/route");
    await runPipelineForRetry(id, search.jd_text, candidateCount, userId);
  });

  return NextResponse.json({ ok: true });
}
