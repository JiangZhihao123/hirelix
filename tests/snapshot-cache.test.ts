import test from "node:test";
import assert from "node:assert/strict";
import { getSnapshotCacheTtlDays } from "../src/lib/search/persistence";
import {
  canAdditionalRecallRoundsOwnEmptyStandardSnapshot,
  shouldContinueScoringWithStandardRecall,
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

test("standard recall can proceed to scoring while additional rounds are still pending", () => {
  assert.equal(
    shouldContinueScoringWithStandardRecall({
      standardProfileCount: 69,
      deferredAdditionalRoundCount: 5,
    }),
    true,
  );
});

test("additional rounds still matter when standard recall has no profiles", () => {
  assert.equal(
    shouldContinueScoringWithStandardRecall({
      standardProfileCount: 0,
      deferredAdditionalRoundCount: 2,
    }),
    false,
  );
});
