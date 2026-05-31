import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecruiterFacingGithubReadout,
  classifyActivityTrendFromWeeks,
  computeGithubSignalScore,
  enrichGithubSignalsForCandidate,
  evaluateCommitMessageQuality,
  extractGithubOwnerCandidateFromUrl,
  extractGitHubUrlsFromText,
  resetGithubApiRateLimitStateForTests,
} from "../src/lib/github-signals";
import { discoverGithubIdentity } from "../src/lib/github/discovery";
import {
  buildGithubIdentityJudgeMessages,
  GITHUB_IDENTITY_JUDGE_SYSTEM_PROMPT,
  shouldUseLlmIdentityJudge,
} from "../src/lib/github/identity-judge";
import { buildGithubHighlight } from "../src/lib/github/fetch";
import { extractPublicProfileLinks } from "../src/lib/github/public-links";

test("extractGitHubUrlsFromText returns unique GitHub profile URLs", () => {
  const urls = extractGitHubUrlsFromText(
    "Reach me at https://github.com/noah and mirror https://github.com/noah/",
  );

  assert.deepEqual(urls, ["https://github.com/noah"]);
});

test("extractPublicProfileLinks finds GitHub and portfolio links in nested profile data", () => {
  const links = extractPublicProfileLinks({
    about: "I write at https://example.dev and contribute at https://github.com/octocat.",
    experience: [
      {
        description: "Portfolio: www.alice.dev. StackOverflow: https://stackoverflow.com/users/123/alice",
      },
    ],
  });

  assert.deepEqual(links.github_urls, ["https://github.com/octocat"]);
  assert.ok(links.personal_sites.includes("https://example.dev"));
  assert.ok(links.personal_sites.includes("https://www.alice.dev"));
  assert.ok(links.developer_profiles[0]?.includes("stackoverflow.com"));
});

test("extractPublicProfileLinks ignores prose that only looks like dotted words", () => {
  const links = extractPublicProfileLinks({
    about: "Improved rate.additional latency and performance.languages in backend services.",
  });

  assert.deepEqual(links.github_urls, []);
  assert.deepEqual(links.personal_sites, []);
  assert.deepEqual(links.developer_profiles, []);
});

test("discoverGithubIdentity trusts explicit public link metadata before search", async () => {
  const discovery = await discoverGithubIdentity({
    name: "Octo Cat",
    metadata: {
      public_links: {
        github_urls: ["https://github.com/octocat"],
      },
    },
  });

  assert.equal(discovery.username, "octocat");
  assert.equal(discovery.source, "explicit_url");
  assert.equal(discovery.confidence, 0.98);
});

test("GitHub identity judge keeps a stable cache-friendly prompt prefix", () => {
  const first = buildGithubIdentityJudgeMessages({
    candidate: {
      name: "Venky Manicks",
      headline: "Engineering Manager at Google",
      requiredSkills: ["Search", "Distributed Systems"],
    },
    discovery: {
      username: "venkyman",
      url: "https://github.com/venkyman",
      confidence: 0.62,
      source: "external_search",
      notes: ["external_title_name_match"],
    },
    githubProfile: {
      login: "venkyman",
      url: "https://github.com/venkyman",
      name: "Venky Manicks",
      company: "Google",
      bio: "Search infrastructure",
      location: "California",
      blog: null,
    },
  });
  const second = buildGithubIdentityJudgeMessages({
    candidate: {
      name: "Simon Radford",
      headline: "Senior Software Engineer",
      requiredSkills: ["Kubernetes"],
    },
    discovery: {
      username: "simonrad",
      url: "https://github.com/simonrad",
      confidence: 0.59,
      source: "external_search",
      notes: ["external_title_name_match"],
    },
    githubProfile: {
      login: "simonrad",
      url: "https://github.com/simonrad",
      name: "Simon Radford",
      company: null,
      bio: null,
      location: null,
      blog: null,
    },
  });

  assert.equal(first[0]?.content, GITHUB_IDENTITY_JUDGE_SYSTEM_PROMPT);
  assert.equal(second[0]?.content, GITHUB_IDENTITY_JUDGE_SYSTEM_PROMPT);
  assert.match(first[1]?.content || "", /^CANDIDATE_AND_GITHUB_CONTEXT_JSON\n/);
});

