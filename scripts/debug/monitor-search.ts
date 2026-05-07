import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const id = process.argv[2];
  if (!id) { console.error("usage: monitor-search.ts <search-id>"); process.exit(1); }

  const { data: s } = await sb
    .from("hirelix_searches")
    .select("status, pipeline_step, error_message, parsed_requirements")
    .eq("id", id)
    .maybeSingle();
  const { data: jobs, error: jobsErr } = await sb
    .from("hirelix_search_jobs")
    .select("id, status, attempt_count, last_error, created_at, started_at, updated_at")
    .eq("search_id", id);
  if (jobsErr) console.error("jobs err:", jobsErr);
  const stats = (s?.parsed_requirements as any)?.display_stats ?? {};
  const line = [
    (s?.status || "?"),
    (s?.pipeline_step || "?"),
    `jobs=${jobs?.length ?? 0}`,
    jobs && jobs.length > 0 ? `job.status=${jobs[0].status}` : "",
    jobs && jobs.length > 0 && jobs[0].last_error ? `err=${jobs[0].last_error.slice(0, 80)}` : "",
    `visible=${stats.visible_candidate_count ?? "-"}`,
    `reviewed=${stats.deep_review_completed_count ?? "-"}/${stats.deep_review_requested_count ?? "-"}`,
  ].filter(Boolean).join(" | ");
  console.log(line);
  if (s?.error_message) console.log("ERROR:", s.error_message);
}
main().catch((e) => { console.error(e); process.exit(1); });
