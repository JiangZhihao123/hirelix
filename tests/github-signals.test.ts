import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecruiterFacingGithubReadout,
  classifyActivityTrendFromWeeks,
  computeGithubSignalScore,
  evaluateCommitMessageQuality,
  extractGithubOwnerCandidateFromUrl,
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

test("extractGithubOwnerCandidateFromUrl resolves owners from profile, repo, and gist urls", () => {
  assert.equal(
    extractGithubOwnerCandidateFromUrl("https://github.com/gaearon"),
    "gaearon",
  );
  assert.equal(
    extractGithubOwnerCandidateFromUrl("https://github.com/gaearon/overreacted.io"),
    "gaearon",
  );
  assert.equal(
    extractGithubOwnerCandidateFromUrl("https://gist.github.com/gaearon/9e7f6"),
    "gaearon",
  );
  assert.equal(
    extractGithubOwnerCandidateFromUrl("https://github.com/topics/react"),
    null,
  );
});

test("buildRecruiterFacingGithubReadout produces recruiter-usable github summary", () => {
  const readout = buildRecruiterFacingGithubReadout({
    status: "verified",
    candidateName: "Dan Abramov",
    headline: "Software Engineer",
    currentCompany: null,
    requiredSkills: ["React", "JavaScript"],
    activityTrend: "Stable contributor across the last 12 months.",
    topLanguages: ["JavaScript", "TypeScript"],
    mergedPrCount: 4,
    commitMessageQuality: {
      label: "strong",
      detail: "Recent commit messages are mostly descriptive and specific.",
    },
    githubSignalScore: 74,
    highlight: 'gaearon has a merged PR in reactjs/react.dev titled "Improve docs search", which is a concrete open-source collaboration signal.',
    discoveryConfidence: 0.82,
    discoveryNotes: ["serper_fallback"],
  });

  assert.equal(readout.evidenceStrength, "strong");
  assert.match(readout.recruiterSummary, /worth contacting/i);
  assert.match(readout.outreachAngle, /Open with this proof point/i);
  assert.ok(readout.verificationRisks.length >= 1);
});

test("buildRecruiterFacingGithubReadout falls back to LinkedIn narrative when github is missing", () => {
  const readout = buildRecruiterFacingGithubReadout({
    status: "missing_public_data",
    candidateName: "A Candidate",
    headline: "Staff Backend Engineer at Example",
    currentCompany: "Example",
    requiredSkills: ["Node.js"],
    activityTrend: null,
    topLanguages: [],
    mergedPrCount: null,
    commitMessageQuality: {
      label: "unknown",
      detail: "No recent public commit messages available to sample.",
    },
    githubSignalScore: null,
    highlight: null,
    discoveryConfidence: 0,
  });

  assert.equal(readout.evidenceStrength, "none");
  assert.match(readout.recruiterSummary, /LinkedIn/i);
  assert.ok(readout.verificationRisks.some((item) => /GitHub/i.test(item)));
});