test("shouldUseLlmIdentityJudge targets ambiguous discovered GitHub identities", () => {
  assert.equal(
    shouldUseLlmIdentityJudge({
      username: "maybe",
      url: "https://github.com/maybe",
      confidence: 0.62,
      source: "external_search",
      notes: [],
    }),
    true,
  );
  assert.equal(
    shouldUseLlmIdentityJudge({
      username: "octocat",
      url: "https://github.com/octocat",
      confidence: 0.98,
      source: "explicit_url",
      notes: [],
    }),
    false,
  );
  assert.equal(
    shouldUseLlmIdentityJudge({
      username: null,
      url: null,
      confidence: 0,
      source: "none",
      notes: [],
    }),
    false,
  );
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

test("buildGithubHighlight includes project context for merged PR evidence", () => {
  const highlight = buildGithubHighlight({
    username: "alice",
    activityTrend: "Stable contributor.",
    topLanguages: ["TypeScript"],
    repoSummaries: [],
    mergedPrSignals: {
      count: 1,
      highlights: [
        {
          repo: "elastic/kibana",
          repo_url: "https://github.com/elastic/kibana",
          repo_description: "Your window into the Elastic Stack",
          repo_primary_language: "TypeScript",
          repo_stargazers_count: 21200,
          repo_topics: ["search", "observability"],
          project_summary: "elastic/kibana (Your window into the Elastic Stack; TypeScript project; 21,200 stars; topics: search, observability)",
          title: "Fix ranking dashboard query",
          url: "https://github.com/elastic/kibana/pull/1",
        },
      ],
    },
  });

  assert.match(highlight, /Fix ranking dashboard query/);
  assert.match(highlight, /Elastic Stack/);
  assert.match(highlight, /21,200 stars/);
});

test("buildRecruiterFacingGithubReadout falls back to profile narrative when public evidence is not verified", () => {
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
  assert.match(readout.recruiterSummary, /profile fit/i);
  assert.match(readout.recruiterSummary, /public evidence deep dive/i);
  assert.ok(readout.verificationRisks.some((item) => /Public engineering evidence has not been researched/i.test(item)));
});

test("enrichGithubSignalsForCandidate cools down after GitHub rate limiting", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const resetAt = Math.floor((Date.now() + 120_000) / 1000);
  let callCount = 0;

  process.env.GITHUB_TOKEN = "test-token";
  resetGithubApiRateLimitStateForTests();
  globalThis.fetch = async () => {
    callCount += 1;
    return new Response(
      JSON.stringify({ message: "API rate limit exceeded" }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetAt),
        },
      },
    );
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetGithubApiRateLimitStateForTests();
    if (originalToken == null) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  const first = await enrichGithubSignalsForCandidate({
    name: "Octo Cat",
    githubUrl: "https://github.com/octocat",
    requiredSkills: [],
  });

  assert.equal(callCount, 1);
  assert.equal(first.githubSignals.status, "api_error");
  assert.equal(first.githubUrl, "https://github.com/octocat");
  assert.deepEqual(first.githubSignals.discovery_notes, ["api_rate_limited"]);
  assert.match(first.githubSignals.evidence_summary[1] || "", /rate limit/i);

  const second = await enrichGithubSignalsForCandidate({
    name: "Octo Cat",
    githubUrl: "https://github.com/octocat",
    requiredSkills: [],
  });

  assert.equal(callCount, 1);
  assert.deepEqual(second.githubSignals.discovery_notes, ["api_rate_limited"]);
});
