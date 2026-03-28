import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyActivityTrendFromWeeks,
  computeGithubSignalScore,
  evaluateCommitMessageQuality,
  extractGitHubUrlsFromText,
} from "../src/lib/github-signals.ts";

test("extractGitHubUrlsFromText returns unique GitHub profile URLs", () => {
  const urls = extractGitHubUrlsFromText(
    "Reach me at https://github.com/noah and mirror https://github.com/noah/",
  );

  assert.deepEqual(urls, ["https://github.com/noah"]);
});

test("classifyActivityTrendFromWeeks detects stable contribution patterns", () => {
  const days = Array.from({ length: 56 }, (_, index) => ({
    date: `2025-01-${String((index % 28) + 1).padStart(2, "0")}`,
    contributionCount: 2,
  }));

  assert.equal(
    classifyActivityTrendFromWeeks(days),
    "Stable contributor across the last 12 months.",
  );
});

test("evaluateCommitMessageQuality flags generic commit messages as weak", () => {
  const quality = evaluateCommitMessageQuality(["fix", "update", "wip", "misc"]);

  assert.equal(quality.label, "weak");
});

test("computeGithubSignalScore rewards overlapping stack and collaboration", () => {
  const score = computeGithubSignalScore({
    requiredSkills: ["TypeScript", "React"],
    activityTrend: "Stable contributor across the last 12 months.",
    topLanguages: ["TypeScript", "JavaScript"],
    mergedPrCount: 6,
    commitMessageQuality: {
      label: "strong",
      detail: "Recent commit messages are mostly descriptive and specific.",
    },
  });

  assert.ok(score >= 70);
});
