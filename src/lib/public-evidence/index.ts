import { applyGithubSignalsToCandidateRow, enrichGithubSignalsForCandidate } from "@/lib/github-signals";
import { discoverPublicEvidenceSources } from "./discovery";
import { buildPublicEvidenceSnapshots, extractPublicEvidenceItems } from "./extract";
import {
  buildCandidateSellingKit,
  classifyPublicEvidenceForSelling,
  getSellableEvidenceItems,
} from "./selling-kit";
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
  const sellableItems = getSellableEvidenceItems(items.map((item) => classifyPublicEvidenceForSelling(item)));
  if (!sellableItems.length) return null;
  const strengthBonus = { strong: 18, medium: 10, weak: 3 };
  return Math.min(
    100,
    Math.round(
      sellableItems.slice(0, 5).reduce((sum, item) =>
        sum + (item.relevance_score || 0) * 0.18 + strengthBonus[
          item.evidence_strength === "strong" ||
          item.evidence_strength === "medium" ||
          item.evidence_strength === "weak"
            ? item.evidence_strength
            : "weak"
        ],
      0),
    ),
  );
}

export function buildPublicEvidenceMetadata(result: PublicEvidenceResult) {
  return {
    status: result.status,
    score: result.score,
    items: result.items.slice(0, 5).map((item, index) => {
      const classified = classifyPublicEvidenceForSelling(item);
      return {
        citation_label: `[${index + 1}]`,
        source_type: classified.source_type,
        source_url: classified.source_url,
        title: classified.title,
        identity_confidence: classified.identity_confidence,
        relevance_score: classified.relevance_score,
        evidence_strength: classified.evidence_strength,
        evidence_summary: classified.evidence_summary,
        outreach_angle: classified.outreach_angle,
        publication:
          item.sourceType === "paper" && item.rawMetadata.publication
            ? item.rawMetadata.publication
            : undefined,
        evidence_category: classified.evidence_category,
        selling_tier: classified.selling_tier,
        safe_to_use_in_outreach: classified.safe_to_use_in_outreach,
        safe_to_use_in_client_brief: classified.safe_to_use_in_client_brief,
        claim_limit: classified.claim_limit,
      };
    }),
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
  metadata.selling_kit = buildCandidateSellingKit({
    name: input.name,
    headline: input.headline,
    matchScore: typeof input.metadata?.match_score === "number" ? input.metadata.match_score : null,
    matchReasons: Array.isArray(input.metadata?.match_reasons)
      ? input.metadata.match_reasons.filter((item): item is string => typeof item === "string")
      : [],
    displayTier: typeof input.metadata?.display_tier === "string" ? input.metadata.display_tier : null,
    bucket: typeof input.metadata?.bucket === "string" ? input.metadata.bucket : null,
    riskFlags: Array.isArray(input.metadata?.risk_flags)
      ? input.metadata.risk_flags.filter((item): item is string => typeof item === "string")
      : [],
    publicEvidenceItems: (metadata.public_evidence as { items?: unknown[] }).items as never,
    fallbackSummary: result.summary,
  });
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
