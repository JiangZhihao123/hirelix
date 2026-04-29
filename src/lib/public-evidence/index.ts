import { applyGithubSignalsToCandidateRow, enrichGithubSignalsForCandidate } from "@/lib/github-signals";
import { discoverPublicEvidenceSources } from "./discovery";
import { buildPublicEvidenceSnapshots, extractPublicEvidenceItems } from "./extract";
import type { PublicEvidenceCandidateInput, PublicEvidenceItem, PublicEvidenceResult } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function sourceCounts(items: PublicEvidenceItem[]) {
  return items.reduce<PublicEvidenceResult["sourceCounts"]>((acc, item) => {
    acc[item.sourceType] = (acc[item.sourceType] || 0) + 1;
    return acc;
  }, {});
}

function computePublicEvidenceScore(items: PublicEvidenceItem[]) {
  if (!items.length) return null;
  const strengthBonus = { strong: 18, medium: 10, weak: 3 };
  return Math.min(
    100,
    Math.round(
      items.slice(0, 5).reduce((sum, item) =>
        sum + item.relevanceScore * 0.18 + strengthBonus[item.evidenceStrength],
      0),
    ),
  );
}

export function buildPublicEvidenceMetadata(result: PublicEvidenceResult) {
  return {
    status: result.status,
    score: result.score,
    items: result.items.slice(0, 5).map((item) => ({
      source_type: item.sourceType,
      source_url: item.sourceUrl,
      title: item.title,
      identity_confidence: item.identityConfidence,
      relevance_score: item.relevanceScore,
      evidence_strength: item.evidenceStrength,
      evidence_summary: item.evidenceSummary,
      outreach_angle: item.outreachAngle,
    })),
    source_counts: result.sourceCounts,
    summary: result.summary,
    last_enriched_at: result.lastEnrichedAt,
  };
}

export async function enrichPublicEvidenceForCandidate(input: PublicEvidenceCandidateInput) {
  const githubEnrichment = await enrichGithubSignalsForCandidate({
    name: input.name,
    headline: input.headline,
    location: input.location,
    profileUrl: input.profileUrl,
    githubUrl: input.githubUrl,
    metadata: input.metadata,
    requiredSkills: input.requiredSkills,
    searchId: input.searchId,
    userId: input.userId,
  });

  const sources = await discoverPublicEvidenceSources(input);
  const snapshots = await buildPublicEvidenceSnapshots(sources);
  const extractedItems = await extractPublicEvidenceItems({ candidate: input, snapshots });
  const githubItem: PublicEvidenceItem | null =
    githubEnrichment.githubSignals.status === "verified" && githubEnrichment.githubUrl
      ? {
          sourceType: "github",
          sourceUrl: githubEnrichment.githubUrl,
          title: githubEnrichment.githubSignals.profile_login,
          snippet: githubEnrichment.githubSignals.recruiter_summary,
          identityStatus: "verified",
          identityConfidence: githubEnrichment.githubDiscoveryConfidence,
          relevanceScore: Math.max(35, githubEnrichment.githubSignalScore || 0),
          evidenceStrength: githubEnrichment.githubSignals.evidence_strength === "none"
            ? "weak"
            : githubEnrichment.githubSignals.evidence_strength,
          evidenceSummary:
            githubEnrichment.githubSignals.highlight ||
            githubEnrichment.githubSignals.recruiter_summary ||
            "Verified GitHub profile found.",
          outreachAngle: githubEnrichment.githubSignals.outreach_angle,
          rawMetadata: { github_signals: githubEnrichment.githubSignals },
        }
      : null;
  const items = [
    ...(githubItem ? [githubItem] : []),
    ...extractedItems.filter((item) => item.sourceUrl !== githubEnrichment.githubUrl),
  ]
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, 8);
  const score = computePublicEvidenceScore(items);
  const result: PublicEvidenceResult = {
    status: items.length > 0 ? "verified" : sources.length > 0 ? "partial" : "missing",
    score,
    items,
    sourceCounts: sourceCounts(items),
    summary: items[0]?.evidenceSummary || null,
    lastEnrichedAt: nowIso(),
  };

  const metadata = { ...(input.metadata || {}) };
  metadata.public_evidence = buildPublicEvidenceMetadata(result);
  const githubApplied = applyGithubSignalsToCandidateRow({
    candidate: {
      match_score: 0,
      match_reasons: [],
      github_url: input.githubUrl || null,
      metadata,
    },
    enrichment: githubEnrichment,
  });
  return {
    result,
    githubEnrichment,
    metadata: githubApplied.metadata,
    githubUrl: githubApplied.github_url,
  };
}
