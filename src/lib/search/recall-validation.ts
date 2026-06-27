import {
  adaptDatasetRecordToBrightDataProfile,
  computeFilterHash,
  type BrightDataDatasetFilterRequest,
  type BrightDataProfile,
} from "@/lib/brightdata";
import { generateLlmJson, getLightweightLlmModel } from "@/lib/llm-client";
import { RECALL_VALIDATION_QUALITY_JSON_SCHEMA } from "@/lib/llm-schemas";
import type { SnapshotCacheEntry } from "@/lib/search/persistence";
import type { RecallRound } from "@/lib/search/recall";
import { getTotalRecallRequestLimit } from "@/lib/search/recall";

export type RecallLaneValidationMode = "cache_replay" | "micro_recall";
export type RecallLaneValidationStatus =
  | "cache_hit"
  | "historical_snapshot"
  | "downloaded_cache_snapshot"
  | "submitted_micro"
  | "not_run_cache_miss"
  | "download_failed";

export type RecallLaneValidationSample = {
  index: number;
  name: string;
  headline: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  profile_url: string | null;
  quality_label: "potential_advance" | "review" | "likely_irrelevant";
  quality_reasons: string[];
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
  filterHash?: string | null;
};

export type RecallLaneValidationDependencies = {
  lookupCachedSnapshot: (filterHash: string) => Promise<SnapshotCacheEntry | null>;
  loadCachedSnapshotProfiles: (
    snapshotId: string,
    sourceRound: string,
    options?: { fallbackAnyRound?: boolean },
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
  assessProfileQuality?: (
    profiles: BrightDataProfile[],
    context: RecallValidationQualityContext,
  ) => Promise<RecallValidationQualityAssessment[]>;
};

export type ValidateRecallLanesOptions = {
  searchId?: string | null;
  allowBright?: boolean;
  useLlmQualityJudge?: boolean;
  mode?: RecallLaneValidationMode;
  knownSnapshots?: KnownRecallSnapshot[];
  jdText?: string | null;
  parsedRequirements?: Record<string, unknown> | null;
  now?: () => Date;
};

export type RecallValidationQualityContext = {
  searchId: string | null;
  jdText: string | null;
  parsedRequirements: Record<string, unknown> | null;
  round: string;
};

export type RecallValidationQualityAssessment = {
  index: number;
  quality_label: RecallLaneValidationSample["quality_label"];
  quality_reasons: string[];
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

function normalizeToken(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?linkedin\.com\/in\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getProfileSlug(profile: BrightDataProfile) {
  const url = profile.url || profile.input?.url || "";
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : "";
}

function hasIdentityMismatch(profile: BrightDataProfile) {
  const slug = normalizeToken(getProfileSlug(profile));
  if (!slug) return false;
  const nameTokens = normalizeToken(profile.name)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  if (nameTokens.length === 0) return false;
  return !nameTokens.some((token) => {
    if (slug.includes(token)) return true;
    const prefixLength = Math.min(4, token.length);
    return prefixLength >= 4 && slug.includes(token.slice(0, prefixLength));
  });
}

function getLocation(profile: BrightDataProfile) {
  const city = profile.city?.trim();
  const country = profile.country_code?.trim();
  return [city, country].filter(Boolean).join(", ") || null;
}

export function classifyRecallValidationProfile(
  profile: BrightDataProfile,
): RecallLaneValidationSample["quality_label"] {
  return assessRecallValidationProfile(profile).label;
}

export function assessRecallValidationProfile(
  profile: BrightDataProfile,
): {
  label: RecallLaneValidationSample["quality_label"];
  reasons: string[];
} {
  const reasons: string[] = [];
  const identityMismatch = hasIdentityMismatch(profile);
  const hasCompany = Boolean(profile.current_company?.name);
  const hasCurrentTitle = Boolean(profile.current_company?.title || profile.headline);

  if (identityMismatch) reasons.push("profile_url_name_mismatch");
  if (!hasCompany) reasons.push("missing_current_company");
  if (!hasCurrentTitle) reasons.push("missing_current_title");
  if (!profile.headline && profile.skills.length === 0 && profile.experience.length === 0) {
    reasons.push("sparse_profile_evidence");
  }

  if (identityMismatch || !hasCompany || !hasCurrentTitle) {
    return { label: "likely_irrelevant", reasons };
  }

  reasons.push("needs_llm_quality_judge");
  return { label: "review", reasons };
}

function normalizeQualityLabel(value: unknown): RecallLaneValidationSample["quality_label"] {
  return value === "potential_advance" || value === "review" || value === "likely_irrelevant"
    ? value
    : "review";
}

function normalizeQualityReasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function truncateText(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

function profileQualityPromptText(profile: BrightDataProfile, index: number) {
  return [
    `[${index}] ${profile.name}`,
    `Headline: ${profile.headline ?? ""}`,
    `Current company: ${profile.current_company?.name ?? ""}`,
    `Current title: ${profile.current_company?.title ?? ""}`,
    `Location: ${getLocation(profile) ?? ""}`,
    `Skills: ${profile.skills.slice(0, 18).join(", ")}`,
    profile.about ? `About: ${truncateText(profile.about, 600)}` : "",
    profile.experience.length
      ? `Recent experience: ${profile.experience.slice(0, 3).map((item) =>
        [item.title, item.company, item.description ? truncateText(item.description, 240) : ""]
          .filter(Boolean)
          .join(" @ "),
      ).join(" | ")}`
      : "",
  ].filter(Boolean).join("\n");
}

export function buildRecallValidationQualityPrompt(params: {
  jdText: string | null;
  parsedRequirements: Record<string, unknown> | null;
  round: string;
  profiles: BrightDataProfile[];
}) {
  const requiredIndexes = params.profiles.map((_profile, index) => index);
  const parsedSummary = params.parsedRequirements
    ? JSON.stringify({
      title: params.parsedRequirements.title,
      hiring_brief: params.parsedRequirements.hiring_brief,
      recall_spec: params.parsedRequirements.recall_spec,
    }, null, 2)
    : "{}";
  return `You are a technical recruiting quality judge for a cheap recall-lane validation run.

The goal is not to deeply score every candidate. The goal is to decide whether this recall lane is bringing candidates a recruiter could realistically move forward.

Labels:
- potential_advance: strong enough that a technical recruiter would likely inspect or contact them next for this JD.
- review: plausible but missing important evidence, adjacent, or needs human/LLM deep scoring.
- likely_irrelevant: wrong function, wrong seniority, inactive/student-only, non-technical, or clearly off-JD.

Rules:
- Judge against the JD and parsed search intent, not against hard-coded keyword lists.
- Do not reject a profile only because it uses an adjacent title if the evidence shows equivalent work.
- Do not advance a profile on employer prestige, title, or target-company membership alone.
- Sparse profiles can be review, but potential_advance needs concrete evidence tied to the JD.
- Keep quality_reasons short and evidence-based; max 3 reasons.
- Return exactly ${params.profiles.length} assessment object${params.profiles.length === 1 ? "" : "s"}, one for every profile.
- Required index values: ${requiredIndexes.join(", ") || "none"}.
- Return only JSON with { "assessments": [...] }.

## Recall Round
${params.round}

## Original JD
${truncateText((params.jdText ?? "").trim(), 4000)}

## Parsed Search Intent
${truncateText(parsedSummary, 4000)}

## Profiles
${params.profiles.map((profile, index) => profileQualityPromptText(profile, index)).join("\n\n")}`;
}

export async function assessRecallValidationProfilesWithLlm(
  profiles: BrightDataProfile[],
  context: RecallValidationQualityContext,
): Promise<RecallValidationQualityAssessment[]> {
  if (profiles.length === 0) return [];
  const prompt = buildRecallValidationQualityPrompt({
    jdText: context.jdText,
    parsedRequirements: context.parsedRequirements,
    round: context.round,
    profiles,
  });
  const { data } = await generateLlmJson<{
    assessments?: Array<{
      index?: unknown;
      quality_label?: unknown;
      quality_reasons?: unknown;
    }>;
  }>({
    model: getLightweightLlmModel(),
    prompt,
    temperature: 0,
    maxOutputTokens: Math.min(1800, Math.max(600, profiles.length * 220)),
    jsonSchema: RECALL_VALIDATION_QUALITY_JSON_SCHEMA,
    requireParameters: true,
    deepSeekThinking: "disabled",
    usageEvent: {
      searchId: context.searchId ?? undefined,
      stage: "recall_validation_quality",
      batchSize: profiles.length,
      metadata: { round: context.round },
    },
  });
  return (data.assessments ?? [])
    .map((item): RecallValidationQualityAssessment | null => {
      const index = typeof item.index === "number" ? item.index : Number(item.index);
      if (!Number.isInteger(index) || index < 0 || index >= profiles.length) return null;
      return {
        index,
        quality_label: normalizeQualityLabel(item.quality_label),
        quality_reasons: normalizeQualityReasons(item.quality_reasons),
      };
    })
    .filter((item): item is RecallValidationQualityAssessment => Boolean(item));
}

function buildSampleProfiles(
  profiles: BrightDataProfile[],
  qualityByIndex: Map<number, RecallValidationQualityAssessment>,
  qualityJudgeAttempted: boolean,
): RecallLaneValidationSample[] {
  return profiles.slice(0, 5).map((profile, index) => {
    const fallback = assessRecallValidationProfile(profile);
    const assessment = qualityByIndex.get(index);
    const reasons = assessment?.quality_reasons.length
      ? assessment.quality_reasons
      : qualityJudgeAttempted
        ? ["llm_quality_judge_missing"]
        : fallback.reasons;
    return {
      index,
      name: profile.name,
      headline: profile.headline,
      company: profile.current_company?.name ?? null,
      title: profile.current_company?.title ?? null,
      location: getLocation(profile),
      profile_url: profile.url,
      quality_label: assessment?.quality_label ?? fallback.label,
      quality_reasons: reasons,
    };
  });
}

function buildRoundReport(params: {
  round: RecallRound;
  status: RecallLaneValidationStatus;
  filterHash: string;
  snapshotId: string | null;
  requestedOverride?: number | null;
  profiles: BrightDataProfile[];
  qualityAssessments: RecallValidationQualityAssessment[];
  qualityJudgeAttempted: boolean;
  globalSeenBeforeRound: Set<string>;
}) {
  const qualityByIndex = new Map(params.qualityAssessments.map((assessment) => [
    assessment.index,
    assessment,
  ]));
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
  const potentialAdvance = params.profiles.filter((_profile, index) =>
    qualityByIndex.get(index)?.quality_label === "potential_advance"
  ).length;
  const returnedRate = roundRate(returned, requested);
  const uniqueRate = roundRate(unique, returned);
  const potentialAdvanceRate = roundRate(potentialAdvance, returned);
  const duplicateCount = Math.max(0, returned - unique);
  const statusHasData =
    params.status === "cache_hit" ||
    params.status === "historical_snapshot" ||
    params.status === "downloaded_cache_snapshot" ||
    params.status === "submitted_micro";
  const badFilterSignal =
    statusHasData && returned === 0
      ? "returned_zero"
      : statusHasData && params.qualityJudgeAttempted && returned > 0 && params.qualityAssessments.length === 0
        ? "quality_judge_incomplete"
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
    sample_profiles: buildSampleProfiles(params.profiles, qualityByIndex, params.qualityJudgeAttempted),
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
  const historicalFilterMatches =
    !params.knownSnapshot?.filterHash ||
    params.knownSnapshot.filterHash === params.filterHash;
  if (params.knownSnapshot?.snapshotId && historicalFilterMatches) {
    const rows = await params.deps.loadCachedSnapshotProfiles(
      params.knownSnapshot.snapshotId,
      params.round.round,
      { fallbackAnyRound: true },
    );
    if (rows?.length) {
      return {
        status: "historical_snapshot",
        snapshotId: params.knownSnapshot.snapshotId,
        requestedOverride: params.knownSnapshot.recordsLimit,
        rows,
      };
    }
    if (params.allowBright && params.deps.downloadDatasetSnapshot) {
      try {
        const downloadedRows = await params.deps.downloadDatasetSnapshot(params.knownSnapshot.snapshotId);
        await params.deps.persistSnapshotProfiles?.(downloadedRows, {
          snapshotId: params.knownSnapshot.snapshotId,
          sourceRound: params.round.round,
        });
        return {
          status: "downloaded_cache_snapshot",
          snapshotId: params.knownSnapshot.snapshotId,
          requestedOverride: params.knownSnapshot.recordsLimit,
          rows: downloadedRows,
        };
      } catch {
        return {
          status: "download_failed",
          snapshotId: params.knownSnapshot.snapshotId,
          requestedOverride: params.knownSnapshot.recordsLimit,
          rows: [],
        };
      }
    }
  }

  const cached = await params.deps.lookupCachedSnapshot(params.filterHash);
  if (cached) {
    const rows = await params.deps.loadCachedSnapshotProfiles(
      cached.snapshotId,
      params.round.round,
      { fallbackAnyRound: true },
    );
    if (rows?.length) {
      return {
        status: "cache_hit",
        snapshotId: cached.snapshotId,
        rows,
      };
    }
    if (params.allowBright && params.deps.downloadDatasetSnapshot) {
      try {
        const downloadedRows = await params.deps.downloadDatasetSnapshot(cached.snapshotId);
        await params.deps.persistSnapshotProfiles?.(downloadedRows, {
          snapshotId: cached.snapshotId,
          sourceRound: params.round.round,
        });
        return {
          status: "downloaded_cache_snapshot",
          snapshotId: cached.snapshotId,
          rows: downloadedRows,
        };
      } catch {
        return {
          status: "download_failed",
          snapshotId: cached.snapshotId,
          rows: [],
        };
      }
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
    round.status === "downloaded_cache_snapshot" ||
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
  const useLlmQualityJudge = options.useLlmQualityJudge === true;
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
    const qualityJudgeAttempted = useLlmQualityJudge && profiles.length > 0;
    const qualityAssessments = qualityJudgeAttempted
      ? await (deps.assessProfileQuality ?? assessRecallValidationProfilesWithLlm)(profiles, {
        searchId: options.searchId ?? null,
        jdText: options.jdText ?? null,
        parsedRequirements: options.parsedRequirements ?? null,
        round: round.round,
      })
      : [];
    roundReports.push(buildRoundReport({
      round,
      status: resolved.status,
      filterHash,
      snapshotId: resolved.snapshotId,
      requestedOverride: resolved.requestedOverride,
      profiles,
      qualityAssessments,
      qualityJudgeAttempted,
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
