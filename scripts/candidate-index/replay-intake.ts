import { asc, eq } from "drizzle-orm";

import { closeDb, db } from "@/db/client";
import { hirelix_search_jobs, hirelix_searches, hirelix_snapshot_profiles } from "@/db/schema";
import { adaptDatasetRecordToBrightDataProfile } from "@/lib/brightdata";
import { buildCandidateIndexSearchIntent } from "@/lib/candidate-index/workflow";
import { screenBrightProfilesForIndex } from "@/lib/candidate-index/intake";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const searchId = readArg("search-id");
  if (!searchId) throw new Error("--search-id is required");
  const [search] = await db.select().from(hirelix_searches).where(eq(hirelix_searches.id, searchId)).limit(1);
  const [job] = await db.select().from(hirelix_search_jobs).where(eq(hirelix_search_jobs.search_id, searchId)).limit(1);
  if (!search || !job) throw new Error("Search or job not found");
  const rows = await db
    .select()
    .from(hirelix_snapshot_profiles)
    .where(eq(hirelix_snapshot_profiles.search_id, searchId))
    .orderBy(asc(hirelix_snapshot_profiles.created_at), asc(hirelix_snapshot_profiles.record_index));
  const profiles = rows.map((row) => adaptDatasetRecordToBrightDataProfile(row.raw_data));
  const unique = new Map<string, (typeof profiles)[number]>();
  for (const profile of profiles) {
    const identity = profile.linkedin_id || profile.url || `${profile.name}|${profile.current_company?.name || ""}|${profile.headline || ""}`;
    if (!unique.has(identity)) unique.set(identity, profile);
  }
  const parsed = search.parsed_requirements && typeof search.parsed_requirements === "object"
    ? search.parsed_requirements as Record<string, unknown>
    : {};
  const { judgmentInput } = buildCandidateIndexSearchIntent(search.jd_text, parsed);
  const result = await screenBrightProfilesForIndex({
    jd: judgmentInput,
    profiles: [...unique.values()],
    usage: { searchId, jobId: job.id, userId: search.user_id },
    limit: 120,
  });
  const selectedIndexes = new Set(result.reviews
    .filter((review) => review.decision === "advance" || review.decision === "maybe")
    .map((review) => review.index));
  console.log(JSON.stringify({
    search_id: searchId,
    raw_count: rows.length,
    unique_count: unique.size,
    metrics: result.metrics,
    selected_sample: [...unique.values()].flatMap((profile, index) => selectedIndexes.has(index) ? [{
      name: profile.name,
      headline: profile.headline,
      current_title: profile.current_company?.title || null,
      decision: result.reviews[index]?.decision,
      reason: result.reviews[index]?.reason,
    }] : []).slice(0, 25),
  }, null, 2));
}

main().finally(() => closeDb()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
