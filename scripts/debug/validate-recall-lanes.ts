import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

import {
  downloadDatasetSnapshot,
  triggerDatasetFilter,
  waitForDatasetSnapshot,
} from "@/lib/brightdata";
import { closeDb, db } from "@/db/client";
import { hirelix_search_jobs, hirelix_searches } from "@/db/schema";
import { buildParsedRequirementsForLaunch, parseJobDescriptionToDraft } from "@/lib/jd-parse";
import {
  buildRecallLocationFilter,
  buildStandardSkillFilter,
  isPlaceholderTitle,
  normalizeRecallMetadata,
  normalizeRecallSpec,
  sanitizeHiringBrief,
} from "@/lib/search-jobs";
import {
  cacheSnapshotEntry,
  loadCachedSnapshotProfiles,
  lookupCachedSnapshot,
  persistSnapshotProfiles,
} from "@/lib/search/persistence";
import {
  buildBrightDataRecallFilters,
  getTotalRecallRequestLimit,
  scaleRecallRoundsForValidation,
} from "@/lib/search/recall";
import {
  validateRecallLanes,
  type KnownRecallSnapshot,
} from "@/lib/search/recall-validation";
import {
  applyProfileScanBudgetToExecutionProfile,
  getInitialSearchExecutionProfile,
  getSearchExecutionProfile,
  normalizeSearchExecutionProfileName,
  normalizeSearchPlanCode,
} from "@/lib/search-execution";

type CliOptions = {
  input: string | null;
  allowBright: boolean;
  perRound: number;
  totalCap: number;
  out: string | null;
  parseJd: boolean;
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: null,
    allowBright: false,
    perRound: 5,
    totalCap: 40,
    out: null,
    parseJd: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--allow-bright") {
      options.allowBright = true;
      continue;
    }
    if (arg.startsWith("--allow-bright=")) {
      options.allowBright = parseBoolean(arg.split("=")[1], false);
      continue;
    }
    if (arg === "--parse-jd") {
      options.parseJd = true;
      continue;
    }
    if (arg.startsWith("--per-round=")) {
      options.perRound = parsePositiveInt(arg.split("=")[1], options.perRound);
      continue;
    }
    if (arg === "--per-round") {
      index += 1;
      options.perRound = parsePositiveInt(argv[index], options.perRound);
      continue;
    }
    if (arg.startsWith("--total-cap=")) {
      options.totalCap = parsePositiveInt(arg.split("=")[1], options.totalCap);
      continue;
    }
    if (arg === "--total-cap") {
      index += 1;
      options.totalCap = parsePositiveInt(argv[index], options.totalCap);
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--out") {
      index += 1;
      options.out = argv[index] ?? null;
      continue;
    }
    if (!options.input) {
      options.input = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.input) {
    throw new Error(
      "Usage: npx tsx scripts/debug/validate-recall-lanes.ts <search-id|parsed-json-file> [--allow-bright=false] [--per-round=5] [--total-cap=40] [--out tmp/report.json]",
    );
  }
  return options;
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function recordFromJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object with parsed requirements.");
  }
  return value as Record<string, unknown>;
}

async function loadParsedFromFile(filePath: string, options: CliOptions) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  if (!options.parseJd) {
    return {
      searchId: null,
      jobId: null,
      parsed: recordFromJson(JSON.parse(raw)),
      candidateCount: 250,
      knownSnapshots: [] as KnownRecallSnapshot[],
    };
  }

  const draft = await parseJobDescriptionToDraft(raw, { populateTargetCompanies: true });
  const profile = getInitialSearchExecutionProfile("free");
  const candidateCount = profile.deliveryReferenceCount;
  return {
    searchId: null,
    jobId: null,
    parsed: buildParsedRequirementsForLaunch(draft, raw, {
      candidateCount,
      displayCount: candidateCount,
      highlightCount: profile.highlightCount,
      outreachPoolTarget: candidateCount,
      planCode: "free",
      executionProfile: profile.name,
      profileScanBudget: candidateCount,
    }),
    candidateCount,
    knownSnapshots: [] as KnownRecallSnapshot[],
  };
}

