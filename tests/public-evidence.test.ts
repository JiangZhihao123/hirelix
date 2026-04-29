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
  assert.equal(classifyPublicEvidenceSource("https://openreview.net/forum?id=abc"), "paper");
  assert.equal(classifyPublicEvidenceSource("https://aclanthology.org/2024.acl-long.1/"), "paper");
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
  assert.ok(queries.some((query) => query.includes("site:arxiv.org")));
  assert.ok(queries.some((query) => query.includes("site:openreview.net")));
  assert.ok(queries.some((query) => query.includes("site:dblp.org")));
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
      {
        sourceType: "paper",
        sourceUrl: "https://arxiv.org/abs/2401.00001",
        title: "Learning to Rank",
        snippet: "Alice Example, 2024",
        identityStatus: "verified",
        identityConfidence: 0.94,
        relevanceScore: 80,
        evidenceStrength: "strong",
        evidenceSummary: "Alice co-authored a relevant search ranking paper.",
        outreachAngle: "Open with the ranking paper.",
        rawMetadata: {
          publication: {
            title: "Learning to Rank",
            venue: "arXiv",
            year: "2024",
            authors: ["Alice Example"],
            citation_count: 12,
          },
        },
      },
    ],
  });

  assert.equal(metadata.status, "verified");
  assert.equal(metadata.items[0]?.citation_label, "[1]");
  assert.equal(metadata.items[1]?.citation_label, "[2]");
  assert.equal(metadata.items[0]?.source_type, "package_registry");
  assert.equal(metadata.items[0]?.relevance_score, 88);
  assert.deepEqual(metadata.items[1]?.publication, {
    title: "Learning to Rank",
    venue: "arXiv",
    year: "2024",
    authors: ["Alice Example"],
    citation_count: 12,
  });
});
