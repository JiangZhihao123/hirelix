import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicEvidenceQueries } from "../src/lib/public-evidence/discovery";
import {
  classifyPublicEvidenceSearchResult,
  classifyPublicEvidenceSource,
  normalizeEvidenceUrl,
} from "../src/lib/public-evidence/sources";
import { buildPublicEvidenceMetadata } from "../src/lib/public-evidence";
import {
  buildCandidateSellingKit,
  classifyPublicEvidenceForSelling,
} from "../src/lib/public-evidence/selling-kit";

test("classifyPublicEvidenceSource recognizes public engineering evidence sources", () => {
  assert.equal(classifyPublicEvidenceSource("https://github.com/octocat"), "github");
  assert.equal(classifyPublicEvidenceSource("https://www.npmjs.com/package/react"), "package_registry");
  assert.equal(classifyPublicEvidenceSource("https://pypi.org/project/fastapi/"), "package_registry");
  assert.equal(classifyPublicEvidenceSource("https://medium.com/@alice/search-ranking"), "technical_blog");
  assert.equal(classifyPublicEvidenceSource("https://arxiv.org/abs/2401.00001"), "paper");
  assert.equal(classifyPublicEvidenceSource("https://openreview.net/forum?id=abc"), "paper");
  assert.equal(classifyPublicEvidenceSource("https://aclanthology.org/2024.acl-long.1/"), "paper");
  assert.equal(classifyPublicEvidenceSource("https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p771.pdf"), "paper");
  assert.equal(classifyPublicEvidenceSource("https://speakerdeck.com/alice/kubernetes"), "talk");
  assert.equal(classifyPublicEvidenceSource("https://www.zoominfo.com/p/Alice-Example/123"), "other_professional");
  assert.equal(classifyPublicEvidenceSource("https://rocketreach.co/alice-email_123"), "other_professional");
  assert.equal(classifyPublicEvidenceSource("https://me.sh/profile/alice-example"), "other_professional");
  assert.equal(classifyPublicEvidenceSource("https://openai.com/index/sora-2"), "official_project_credit");
  assert.equal(classifyPublicEvidenceSource("https://engineering.linkedin.com/blog/post"), "company_engineering_blog");
});

test("classifyPublicEvidenceSearchResult treats academic PDFs as paper evidence", () => {
  assert.equal(
    classifyPublicEvidenceSearchResult({
      url: "https://example.edu/proceedings/paper.pdf",
      title: "[PDF] Causal Explanations for Sequential Decision-Making",
      snippet: "Proceedings paper by Alice Example.",
    }),
    "paper",
  );
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
  assert.ok(queries.some((query) => query === '"Alex Forsyth" site:arxiv.org'));
  assert.ok(queries.some((query) => query === '"Alex Forsyth" site:openreview.net'));
  assert.ok(queries.some((query) => query === '"Alex Forsyth" site:dblp.org'));
  assert.ok(queries.some((query) => query === '"Alex Forsyth" filetype:pdf paper'));
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
  assert.equal(metadata.items[0]?.selling_tier, "strong_selling_point");
  assert.equal(metadata.items[1]?.evidence_category, "research_publication");
});

test("classifyPublicEvidenceForSelling downgrades identity aggregators", () => {
  const item = classifyPublicEvidenceForSelling({
    source_type: "other_professional",
    source_url: "https://rocketreach.co/alice",
    title: "Alice Example",
    evidence_summary: "Alice is listed as Senior Engineer at Example.",
    evidence_strength: "strong",
    relevance_score: 90,
  });

  assert.equal(item.selling_tier, "identity_only");
  assert.equal(item.safe_to_use_in_outreach, false);
  assert.equal(item.evidence_category, "identity_support");
});

test("classifyPublicEvidenceForSelling models official project credits separately", () => {
  const item = classifyPublicEvidenceForSelling({
    source_type: "official_project_credit",
    source_url: "https://openai.com/index/sora-2",
    title: "Sora 2",
    evidence_summary: "OpenAI's official Sora 2 page credits Mick as part of the project team.",
    evidence_strength: "strong",
    relevance_score: 88,
  });

  assert.equal(item.evidence_category, "official_project_credit");
  assert.equal(item.selling_tier, "strong_selling_point");
  assert.equal(item.safe_to_use_in_client_brief, true);
  assert.match(item.claim_limit || "", /not proof of sole ownership/i);
});

test("buildCandidateSellingKit creates recruiter selling material from strong evidence", () => {
  const kit = buildCandidateSellingKit({
    name: "Alex Forsyth",
    headline: "Senior Software Engineer at Google",
    matchScore: 88,
    matchReasons: ["Search/NLU background at Google."],
    displayTier: "priority_outreach",
    publicEvidenceItems: [
      {
        citation_label: "[1]",
        source_type: "company_engineering_blog",
        source_url: "https://aws.amazon.com/blogs/developer/sdk",
        evidence_summary: "AWS official blog lists Alex as a JavaScript and TypeScript SDK maintainer.",
        outreach_angle: "Open with the AWS SDK maintainer proof.",
        evidence_strength: "strong",
        relevance_score: 90,
        selling_tier: "strong_selling_point",
        safe_to_use_in_outreach: true,
        safe_to_use_in_client_brief: true,
      },
    ],
  });

  assert.equal(kit.recommendation, "reach_out_first");
  assert.match(kit.one_line_pitch, /AWS official blog/);
  assert.match(kit.outreach_opener || "", /AWS SDK/);
  assert.deepEqual(kit.client_brief.evidence_refs, [
    "[1] AWS official blog lists Alex as a JavaScript and TypeScript SDK maintainer.",
  ]);
});
