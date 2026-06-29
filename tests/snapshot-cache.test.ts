import test from "node:test";
import assert from "node:assert/strict";
import { getSnapshotCacheTtlDays } from "../src/lib/search/persistence";
import {
  canAdditionalRecallRoundsOwnEmptyStandardSnapshot,
  getRecallReadyProfileThreshold,
  isRecallFilterHashDuplicateForRound,
  mergeRecallIterations,
  shouldCountAdaptiveActionAsNewRound,
  shouldContinueScoringWithStandardRecall,
  shouldFailUnderfilledRecallAfterSubmittedRounds,
  shouldTimeoutAdditionalRecallBeforeScoring,
  shouldWaitForAdditionalRecallBeforeScoring,
  shouldWaitForAdditionalRecallBeforeZeroRecall,
  shouldReuseProfileCacheDespiteSnapshotDrift,
} from "../src/lib/search/pipeline";

const mutableEnv = process.env as Record<string, string | undefined>;

test("getSnapshotCacheTtlDays defaults to the conservative Bright Data window", () => {
  const original = process.env.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS;
  delete mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS;

  assert.equal(getSnapshotCacheTtlDays(), 14);

  if (original === undefined) {
    delete mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS;
  } else {
    mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS = original;
  }
});

test("getSnapshotCacheTtlDays honors positive overrides and caps stale windows", () => {
  const original = process.env.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS;

  mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS = "7";
  assert.equal(getSnapshotCacheTtlDays(), 7);

  mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS = "90";
  assert.equal(getSnapshotCacheTtlDays(), 30);

  mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS = "0";
  assert.equal(getSnapshotCacheTtlDays(), 14);

  if (original === undefined) {
    delete mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS;
  } else {
    mutableEnv.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS = original;
  }
});

test("retry keeps existing snapshot profile cache even when recall metadata drifts", () => {
  assert.equal(
    shouldReuseProfileCacheDespiteSnapshotDrift({
      hasSnapshotDrift: true,
      existingSnapshotId: "snap_existing",
      standardProfileRowCount: 50,
    }),
    true,
  );

  assert.equal(
    shouldReuseProfileCacheDespiteSnapshotDrift({
      hasSnapshotDrift: true,
      existingSnapshotId: "snap_existing",
      standardProfileRowCount: 0,
    }),
    false,
  );

  assert.equal(
    shouldReuseProfileCacheDespiteSnapshotDrift({
      hasSnapshotDrift: false,
      existingSnapshotId: "snap_existing",
      standardProfileRowCount: 50,
    }),
    false,
  );
});

test("explicit pool expansion does not reuse a smaller cached snapshot", () => {
  assert.equal(
    shouldReuseProfileCacheDespiteSnapshotDrift({
      hasSnapshotDrift: true,
      existingSnapshotId: "snap_existing",
      standardProfileRowCount: 50,
      allowReuse: false,
    }),
    false,
  );
});

test("cache-only rerun allows additional recall to own an empty standard snapshot", () => {
  assert.equal(
    canAdditionalRecallRoundsOwnEmptyStandardSnapshot([{ status: "ready" }]),
    true,
  );

  assert.equal(
    canAdditionalRecallRoundsOwnEmptyStandardSnapshot([{ status: "scheduled" }]),
    true,
  );

  assert.equal(
    canAdditionalRecallRoundsOwnEmptyStandardSnapshot([{ status: "building" }]),
    true,
  );
});

test("cache-only rerun does not hide missing additional profile rows", () => {
  assert.equal(
    canAdditionalRecallRoundsOwnEmptyStandardSnapshot([]),
    false,
  );

  assert.equal(
    canAdditionalRecallRoundsOwnEmptyStandardSnapshot([{ status: "failed" }]),
    false,
  );
});

test("recall ready threshold caps the recruiter-quality minimum", () => {
  assert.equal(getRecallReadyProfileThreshold(250), 100);
  assert.equal(getRecallReadyProfileThreshold(50), 50);
});

test("standard recall waits while submitted additional rounds are still pending", () => {
  assert.equal(
    shouldContinueScoringWithStandardRecall({
      standardProfileCount: 100,
      deferredAdditionalRoundCount: 5,
      requestedProfileCount: 250,
    }),
    false,
  );
});

test("standard recall can proceed once submitted additional rounds are resolved", () => {
  assert.equal(
    shouldContinueScoringWithStandardRecall({
      standardProfileCount: 100,
      deferredAdditionalRoundCount: 0,
      requestedProfileCount: 250,
    }),
    true,
  );
});

test("underfilled standard recall waits for pending additional rounds", () => {
  assert.equal(
    shouldContinueScoringWithStandardRecall({
      standardProfileCount: 16,
      deferredAdditionalRoundCount: 1,
      requestedProfileCount: 250,
    }),
    false,
  );
});

test("underfilled recall fails after all submitted rounds are exhausted", () => {
  assert.equal(
    shouldFailUnderfilledRecallAfterSubmittedRounds({
      availableProfileCount: 66,
      deferredAdditionalRoundCount: 0,
      requestedProfileCount: 250,
    }),
    true,
  );

  assert.equal(
    shouldFailUnderfilledRecallAfterSubmittedRounds({
      availableProfileCount: 66,
      deferredAdditionalRoundCount: 1,
      requestedProfileCount: 250,
    }),
    false,
  );
});

test("headhunter recall lets lane audit decide underfilled probe quality", () => {
  assert.equal(
    shouldFailUnderfilledRecallAfterSubmittedRounds({
      availableProfileCount: 50,
      deferredAdditionalRoundCount: 0,
      requestedProfileCount: 250,
      recallStrategyMode: "headhunter_v1",
    }),
    false,
  );
});

