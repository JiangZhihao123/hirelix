/**
 * Quick test: run the search pipeline directly without HTTP/auth.
 * Usage: node --env-file=.env scripts/test-pipeline.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const JD_TEXT = `Senior Backend Engineer

Location: San Francisco Bay Area (Hybrid)
Company: TechCorp Inc.

We are looking for a Senior Backend Engineer with 5+ years of experience in distributed systems.
You will design and build scalable microservices powering our real-time data platform.

Requirements:
- 5+ years backend development experience
- Strong proficiency in Go or Rust
- Experience with Kubernetes, Docker, and cloud infrastructure (AWS/GCP)
- Distributed systems design (message queues, event-driven architecture)
- PostgreSQL or similar relational databases
- RESTful API and gRPC design

Nice to have:
- Experience with Apache Kafka or similar streaming platforms
- Familiarity with observability tools (Datadog, Prometheus, Grafana)
- Open source contributions

We offer competitive salary ($180k-$250k), equity, and excellent benefits.`;

const USER_ID = "b602172d-f7d4-4f01-b835-3feff9eae346";
const CANDIDATE_COUNT = 5;

async function main() {
  console.log("=== Pipeline Test Start ===");
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Create a search row
  const now = new Date().toISOString();
  const { data: search, error: searchErr } = await supabase
    .from("hirelix_searches")
    .insert({
      user_id: USER_ID,
      jd_text: JD_TEXT,
      status: "queued",
      pipeline_step: "queued",
      queued_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (searchErr) {
    console.error("Failed to create search:", searchErr.message);
    process.exit(1);
  }
  console.log(`Search created: ${search.id}`);

  // 2. Enqueue a job
  const { data: job, error: jobErr } = await supabase
    .from("hirelix_search_jobs")
    .insert({
      search_id: search.id,
      user_id: USER_ID,
      jd_text: JD_TEXT,
      candidate_count: CANDIDATE_COUNT,
      status: "queued",
      attempt_count: 0,
      created_at: now,
      available_at: now,
    })
    .select("id")
    .single();

  if (jobErr) {
    console.error("Failed to create job:", jobErr.message);
    process.exit(1);
  }
  console.log(`Job created: ${job.id}`);
  console.log(`\nNow trigger the pipeline by calling: curl -s http://localhost:3000/api/search/run`);
  console.log(`Or watch the dev server logs — the job runner should pick it up automatically.`);
  console.log(`\nSearch ID: ${search.id}`);
  console.log(`Monitor: http://localhost:3000/app/search/${search.id}`);

  // 3. Poll for status
  console.log("\n--- Polling status every 10s ---");
  const startTime = Date.now();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const { data: s } = await supabase
      .from("hirelix_searches")
      .select("status, warning_message, error_message")
      .eq("id", search.id)
      .single();

    const { count } = await supabase
      .from("hirelix_candidates")
      .select("id", { count: "exact", head: true })
      .eq("search_id", search.id);

    console.log(`[${elapsed}s] status=${s?.status} candidates=${count || 0} warning=${s?.warning_message || "none"} error=${s?.error_message || "none"}`);

    if (["done", "degraded", "error"].includes(s?.status)) {
      console.log(`\n=== Pipeline finished: ${s.status} (${elapsed}s) ===`);

      if (s.status === "done" || s.status === "degraded") {
        const { data: candidates } = await supabase
          .from("hirelix_candidates")
          .select("name, headline, match_score, profile_url")
          .eq("search_id", search.id)
          .order("match_score", { ascending: false });

        console.log(`\nFinal candidates (${candidates?.length || 0}):`);
        for (const c of candidates || []) {
          console.log(`  ${c.match_score}% | ${c.name} | ${c.headline || "N/A"} | ${c.profile_url || "N/A"}`);
        }

        // Check display_stats
        const { data: full } = await supabase
          .from("hirelix_searches")
          .select("parsed_requirements")
          .eq("id", search.id)
          .single();
        const stats = full?.parsed_requirements?.display_stats;
        if (stats) {
          console.log(`\nDisplay stats: retrieval=${stats.retrieval_count} deep_review=${stats.deep_review_count} shortlist=${stats.shortlist_count}`);
        }
      }
      break;
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
