import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = "/Users/noah/projects/hirelix/.env";
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^=:#]+)=(.*)/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  });
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // 找一个有效的 search_id + job_id
  const { data: jobs, error: jobErr } = await sb
    .from("hirelix_search_jobs")
    .select("id, search_id")
    .order("created_at", { ascending: false })
    .limit(1);

  console.log("jobs:", jobs, "err:", jobErr);
  const job = jobs?.[0];
  if (!job) throw new Error("no job found");

  console.log(`Using search_id=${job.search_id} job_id=${job.id}`);

  // 直接写入 hirelix_snapshot_profiles
  const { data, error } = await sb.from("hirelix_snapshot_profiles").insert({
    snapshot_id: "test-snap-direct-write",
    search_id: job.search_id,
    job_id: job.id,
    source_round: "standard",
    linkedin_id: "test-li-123",
    profile_url: "https://linkedin.com/in/testuser",
    raw_data: { test: true, name: "Test User" },
  });

  console.log("insert result:", { data, error });

  // 查回来验证
  const { data: readback } = await sb
    .from("hirelix_snapshot_profiles")
    .select("*")
    .eq("snapshot_id", "test-snap-direct-write");

  console.log("readback:", readback);

  // 清理
  await sb.from("hirelix_snapshot_profiles").delete().eq("snapshot_id", "test-snap-direct-write");
  console.log("cleanup done");
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
