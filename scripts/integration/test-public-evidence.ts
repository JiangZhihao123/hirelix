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

function publicEvidenceFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const evidence = (metadata as Record<string, unknown>).public_evidence;
  return evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : null;
}

async function main() {
  const { initializeGlobalOutboundProxy } = await import("../../src/lib/server-outbound-proxy");
  const {
    enqueuePublicEvidenceJobsForSearch,
    processNextPublicEvidenceJob,
  } = await import("../../src/lib/public-evidence-jobs");

  initializeGlobalOutboundProxy();

  const { data: search, error: searchError } = await supabase
    .from("hirelix_searches")
    .select("id, user_id, status")
    .eq("id", searchId)
    .maybeSingle();
  if (searchError) throw new Error(searchError.message);
  if (!search) throw new Error(`Search not found: ${searchId}`);

  const { data: beforeCandidates, error: candidateError } = await supabase
    .from("hirelix_candidates")
    .select("id, name, match_score, metadata")
    .eq("search_id", searchId)
    .order("match_score", { ascending: false })
    .limit(limit);
  if (candidateError) throw new Error(candidateError.message);
  if (!beforeCandidates?.length) throw new Error(`No candidates found for search ${searchId}`);

  console.log("[public-evidence-test] Search", {
    search_id: searchId,
    search_status: search.status,
    candidate_sample: beforeCandidates.length,
    before: beforeCandidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      public_evidence: publicEvidenceFromMetadata(candidate.metadata),
    })),
  });

  const enqueueResult = await enqueuePublicEvidenceJobsForSearch({
    searchId,
    userId: search.user_id,
    limit,
  });
  console.log("[public-evidence-test] Enqueue result", enqueueResult);

  let processed = 0;
  for (let index = 0; index < beforeCandidates.length; index += 1) {
    const startedAt = Date.now();
    const result = await processNextPublicEvidenceJob(beforeCandidates[index]?.id);
    console.log("[public-evidence-test] Process result", {
      index: index + 1,
      candidate_id: beforeCandidates[index]?.id,
      duration_ms: Date.now() - startedAt,
      ...result,
    });
    if (!result.processed) break;
    processed += 1;
  }

  const candidateIds = beforeCandidates.map((candidate) => candidate.id);
  const { data: afterCandidates, error: afterError } = await supabase
    .from("hirelix_candidates")
    .select("id, name, metadata")
    .in("id", candidateIds);
  if (afterError) throw new Error(afterError.message);

  const after = (afterCandidates || []).map((candidate) => {
    const evidence = publicEvidenceFromMetadata(candidate.metadata);
    const items = Array.isArray(evidence?.items) ? evidence.items : [];
    return {
      id: candidate.id,
      name: candidate.name,
      status: evidence?.status ?? null,
      score: evidence?.score ?? null,
      item_count: items.length,
      top_summary:
        items[0] && typeof items[0] === "object"
          ? (items[0] as Record<string, unknown>).evidence_summary ?? null
          : null,
    };
  });
  console.log("[public-evidence-test] After", after);

  if (processed === 0 && after.every((candidate) => !candidate.status)) {
    throw new Error("Public evidence did not process or produce metadata.");
  }

  console.log("[public-evidence-test] PASS", {
    search_id: searchId,
    processed,
    verified_or_partial: after.filter((candidate) =>
      candidate.status === "verified" || candidate.status === "partial",
    ).length,
  });
}

main().catch((error) => {
  console.error("[public-evidence-test] FAIL", error);
  process.exitCode = 1;
});