async function loadParsedFromSearch(searchId: string) {
  const searchRows = await db
    .select({
      id: hirelix_searches.id,
      jd_text: hirelix_searches.jd_text,
      parsed_requirements: hirelix_searches.parsed_requirements,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, searchId))
    .limit(1);
  const search = searchRows[0];
  if (!search) throw new Error(`Search not found: ${searchId}`);

  const jobRows = await db
    .select({
      id: hirelix_search_jobs.id,
      candidate_count: hirelix_search_jobs.candidate_count,
    })
    .from(hirelix_search_jobs)
    .where(eq(hirelix_search_jobs.search_id, searchId))
    .limit(1);

  const parsed = recordFromJson(search.parsed_requirements);
  const metadata = normalizeRecallMetadata(parsed.recall_metadata);
  const requestedByRound = new Map(
    (metadata?.round_diagnostics ?? []).map((diagnostic) => [
      diagnostic.round,
      diagnostic.requested_count,
    ]),
  );
  const filterHashByRound = new Map(
    (metadata?.round_diagnostics ?? []).map((diagnostic) => [
      diagnostic.round,
      diagnostic.filter_hash ?? null,
    ]),
  );
  const knownSnapshots: KnownRecallSnapshot[] = [];
  if (metadata?.snapshot_id) {
    knownSnapshots.push({
      round: "standard",
      snapshotId: metadata.snapshot_id,
      recordsLimit: requestedByRound.get("standard") ?? null,
      filterHash: filterHashByRound.get("standard") ?? null,
    });
  }
  for (const snapshot of metadata?.additional_snapshots ?? []) {
    if (snapshot.round && snapshot.snapshot_id) {
      knownSnapshots.push({
        round: snapshot.round,
        snapshotId: snapshot.snapshot_id,
        recordsLimit:
          requestedByRound.get(snapshot.round) ??
          snapshot.records_limit ??
          snapshot.requested_count ??
          null,
        filterHash: filterHashByRound.get(snapshot.round) ?? snapshot.filter_hash ?? null,
      });
    }
  }

  const profileName = normalizeSearchExecutionProfileName(parsed.execution_profile);
  const planCode = normalizeSearchPlanCode(parsed.plan_code);
  const profile = profileName
    ? getSearchExecutionProfile(profileName)
    : getInitialSearchExecutionProfile(planCode);
  const storedBudget =
    typeof parsed.profile_scan_budget === "number" && Number.isFinite(parsed.profile_scan_budget)
      ? Math.max(1, Math.round(parsed.profile_scan_budget))
      : null;
  const effectiveProfile = storedBudget
    ? applyProfileScanBudgetToExecutionProfile(profile, storedBudget)
    : profile;
  const candidateCount =
    typeof parsed.candidate_count === "number" && Number.isFinite(parsed.candidate_count)
      ? Math.max(1, Math.round(parsed.candidate_count))
      : jobRows[0]?.candidate_count ?? effectiveProfile.deliveryReferenceCount;

  return {
    searchId,
    jobId: jobRows[0]?.id ?? null,
    parsed,
    candidateCount,
    knownSnapshots,
  };
}

function buildExecutionProfile(parsed: Record<string, unknown>) {
  const profileName = normalizeSearchExecutionProfileName(parsed.execution_profile);
  const planCode = normalizeSearchPlanCode(parsed.plan_code);
  const profile = profileName
    ? getSearchExecutionProfile(profileName)
    : getInitialSearchExecutionProfile(planCode);
  if (typeof parsed.profile_scan_budget === "number" && Number.isFinite(parsed.profile_scan_budget)) {
    return applyProfileScanBudgetToExecutionProfile(profile, parsed.profile_scan_budget);
  }
  return profile;
}

async function main() {
  loadEnvFile(path.resolve(".env.local"));
  loadEnvFile(path.resolve(".env"));

  const options = parseArgs(process.argv.slice(2));
  if (options.allowBright && !process.env.BRIGHTDATA_API_TOKEN) {
    throw new Error("--allow-bright requires BRIGHTDATA_API_TOKEN.");
  }

  const inputData = looksLikeUuid(options.input!)
    ? await loadParsedFromSearch(options.input!)
    : await loadParsedFromFile(options.input!, options);
  const executionProfile = buildExecutionProfile(inputData.parsed);
  const fullRounds = buildBrightDataRecallFilters(
    inputData.parsed,
    inputData.candidateCount,
    executionProfile,
    {
      normalizeRecallSpec,
      sanitizeHiringBrief,
      buildStandardSkillFilter,
      buildRecallLocationFilter,
      isPlaceholderTitle,
      hiddenGemLimit: executionProfile.hiddenGemLimit,
      companyTargetLimit: executionProfile.companyTargetLimit,
    },
  );
  const validationRounds = scaleRecallRoundsForValidation(fullRounds, {
    perRoundLimit: options.perRound,
    totalLimit: options.totalCap,
  });

  const report = await validateRecallLanes(
    validationRounds,
    {
      lookupCachedSnapshot,
      loadCachedSnapshotProfiles,
      triggerDatasetFilter: options.allowBright
        ? (request) => triggerDatasetFilter(process.env.BRIGHTDATA_API_TOKEN!, request)
        : undefined,
      downloadDatasetSnapshot: options.allowBright
        ? async (snapshotId) => {
          const waited = await waitForDatasetSnapshot(process.env.BRIGHTDATA_API_TOKEN!, snapshotId, {
            timeoutMs: 300000,
            pollIntervalMs: 5000,
          });
          if (!waited.metadata || !waited.profiles) {
            throw new Error(`Bright Data micro snapshot ${snapshotId} did not become ready in time.`);
          }
          return downloadDatasetSnapshot(process.env.BRIGHTDATA_API_TOKEN!, snapshotId);
        }
        : undefined,
      persistSnapshotProfiles: inputData.searchId && inputData.jobId
        ? (rows, params) =>
          persistSnapshotProfiles(rows, {
            snapshotId: params.snapshotId,
            searchId: inputData.searchId!,
            jobId: inputData.jobId!,
            sourceRound: params.sourceRound,
          }).then(() => undefined)
        : undefined,
      cacheSnapshotEntry: (params) =>
        cacheSnapshotEntry({
          snapshotId: params.snapshotId,
          round: params.round,
          filterHash: params.filterHash,
          filterSummary: null,
          recordsLimit: params.recordsLimit,
        }),
    },
    {
      searchId: inputData.searchId,
      allowBright: options.allowBright,
      knownSnapshots: inputData.knownSnapshots,
      mode: options.allowBright ? "micro_recall" : "cache_replay",
    },
  );

  const payload = {
    ...report,
    full_round_requested: getTotalRecallRequestLimit(fullRounds),
    validation_round_requested: getTotalRecallRequestLimit(validationRounds),
  };
  const output = `${JSON.stringify(payload, null, 2)}\n`;
  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output);
  }
  process.stdout.write(output);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
