import assert from "node:assert/strict";
import test from "node:test";

import {
  areOrderSwapDecisionsConsistent,
  buildConnectedComparisonPairs,
  fitDavidsonRanking,
  reciprocalRankFusion,
} from "@/lib/candidate-index/ranking";

test("RRF merges channels, deduplicates profiles, and uses deterministic ties", () => {
  const result = reciprocalRankFusion({
    profile_fts: ["b", "a", "a"],
    experience_fts: ["a", "c"],
    profile_vector: ["a", "b"],
  });
  assert.deepEqual(result.map((item) => item.profileId), ["a", "b", "c"]);
  assert.equal(result[0].channelCount, 3);
  assert.equal(result[0].channelRanks.profile_fts, 2);
});

test("comparison pairing is connected, bounded, unique, and deterministic", () => {
  const ids = Array.from({ length: 20 }, (_, index) => `p${index}`);
  const pairs = buildConnectedComparisonPairs(ids, { seed: "search-1" });
  assert.equal(pairs.length, 50);
  assert.equal(new Set(pairs.map((pair) => pair.pairKey)).size, pairs.length);
  const reached = new Set([pairs[0].a]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const pair of pairs) {
      if (reached.has(pair.a) && !reached.has(pair.b)) { reached.add(pair.b); changed = true; }
      if (reached.has(pair.b) && !reached.has(pair.a)) { reached.add(pair.a); changed = true; }
    }
  }
  assert.equal(reached.size, ids.length);
  assert.deepEqual(pairs, buildConnectedComparisonPairs(ids, { seed: "search-1" }));
});

test("order swap consistency distinguishes a stable winner from position bias", () => {
  assert.equal(areOrderSwapDecisionsConsistent("a", "b"), true);
  assert.equal(areOrderSwapDecisionsConsistent("a", "a"), false);
  assert.equal(areOrderSwapDecisionsConsistent("tie", "tie"), true);
  assert.equal(areOrderSwapDecisionsConsistent("tie", "a"), false);
});

test("Davidson ranking handles decisive results and ties", () => {
  const ranking = fitDavidsonRanking(
    ["strong", "middle", "weak"],
    [
      { a: "strong", b: "middle", outcome: "a" },
      { a: "strong", b: "weak", outcome: "a" },
      { a: "middle", b: "weak", outcome: "a" },
      { a: "strong", b: "middle", outcome: "tie" },
    ],
    { bootstrapRounds: 20, seed: "test" },
  );
  assert.deepEqual(ranking.map((item) => item.profileId), ["strong", "middle", "weak"]);
  assert.ok(ranking.every((item) => item.rankLow >= 1 && item.rankHigh <= 3));
});
