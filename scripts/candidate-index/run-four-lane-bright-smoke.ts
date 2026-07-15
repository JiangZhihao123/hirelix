import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_searches } from "@/db/schema";
import { filterDatasetProfiles } from "@/lib/brightdata";
import { initializeGlobalOutboundProxy } from "@/lib/server-outbound-proxy";
import {
  buildBrightDataRecallFilters,
} from "@/lib/search/recall";
import {
  buildRecallLocationFilter,
  buildStandardSkillFilter,
  isPlaceholderTitle,
  normalizeRecallSpec,
  sanitizeHiringBrief,
} from "@/lib/search-jobs";
import { getSearchExecutionProfile } from "@/lib/search-execution";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const searchId = readArg("search-id");
  if (!searchId) throw new Error("--search-id is required");
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) throw new Error("BRIGHTDATA_API_TOKEN is required");
  process.env.SEARCH_RECALL_STRATEGY = "headhunter_v2";
  process.env.BRIGHTDATA_DATASET_ID ||= "gd_l1viktl72bvl7bjuj0";
  initializeGlobalOutboundProxy();

  const [search] = await db
    .select()
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, searchId))
    .limit(1);
  if (!search) throw new Error("Search not found");
  const parsed = search.parsed_requirements as Record<string, unknown>;
  const executionProfile = {
    ...getSearchExecutionProfile("bright_production_full"),
    filterLimit: 100,
    hiddenGemLimit: 150,
    companyTargetLimit: 150,
  };
  const rounds = buildBrightDataRecallFilters(parsed, 400, executionProfile, {
    normalizeRecallSpec,
    sanitizeHiringBrief,
    buildStandardSkillFilter,
    buildRecallLocationFilter,
    isPlaceholderTitle,
    hiddenGemLimit: 150,
    companyTargetLimit: 150,
  });
  if (rounds.length !== 4) throw new Error(`Expected four rounds, got ${rounds.length}`);

  const results = await Promise.all(rounds.map(async (round) => {
    const result = await filterDatasetProfiles(token, round.request, {
      timeoutMs: 900_000,
      pollIntervalMs: 5_000,
    });
    return {
      round: round.round,
      requested: round.request.recordsLimit,
      snapshot_id: result.snapshotId,
      returned: result.profiles.length,
      profiles: result.profiles,
    };
  }));
  const profiles = results.flatMap((result) => result.profiles);
  const identities = profiles
    .map((profile) => profile.linkedin_id || profile.linkedin_url || `${profile.name}|${profile.current_company}|${profile.current_title}`)
    .filter(Boolean);
  const complete = profiles.filter((profile) =>
    Boolean(profile.name && profile.current_title && profile.current_company && profile.location),
  ).length;
  console.log(JSON.stringify({
    rounds: results.map(({ profiles: _profiles, ...summary }) => summary),
    total_profiles: profiles.length,
    unique_profiles: new Set(identities).size,
    duplicate_profiles: profiles.length - new Set(identities).size,
    complete_profiles: complete,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
