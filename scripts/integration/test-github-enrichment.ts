import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const searchId =
  process.env.SEARCH_ID ||
  process.argv.find((arg) => arg.startsWith("--search-id="))?.slice("--search-id=".length) ||
  "4d701077-2d39-4d4a-8cb3-d1b08c488335";
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
const limit = Number.isFinite(Number(limitArg)) && Number(limitArg) > 0
  ? Number(limitArg)
  : 3;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function githubStatusFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "none";
  const signals = (metadata as Record<string, unknown>).github_signals;
  if (!signals || typeof signals !== "object") return "none";
  return typeof (signals as Record<string, unknown>).status === "string"
    ? ((signals as Record<string, unknown>).status as string)
    : "none";
}

function githubEnrichmentVersionFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const enrichment = (metadata as Record<string, unknown>).github_enrichment;
  if (!enrichment || typeof enrichment !== "object") return null;
  const version = (enrichment as Record<string, unknown>).version;
  return typeof version === "number" ? version : null;
}

async function main() {
  const { initializeGlobalOutboundProxy } = await import("../../src/lib/server-outbound-proxy");
  const {
    enqueueGithubEnrichmentJobsForSearch,
    GITHUB_ENRICHMENT_VERSION,
    processNextGithubEnrichmentJob,
  } = await import("../../src/lib/github-enrichment-jobs");

  initializeGlobalOutboundProxy();

  const { data: search, error: searchError } = await supabase
    .from("hirelix_searches")
    .select("id, user_id, status, parsed_requirements")
    .eq("id", searchId)
    .maybeSingle();
  if (searchError) throw new Error(searchError.message);
  if (!search) throw new Error(`Search not found: ${searchId}`);

  const { data: beforeCandidates, error: candidateError } = await supabase
    .from("hirelix_candidates")
    .select("id, name, match_score, github_url, metadata")
    .eq("search_id", searchId)
    .order("match_score", { ascending: false })
    .limit(limit);
  if (candidateError) throw new Error(candidateError.message);
  if (!beforeCandidates?.length) throw new Error(`No candidates found for search ${searchId}`);

  console.log("[github-test] Search", {
    search_id: searchId,
    search_status: search.status,
    candidate_sample: beforeCandidates.length,
    before_statuses: beforeCandidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      github_status: githubStatusFromMetadata(candidate.metadata),
      github_enrichment_version: githubEnrichmentVersionFromMetadata(candidate.metadata),
      github_url: candidate.github_url,
    })),
  });

  const enqueueResult = await enqueueGithubEnrichmentJobsForSearch({
    searchId,
    userId: search.user_id,
    limit,
  });
  console.log("[github-test] Enqueue result", enqueueResult);

  const terminalStatuses = new Set([
    "verified",
    "missing_public_data",
    "ambiguous_match",
    "api_error",
  ]);
  let processed = 0;
  for (let index = 0; index < beforeCandidates.length; index += 1) {
    const candidate = beforeCandidates[index];
    const githubStatus = githubStatusFromMetadata(candidate.metadata);
    const githubEnrichmentVersion = githubEnrichmentVersionFromMetadata(candidate.metadata);
    if (
      terminalStatuses.has(githubStatus) &&
      githubEnrichmentVersion === GITHUB_ENRICHMENT_VERSION
    ) {
      console.log("[github-test] Skip already terminal candidate", {
        index: index + 1,
        candidate_id: candidate.id,
        status: githubStatus,
        version: githubEnrichmentVersion,
      });
      continue;
    }
    const startedAt = Date.now();
    const result = await processNextGithubEnrichmentJob(candidate.id);
    console.log("[github-test] Process result", {
      index: index + 1,
      candidate_id: candidate.id,
      duration_ms: Date.now() - startedAt,
      ...result,
    });
    if (!result.processed) break;
    processed += 1;
  }

  const candidateIds = beforeCandidates.map((candidate) => candidate.id);
  const { data: afterCandidates, error: afterError } = await supabase
    .from("hirelix_candidates")
    .select("id, name, github_url, metadata")
    .in("id", candidateIds);
  if (afterError) throw new Error(afterError.message);

  const afterStatuses = (afterCandidates || []).map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    github_status: githubStatusFromMetadata(candidate.metadata),
    github_enrichment_version: githubEnrichmentVersionFromMetadata(candidate.metadata),
    github_url: candidate.github_url,
    github_score:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>).github_signal_score ?? null
        : null,
  }));
  console.log("[github-test] After statuses", afterStatuses);

  const terminalCount = afterStatuses.filter((candidate) =>
    terminalStatuses.has(candidate.github_status),
  ).length;
  if (processed === 0 && terminalCount === 0) {
    throw new Error(
      `GitHub enrichment did not reach terminal status. processed=${processed}, terminal=${terminalCount}`,
    );
  }

  console.log("[github-test] PASS", {
    search_id: searchId,
    processed,
    terminal_count: terminalCount,
    verified_count: afterStatuses.filter((candidate) => candidate.github_status === "verified").length,
  });
}

main().catch((error) => {
  console.error("[github-test] FAIL", error);
  process.exitCode = 1;
});
