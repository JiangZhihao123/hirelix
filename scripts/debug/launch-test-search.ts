import { createClient } from "@supabase/supabase-js";
import { getInitialSearchTargets, normalizeSearchPlanCode } from "@/lib/search-execution";
import { enqueueSearchJob } from "@/lib/search";

const JD_TEXT = `Senior Backend Engineer (Python/Django) — Remote US.

Responsibilities:
- Build merchant-facing APIs and backend platform systems
- Own production reliability, observability, and incident response
- Design distributed services that scale to millions of requests/day

Requirements:
- 5+ years experience with Python and Django
- Strong PostgreSQL and AWS background
- Experience designing REST/gRPC APIs
- System design ownership at scale

Bonus: open source contributions, DevOps automation experience.`;

const DEFAULT_OUTREACH_POOL_TARGET = 20;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Reuse test user id
  const userEmail = "jzh_spring@163.com";
  const { data: userRow } = await sb
    .from("hirelix_user_settings")
    .select("user_id")
    .limit(1);
  if (!userRow || userRow.length === 0) {
    throw new Error("no user found");
  }

  // Instead, use auth listUsers to find the target user
  const auth = await sb.auth.admin.listUsers({ perPage: 200 });
  const user = auth.data.users.find((u) => u.email === userEmail);
  if (!user) throw new Error(`user ${userEmail} not found`);

  const planCode = normalizeSearchPlanCode("free");
  const targets = getInitialSearchTargets(planCode);
  const timestamp = new Date().toISOString();

  const parsedRequirements: Record<string, unknown> = {
    search_started_at: timestamp,
    candidate_count: targets.candidateCount,
    display_count: targets.displayCount,
    highlight_count: targets.highlightCount,
    requested_candidate_count: targets.highlightCount,
    outreach_pool_target: DEFAULT_OUTREACH_POOL_TARGET,
    plan_code: planCode,
    launch_mode: "tech_recruiter_mvp",
    launch_scope: "linkedin_plus_github",
    execution_profile: targets.executionProfile,
    activation_run: false,
    search_phase: "mvp_focus",
  };

  const { data: search, error } = await sb
    .from("hirelix_searches")
    .insert({
      user_id: user.id,
      title: null,
      jd_text: JD_TEXT,
      status: "queued",
      pipeline_step: "queued",
      error_message: null,
      parsed_requirements: parsedRequirements,
      queued_at: timestamp,
      parse_completed_at: null,
      search_completed_at: null,
      partial_ready_at: null,
      done_at: null,
    })
    .select("id")
    .single();
  if (error || !search) throw error ?? new Error("insert failed");

  await enqueueSearchJob({
    searchId: search.id,
    userId: user.id,
    jdText: JD_TEXT,
    candidateCount: targets.candidateCount,
  });

  console.log(search.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