test("headhunter recall does not fail a 90 of 130 partial pool", () => {
  assert.equal(
    shouldFailUnderfilledRecallAfterSubmittedRounds({
      availableProfileCount: 90,
      deferredAdditionalRoundCount: 0,
      requestedProfileCount: 130,
      recallStrategyMode: "headhunter_v1",
    }),
    false,
  );
});

test("legacy recall still fails a 90 of 130 underfilled pool", () => {
  assert.equal(
    shouldFailUnderfilledRecallAfterSubmittedRounds({
      availableProfileCount: 90,
      deferredAdditionalRoundCount: 0,
      requestedProfileCount: 130,
      recallStrategyMode: "legacy",
    }),
    true,
  );
});

test("recall iteration merge preserves audit by filter hash", () => {
  const merged = mergeRecallIterations(
    [
      {
        iteration: 1,
        lane: "adaptive_b1_1_revise_lane_standard",
        lane_kind: "primary_exact",
        budget: 20,
        snapshot_id: "snap_adaptive",
        filter_hash: "same-filter",
        audit: {
          decision: "revise",
          quality_grade: "C",
          summary: "Needs tighter backend evidence.",
        },
        continue_expansion: false,
      },
    ],
    [
      {
        iteration: 2,
        lane: "standard",
        lane_kind: "primary_exact",
        budget: 20,
        snapshot_id: "snap_adaptive",
        filter_hash: "same-filter",
        audit: null,
        continue_expansion: null,
      },
    ],
  );

  assert.equal(merged[0]?.audit?.decision, "revise");
  assert.equal(merged[0]?.audit?.quality_grade, "C");
  assert.equal(merged[0]?.continue_expansion, false);
});

test("adaptive retry does not treat its own submitted filter hash as duplicate", () => {
  const usedHashes = new Map<string, string>([
    ["base-standard", "standard"],
    ["submitted-adaptive", "adaptive_b1_1_revise_lane_standard"],
  ]);

  assert.equal(
    isRecallFilterHashDuplicateForRound(
      usedHashes,
      "submitted-adaptive",
      "adaptive_b1_1_revise_lane_standard",
    ),
    false,
  );
  assert.equal(
    isRecallFilterHashDuplicateForRound(
      usedHashes,
      "base-standard",
      "adaptive_b1_2_revise_lane_primary_relaxed",
    ),
    true,
  );
  assert.equal(
    isRecallFilterHashDuplicateForRound(usedHashes, "brand-new-adaptive"),
    false,
  );
});

test("submitted adaptive snapshot is tracked without consuming a new-round slot", () => {
  assert.equal(
    shouldCountAdaptiveActionAsNewRound({
      status: "planned",
      snapshotId: null,
    }),
    true,
  );
  assert.equal(
    shouldCountAdaptiveActionAsNewRound({
      status: "submitted",
      snapshotId: "snap_existing_adaptive",
    }),
    false,
  );
  assert.equal(
    shouldCountAdaptiveActionAsNewRound({
      status: "done",
      snapshotId: "snap_existing_adaptive",
    }),
    false,
  );
});

test("additional rounds still matter when standard recall has no profiles", () => {
  assert.equal(
    shouldContinueScoringWithStandardRecall({
      standardProfileCount: 0,
      deferredAdditionalRoundCount: 2,
      requestedProfileCount: 250,
    }),
    false,
  );
});

test("zero standard recall waits when an additional round download is still pending", () => {
  assert.equal(
    shouldWaitForAdditionalRecallBeforeZeroRecall({
      standardProfileCount: 0,
      availableProfileCount: 0,
      deferredAdditionalRoundCount: 1,
    }),
    true,
  );

  assert.equal(
    shouldWaitForAdditionalRecallBeforeZeroRecall({
      standardProfileCount: 0,
      availableProfileCount: 4,
      deferredAdditionalRoundCount: 1,
    }),
    false,
  );
});

test("underfilled recall waits when a ready additional round download is still pending", () => {
  assert.equal(
    shouldWaitForAdditionalRecallBeforeScoring({
      standardProfileCount: 5,
      availableProfileCount: 5,
      metadataDeferredRoundCount: 0,
      downloadDeferredRoundCount: 1,
      requestedProfileCount: 250,
    }),
    true,
  );
});

test("sufficient standard recall waits when only additional download is pending", () => {
  assert.equal(
    shouldWaitForAdditionalRecallBeforeScoring({
      standardProfileCount: 100,
      availableProfileCount: 100,
      metadataDeferredRoundCount: 0,
      downloadDeferredRoundCount: 1,
      requestedProfileCount: 250,
    }),
    true,
  );
});

test("full standard recall still waits when a submitted additional download is pending", () => {
  assert.equal(
    shouldWaitForAdditionalRecallBeforeScoring({
      standardProfileCount: 150,
      availableProfileCount: 150,
      metadataDeferredRoundCount: 0,
      downloadDeferredRoundCount: 1,
      requestedProfileCount: 250,
    }),
    true,
  );
});

test("additional recall wait times out instead of polling forever", () => {
  assert.equal(
    shouldTimeoutAdditionalRecallBeforeScoring({
      metadataDeferredRoundCount: 1,
      downloadDeferredRoundCount: 0,
      elapsedMs: 900_000,
      timeoutMs: 900_000,
    }),
    true,
  );

  assert.equal(
    shouldTimeoutAdditionalRecallBeforeScoring({
      metadataDeferredRoundCount: 0,
      downloadDeferredRoundCount: 1,
      elapsedMs: 899_999,
      timeoutMs: 900_000,
    }),
    false,
  );
});
