import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { db, closeDb } from "@/db/client";
import { hirelix_search_jobs, hirelix_searches } from "@/db/schema";
import { processNextSearchJob } from "@/lib/search";

type Fixture = {
  fixture_id: string;
  content_sha256: string;
  jd_text: string;
};

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const fixture = JSON.parse(
    fs.readFileSync(path.resolve("tests/fixtures/zillow-agentic-ai-jd.json"), "utf8"),
  ) as Fixture;
  const hash = createHash("sha256").update(fixture.jd_text).digest("hex");
  if (hash !== fixture.content_sha256) throw new Error("Frozen Zillow JD hash mismatch");

  const allowPaid = process.argv.includes("--allow-paid");
  const searchId = readArg("search-id");
  const maxBudget = Number(readArg("max-budget-usd") || "0");
  if (!allowPaid) {
    console.log(`Fixture ${fixture.fixture_id} is valid (${hash}).`);
    console.log("Dry run only. Paid Bright validation requires --allow-paid --max-budget-usd=1.25 --search-id=UUID.");
    return;
  }
  if (maxBudget !== 1.25) throw new Error("Paid validation requires an exact $1.25 hard budget acknowledgement");
  if (!searchId) throw new Error("--search-id is required for paid validation");

  const rows = await db
    .select({
      id: hirelix_searches.id,
      jd_text: hirelix_searches.jd_text,
      parsed_requirements: hirelix_searches.parsed_requirements,
      job_status: hirelix_search_jobs.status,
    })
    .from(hirelix_searches)
    .innerJoin(hirelix_search_jobs, eq(hirelix_search_jobs.search_id, hirelix_searches.id))
    .where(and(eq(hirelix_searches.id, searchId), eq(hirelix_search_jobs.status, "queued")))
    .limit(1);
  const search = rows[0];
  if (!search) throw new Error("Validation search must exist with a queued job");
  if (createHash("sha256").update(search.jd_text).digest("hex") !== fixture.content_sha256) {
    throw new Error("Validation search JD does not match the frozen Zillow fixture");
  }
  const parsed = search.parsed_requirements && typeof search.parsed_requirements === "object"
    ? search.parsed_requirements as Record<string, unknown>
    : {};
  if (parsed.candidate_index_force_bright !== true || parsed.profile_scan_budget !== 500) {
    throw new Error("Validation search must already reserve profile_scan_budget=500 and candidate_index_force_bright=true");
  }
  const result = await processNextSearchJob(searchId);
  console.log(JSON.stringify({ fixture_id: fixture.fixture_id, search_id: searchId, result }, null, 2));
}

main().finally(() => closeDb()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

