import {
  adaptDatasetRecordToBrightDataProfile,
  computeFilterHash,
  type BrightDataDatasetFilterRequest,
  type BrightDataProfile,
} from "@/lib/brightdata";
import type { SnapshotCacheEntry } from "@/lib/search/persistence";
import type { RecallRound } from "@/lib/search/recall";
import { getTotalRecallRequestLimit } from "@/lib/search/recall";

export type RecallLaneValidationMode = "cache_replay" | "micro_recall";
export type RecallLaneValidationStatus =
  | "cache_hit"
  | "historical_snapshot"
  | "submitted_micro"
  | "not_run_cache_miss"
  | "download_failed";

export type RecallLaneValidationSample = {
  name: string;
  headline: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  profile_url: string | null;
  quality_label: "potential_advance" | "review" | "likely_irrelevant";
};

export type RecallLaneValidationRoundReport = {
  round: string;
  status: RecallLaneValidationStatus;
  requested: number;
  returned: number;
  unique: number;
  duplicate_count: number;
  returned_rate: number;
  unique_rate: number;
  potential_advance_rate: number;
  lane_usefulness: "useful" | "weak" | "unknown";
  bad_filter_signal: string | null;
  filter_hash: string;
  snapshot_id: string | null;
  location_mode: "country_only" | "location_filter";
  sample_profiles: RecallLaneValidationSample[];
};

export type RecallLaneValidationReport = {
  search_id: string | null;
  mode: RecallLaneValidationMode;
  allow_bright: boolean;
  total_requested_cap: number;
  total_requested: number;
  total_returned: number;
  total_unique: number;
  unique_rate: number;
  potential_advance_count: number;
  potential_advance_rate: number;
  rounds: RecallLaneValidationRoundReport[];
  recommendation: "ready_for_full_e2e" | "keep_optimizing_recall" | "insufficient_data";
  generated_at: string;
};

export type KnownRecallSnapshot = {
  round: string;
  snapshotId: string;
  recordsLimit?: number | null;
};

export type RecallLaneValidationDependencies = {
  lookupCachedSnapshot: (filterHash: string) => Promise<SnapshotCacheEntry | null>;
  loadCachedSnapshotProfiles: (
    snapshotId: string,
    sourceRound: string,
  ) => Promise<Record<string, unknown>[] | null>;
  triggerDatasetFilter?: (request: BrightDataDatasetFilterRequest) => Promise<string>;
  downloadDatasetSnapshot?: (snapshotId: string) => Promise<Record<string, unknown>[]>;
  persistSnapshotProfiles?: (
    rows: Record<string, unknown>[],
    params: {
      snapshotId: string;
      sourceRound: string;
    },
  ) => Promise<void>;
  cacheSnapshotEntry?: (params: {
    snapshotId: string;
    round: string;
    filterHash: string;
    recordsLimit: number;
  }) => Promise<void>;
};

export type ValidateRecallLanesOptions = {
  searchId?: string | null;
  allowBright?: boolean;
  mode?: RecallLaneValidationMode;
  knownSnapshots?: KnownRecallSnapshot[];
  now?: () => Date;
};

function roundRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function normalizeProfileKey(profile: BrightDataProfile) {
  const directKey = profile.linkedin_id || profile.url;
  if (directKey) return directKey.toLowerCase();
  return [
    profile.name,
    profile.current_company?.name,
    profile.current_company?.title,
    profile.city,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

function profileText(profile: BrightDataProfile) {
  return [
    profile.headline,
    profile.about,
    profile.current_company?.title,
    profile.current_company?.name,
    ...profile.skills,
    ...profile.experience.flatMap((item) => [item.title, item.company, item.description]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function getLocation(profile: BrightDataProfile) {
  const city = profile.city?.trim();
  const country = profile.country_code?.trim();
  return [city, country].filter(Boolean).join(", ") || null;
}

const IRRELEVANT_PROFILE_PATTERNS = [
  /\brecruit(er|ing)\b/i,
  /\btalent acquisition\b/i,
  /\bsales\b/i,
  /\baccount executive\b/i,
  /\bcustomer success\b/i,
  /\bproduct manager\b/i,
  /\bproject manager\b/i,
  /\bprogram manager\b/i,
];

const ENGINEERING_PROFILE_PATTERNS = [
  /\bsoftware engineer\b/i,
  /\bbackend engineer\b/i,
  /\bback end engineer\b/i,
  /\bplatform engineer\b/i,
  /\binfrastructure engineer\b/i,
  /\bdata engineer\b/i,
  /\bdata platform\b/i,
  /\bsite reliability\b/i,
  /\bsre\b/i,
  /\bmachine learning engineer\b/i,
  /\bml engineer\b/i,
  /\bstaff engineer\b/i,
  /\bprincipal engineer\b/i,
  /\bsenior engineer\b/i,
  /\bengineering\b/i,
];

const TECHNICAL_SIGNAL_PATTERNS = [
  /\bdistributed systems?\b/i,
  /\bkubernetes\b/i,
  /\bbackend\b/i,
  /\bplatform\b/i,
  /\binfrastructure\b/i,
  /\bpostgres(ql)?\b/i,
  /\bkafka\b/i,
  /\bspark\b/i,
  /\bsearch\b/i,
  /\branking\b/i,
  /\bdata pipeline/i,
  /\bapi\b/i,
  /\bmicroservices?\b/i,
  /\bproduction\b/i,
  /\bscal(e|able|ability)\b/i,
];

export function classifyRecallValidationProfile(
  profile: BrightDataProfile,
): RecallLaneValidationSample["quality_label"] {
  const text = profileText(profile);
  if (IRRELEVANT_PROFILE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "likely_irrelevant";
  }

  const hasEngineeringSignal = ENGINEERING_PROFILE_PATTERNS.some((pattern) => pattern.test(text));
  const technicalSignalCount = TECHNICAL_SIGNAL_PATTERNS.filter((pattern) => pattern.test(text)).length;
  if (hasEngineeringSignal && technicalSignalCount >= 2) {
    return "potential_advance";
  }
  if (hasEngineeringSignal || technicalSignalCount >= 2) {
    return "review";
  }
  return "likely_irrelevant";
}

function buildSampleProfiles(profiles: BrightDataProfile[]): RecallLaneValidationSample[] {
  return profiles.slice(0, 5).map((profile) => ({
    name: profile.name,
    headline: profile.headline,
    company: profile.current_company?.name ?? null,
    title: profile.current_company?.title ?? null,
    location: getLocation(profile),
    profile_url: profile.url,
    quality_label: classifyRecallValidationProfile(profile),
  }));
}

function buildRoundReport(params: {
  round: RecallRound;
  status: RecallLaneValidationStatus;
  filterHash: string;
  snapshotId: string | null;
  requestedOverride?: number | null;
  profiles: BrightDataProfile[];
  globalSeenBeforeRound: Set<string>;
}) {
  const profileKeys = params.profiles
    .map((profile) => normalizeProfileKey(profile))
    .filter((key) => key.length > 0);
  const novelKeys = profileKeys.filter((key) => !params.globalSeenBeforeRound.has(key));
  const unique = new Set(novelKeys).size;
  const returned = params.profiles.length;
  const requested =
    typeof params.requestedOverride === "number" && Number.isFinite(params.requestedOverride)
      ? Math.max(0, Math.round(params.requestedOverride))
      : params.round.request.recordsLimit;
  const potentialAdvance = params.profiles.filter(
    (profile) => classifyRecallValidationProfile(profile) === "potential_advance",
  ).length;
  const returnedRate = roundRate(returned, requested);
  const uniqueRate = roundRate(unique, returned);
  const potentialAdvanceRate = roundRate(potentialAdvance, returned);
  const duplicateCount = Math.max(0, returned - unique);
  const statusHasData =
    params.status === "cache_hit" ||
    params.status === "historical_snapshot" ||
    params.status === "submitted_micro";
  const badFilterSignal =
    statusHasData && returned === 0
      ? "returned_zero"
      : statusHasData && returnedRate < 0.5
        ? "returned_too_low"
        : statusHasData && returned >= 3 && uniqueRate < 0.5
          ? "duplicate_too_high"
          : statusHasData && returned >= 3 && potentialAdvanceRate === 0
            ? "sample_quality_weak"
            : null;
  const laneUsefulness =
    !statusHasData
      ? "unknown"
      : unique > 0 && potentialAdvance > 0
        ? "useful"
        : "weak";

  for (const key of profileKeys) {
    params.globalSeenBeforeRound.add(key);
  }

  return {
    round: params.round.round,
    status: params.status,
    requested,
    returned,
    unique,
    duplicate_count: duplicateCount,
    returned_rate: returnedRate,
    unique_rate: uniqueRate,
    potential_advance_rate: potentialAdvanceRate,
    lane_usefulness: laneUsefulness,
    bad_filter_signal: badFilterSignal,
    filter_hash: params.filterHash,
    snapshot_id: params.snapshotId,
    location_mode: params.round.diagnostics.location_mode,
    sample_profiles: buildSampleProfiles(params.profiles),
  } satisfies RecallLaneValidationRoundReport;
}

async function resolveRowsForRound(params: {
  round: RecallRound;
  filterHash: string;
  allowBright: boolean;
  knownSnapshot: KnownRecallSnapshot | null;
  deps: RecallLaneValidationDependencies;
}): Promise<{
  status: RecallLaneValidationStatus;
  snapshotId: string | null;
  requestedOverride?: number | null;
  rows: Record<string, unknown>[];
}> {
  if (params.knownSnapshot?.snapshotId) {
    const rows = await params.deps.loadCachedSnapshotProfiles(params.knownSnapshot.snapshotId, params.round.round);
    if (rows?.length) {
      return {
        status: "historical_snapshot",
        snapshotId: params.knownSnapshot.snapshotId,
        requestedOverride: params.knownSnapshot.recordsLimit,
        rows,
      };
    }
  }

  const cached = await params.deps.lookupCachedSnapshot(params.filterHash);
  if (cached) {
    const rows = await params.deps.loadCachedSnapshotProfiles(cached.snapshotId, params.round.round);
    if (rows?.length) {
      return {
        status: "cache_hit",
        snapshotId: cached.snapshotId,
        rows,
      };
    }
  }

  if (!params.allowBright) {
    return {
      status: "not_run_cache_miss",
      snapshotId: null,
      rows: [],
    };
  }

  if (!params.deps.triggerDatasetFilter || !params.deps.downloadDatasetSnapshot) {
    throw new Error("Bright validation requires triggerDatasetFilter and downloadDatasetSnapshot dependencies.");
  }

  const snapshotId = await params.deps.triggerDatasetFilter(params.round.request);
  await params.deps.cacheSnapshotEntry?.({
    snapshotId,
    round: params.round.round,
    filterHash: params.filterHash,
    recordsLimit: params.round.request.recordsLimit,
  });
  try {
    const rows = await params.deps.downloadDatasetSnapshot(snapshotId);
    await params.deps.persistSnapshotProfiles?.(rows, {
      snapshotId,
      sourceRound: params.round.round,
    });
    return {
      status: "submitted_micro",
      snapshotId,
      rows,
    };
  } catch {
    return {
      status: "download_failed",
      snapshotId,
      rows: [],
    };
  }
}

function chooseRecommendation(rounds: RecallLaneValidationRoundReport[]) {
  const dataRounds = rounds.filter((round) =>
    round.status === "cache_hit" ||
    round.status === "historical_snapshot" ||
    round.status === "submitted_micro"
  );
  if (dataRounds.length === 0) return "insufficient_data" as const;

  const totalReturned = dataRounds.reduce((sum, round) => sum + round.returned, 0);
  const totalUnique = dataRounds.reduce((sum, round) => sum + round.unique, 0);
  const potentialAdvance = dataRounds.reduce(
    (sum, round) =>
      sum + Math.round(round.potential_advance_rate * round.returned),
    0,
  );
  const usefulRounds = dataRounds.filter((round) => round.lane_usefulness === "useful").length;
  if (
    totalReturned >= 25 &&
    roundRate(totalUnique, totalReturned) >= 0.7 &&
    usefulRounds >= 2 &&
    potentialAdvance >= 2
  ) {
    return "ready_for_full_e2e" as const;
  }
  return "keep_optimizing_recall" as const;
}

export async function validateRecallLanes(
  rounds: RecallRound[],
  deps: RecallLaneValidationDependencies,
  options: ValidateRecallLanesOptions = {},
): Promise<RecallLaneValidationReport> {
  const allowBright = options.allowBright === true;
  const knownSnapshots = new Map(
    (options.knownSnapshots ?? []).map((snapshot) => [snapshot.round, snapshot]),
  );
  const globalSeen = new Set<string>();
  const roundReports: RecallLaneValidationRoundReport[] = [];

  for (const round of rounds) {
    const filterHash = computeFilterHash(round.request);
    const knownSnapshot = knownSnapshots.get(round.round) ?? null;
    const resolved = await resolveRowsForRound({
      round,
      filterHash,
      allowBright,
      knownSnapshot,
      deps,
    });
    const profiles = resolved.rows.map(adaptDatasetRecordToBrightDataProfile);
    roundReports.push(buildRoundReport({
      round,
      status: resolved.status,
      filterHash,
      snapshotId: resolved.snapshotId,
      requestedOverride: resolved.requestedOverride,
      profiles,
      globalSeenBeforeRound: globalSeen,
    }));
  }

  const totalReturned = roundReports.reduce((sum, round) => sum + round.returned, 0);
  const totalUnique = roundReports.reduce((sum, round) => sum + round.unique, 0);
  const totalRequested = roundReports.reduce((sum, round) => sum + round.requested, 0);
  const potentialAdvanceCount = roundReports.reduce(
    (sum, round) => sum + Math.round(round.potential_advance_rate * round.returned),
    0,
  );
  return {
    search_id: options.searchId ?? null,
    mode: options.mode ?? (allowBright ? "micro_recall" : "cache_replay"),
    allow_bright: allowBright,
    total_requested_cap: getTotalRecallRequestLimit(rounds),
    total_requested: totalRequested,
    total_returned: totalReturned,
    total_unique: totalUnique,
    unique_rate: roundRate(totalUnique, totalReturned),
    potential_advance_count: potentialAdvanceCount,
    potential_advance_rate: roundRate(potentialAdvanceCount, totalReturned),
    rounds: roundReports,
    recommendation: chooseRecommendation(roundReports),
    generated_at: (options.now ?? (() => new Date()))().toISOString(),
  };
}
