import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQueuedGithubMetadata,
  extractRequiredSkillsForGithub,
  shouldQueueGithubEnrichment,
} from "../src/lib/github-enrichment-jobs";

test("extractRequiredSkillsForGithub merges search requirements for GitHub scoring", () => {
  const skills = extractRequiredSkillsForGithub({
    hiring_brief: {
      role_core: {
        required_skills: ["Search", "Kubernetes"],
        nice_to_have_skills: ["Vector search", "Search"],
      },
    },
    recall_spec: {
      core_skill_terms: ["Distributed Systems"],
      differentiating_skill_terms: ["Ranking"],
    },
  });

  assert.deepEqual(skills, [
    "Search",
    "Kubernetes",
    "Vector search",
    "Distributed Systems",
    "Ranking",
  ]);
});

test("shouldQueueGithubEnrichment skips terminal GitHub statuses", () => {
  assert.equal(
    shouldQueueGithubEnrichment({ github_signals: { status: "verified" } }),
    false,
  );
  assert.equal(
    shouldQueueGithubEnrichment({ github_signals: { status: "missing_public_data" } }),
    false,
  );
  assert.equal(
    shouldQueueGithubEnrichment({ github_signals: { status: "queued" } }),
    true,
  );
  assert.equal(shouldQueueGithubEnrichment({}), true);
});

test("buildQueuedGithubMetadata preserves existing GitHub profile hints", () => {
  const metadata = buildQueuedGithubMetadata({
    metadata: {
      github_signals: {
        profile_url: "https://github.com/example",
      },
    },
    candidate: {
      id: "candidate-1",
      name: "Example Candidate",
      headline: "Staff Backend Engineer",
      github_url: "https://github.com/example",
    },
    searchId: "search-1",
    userId: "user-1",
  });

  assert.equal((metadata.github_signals as Record<string, unknown>).status, "queued");
  assert.equal(
    (metadata.github_signals as Record<string, unknown>).profile_url,
    "https://github.com/example",
  );
  assert.equal((metadata.github_enrichment as Record<string, unknown>).status, "queued");
  assert.equal(
    (metadata.github_enrichment as Record<string, unknown>).candidate_id,
    "candidate-1",
  );
});
