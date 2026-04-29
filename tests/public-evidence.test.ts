import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicEvidenceQueries } from "../src/lib/public-evidence/discovery";
import { classifyPublicEvidenceSource, normalizeEvidenceUrl } from "../src/lib/public-evidence/sources";
import { buildPublicEvidenceMetadata } from "../src/lib/public-evidence";

test("classifyPublicEvidenceSource recognizes public engineering evidence sources", () => {
  assert.equal(classifyPublicEvidenceSource("https://github.com/octocat"), "github");
  assert.equal(classifyPublicEvidenceSource("https://www.npmjs.com/package/react"), "package_registry");
  assert.equal(classifyPublicEvidenceSource("https://pypi.org/project/fastapi/"), "package_registry");
  assert.equal(classifyPublicEvidenceSource("https://medium.com/@alice/search-ranking"), "technical_blog");
  assert.equal(classifyPublicEvidenceSource("https://arxiv.org/abs/2401.00001"), "paper");
  assert.equal(classifyPublicEvidenceSource("https://speakerdeck.com/alice/kubernetes"), "talk");
  assert.equal(classifyPublicEvidenceSource("https://engineering.linkedin.com/blog/post"), "company_engineering_blog");
});

test("normalizeEvidenceUrl removes unstable fragments and trailing slashes", () => {
  assert.equal(
    normalizeEvidenceUrl("https://example.com/projects/#section"),
    "https://example.com/projects",
  );
});

test("buildPublicEvidenceQueries includes company, role, skills, and broad source searches", () => {
  const queries = buildPublicEvidenceQueries({
    candidateId: "candidate-1",
    searchId: "search-1",
    userId: "user-1",
    name: "Alex Forsyth",
    headline: "Staff Software Engineer at Google",
    requiredSkills: ["Search", "Kubernetes"],
    metadata: {
      work_history: [{ company: "Google" }],
    },
  });

  assert.ok(queries.some((query) => query.includes('"Alex Forsyth" "Google"')));
  assert.ok(queries.some((query) => query.includes('"Alex Forsyth" "Search" GitHub')));
  assert.ok(queries.some((query) => query.includes("site:npmjs.com")));
});

test("buildPublicEvidenceMetadata keeps compact top evidence for candidate metadata", () => {
  const metadata = buildPublicEvidenceMetadata({
    status: "verified",
    score: 82,
    summary: "Alice maintains a relevant search package.",
    sourceCounts: { package_registry: 1 },
    lastEnrichedAt: "2026-05-01T00:00:00.000Z",
    items: [
      {
        sourceType: "package_registry",
        sourceUrl: "https://www.npmjs.com/package/search-tools",
        title: "search-tools",
        snippet: "Package by Alice",
        identityStatus: "verified",
        identityConfidence: 0.91,
        relevanceScore: 88,
        evidenceStrength: "strong",
        evidenceSummary: "Alice maintains a package that is directly relevant to search infrastructure.",
        outreachAngle: "Open with the package.",
        rawMetadata: {},
      },
    ],
  });

  assert.equal(metadata.status, "verified");
  assert.equal(metadata.items[0]?.citation_label, "[1]");
  assert.equal(metadata.items[0]?.source_type, "package_registry");
  assert.equal(metadata.items[0]?.relevance_score, 88);
});
