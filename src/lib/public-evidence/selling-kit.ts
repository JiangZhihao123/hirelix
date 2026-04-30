import type { PublicEvidenceItem, PublicEvidenceSourceType } from "./types";

export type EvidenceCategory =
  | "engineering_proof"
  | "official_project_credit"
  | "research_publication"
  | "technical_writing"
  | "package_or_tool"
  | "identity_support"
  | "risk_only";

export type EvidenceSellingTier =
  | "strong_selling_point"
  | "supporting_point"
  | "identity_only"
  | "not_usable";

export type EvidenceBadgeTier = "strong" | "medium" | "weak";

export type ClassifiedEvidenceItem = {
  citation_label?: string | null;
  source_type?: PublicEvidenceSourceType | string | null;
  source_url?: string | null;
  title?: string | null;
  identity_confidence?: number | null;
  relevance_score?: number | null;
  evidence_strength?: "strong" | "medium" | "weak" | string | null;
  evidence_summary?: string | null;
  outreach_angle?: string | null;
  publication?: {
    title?: string | null;
    venue?: string | null;
    year?: string | null;
    authors?: string[];
    citation_count?: number | null;
  } | null;
  evidence_category?: EvidenceCategory;
  selling_tier?: EvidenceSellingTier;
  safe_to_use_in_outreach?: boolean;
  safe_to_use_in_client_brief?: boolean;
  claim_limit?: string | null;
};

export type CandidateSellingKit = {
  version: 1;
  recommendation: "reach_out_first" | "backup" | "do_not_pitch";
  one_line_pitch: string;
  outreach_opener: string | null;
  client_brief: {
    positioning: string;
    why_match: string[];
    evidence_refs: string[];
    risks_to_verify: string[];
  };
  evidence_badges: Array<{
    label: string;
    tier: EvidenceBadgeTier;
    citation_label?: string | null;
  }>;
  risk_flags: string[];
  generated_at: string;
};

export type SellingKitCandidateInput = {
  name: string;
  headline?: string | null;
  matchScore?: number | null;
  matchReasons?: string[];
  displayTier?: string | null;
  bucket?: string | null;
  riskFlags?: string[];
  publicEvidenceItems?: ClassifiedEvidenceItem[];
  fallbackSummary?: string | null;
};

function sourceLabel(sourceType: string | null | undefined) {
  switch (sourceType) {
    case "github":
      return "GitHub";
    case "company_engineering_blog":
      return "Engineering blog";
    case "official_project_credit":
      return "Official project";
    case "paper":
      return "Paper";
    case "technical_blog":
      return "Technical writing";
    case "package_registry":
      return "Package";
    case "talk":
      return "Talk";
    case "portfolio":
      return "Portfolio";
    case "other_professional":
      return "Identity";
    default:
      return "Public evidence";
  }
}

function clean(value: string | null | undefined) {
  return (value || "").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function evidenceStrength(value: unknown): "strong" | "medium" | "weak" {
  return value === "strong" || value === "medium" || value === "weak" ? value : "weak";
}

function badgeTierForSellingTier(tier: EvidenceSellingTier): EvidenceBadgeTier {
  if (tier === "strong_selling_point") return "strong";
  if (tier === "supporting_point") return "medium";
  return "weak";
}

export function classifyPublicEvidenceForSelling(
  item: ClassifiedEvidenceItem | PublicEvidenceItem,
): ClassifiedEvidenceItem {
  const sourceType = "sourceType" in item ? item.sourceType : item.source_type;
  const sourceUrl = "sourceUrl" in item ? item.sourceUrl : item.source_url;
  const title = item.title || null;
  const identityConfidence =
    "identityConfidence" in item ? item.identityConfidence : item.identity_confidence;
  const relevanceScore =
    "relevanceScore" in item ? item.relevanceScore : item.relevance_score;
  const strength = evidenceStrength(
    "evidenceStrength" in item ? item.evidenceStrength : item.evidence_strength,
  );
  const evidenceSummary =
    "evidenceSummary" in item ? item.evidenceSummary : item.evidence_summary;
  const outreachAngle =
    "outreachAngle" in item ? item.outreachAngle : item.outreach_angle;
  const rawPublication =
    "rawMetadata" in item && item.rawMetadata && typeof item.rawMetadata.publication === "object"
      ? item.rawMetadata.publication as ClassifiedEvidenceItem["publication"]
      : "publication" in item
        ? item.publication
        : null;

  let evidenceCategory: EvidenceCategory = "risk_only";
  let sellingTier: EvidenceSellingTier = "not_usable";
  let claimLimit = "Do not use this source as a candidate selling point.";

  if (sourceType === "other_professional") {
    evidenceCategory = "identity_support";
    sellingTier = "identity_only";
    claimLimit = "Use only to support identity, current role, or affiliation.";
  } else if (sourceType === "paper") {
    evidenceCategory = "research_publication";
    sellingTier = strength === "strong" ? "strong_selling_point" : "supporting_point";
    claimLimit = "Use as research publication evidence only when authorship and affiliation are verified.";
  } else if (sourceType === "github") {
    evidenceCategory = "engineering_proof";
    sellingTier = strength === "strong" ? "strong_selling_point" : "supporting_point";
    claimLimit = "Use as public code or open-source collaboration evidence.";
  } else if (sourceType === "official_project_credit") {
    evidenceCategory = "official_project_credit";
    sellingTier = strength === "weak" ? "supporting_point" : "strong_selling_point";
    claimLimit = "Use as official product or project credit, not proof of sole ownership.";
  } else if (sourceType === "company_engineering_blog") {
    evidenceCategory = "engineering_proof";
    sellingTier = strength === "weak" ? "supporting_point" : "strong_selling_point";
    claimLimit = "Use as official engineering evidence tied to the article or post.";
  } else if (sourceType === "package_registry") {
    evidenceCategory = "package_or_tool";
    sellingTier = strength === "weak" ? "supporting_point" : "strong_selling_point";
    claimLimit = "Use as package, library, or developer tooling evidence.";
  } else if (sourceType === "technical_blog" || sourceType === "talk" || sourceType === "portfolio") {
    evidenceCategory = sourceType === "technical_blog" ? "technical_writing" : "engineering_proof";
    sellingTier = strength === "strong" ? "strong_selling_point" : "supporting_point";
    claimLimit = "Use as public technical communication or project evidence.";
  } else if (sourceType === "personal_site") {
    evidenceCategory = "identity_support";
    sellingTier = strength === "strong" && Number(relevanceScore || 0) >= 75
      ? "supporting_point"
      : "identity_only";
    claimLimit = sellingTier === "supporting_point"
      ? "Use only for concrete facts shown on the personal site."
      : "Use only as identity or profile support.";
  }

  const safeToUse = sellingTier === "strong_selling_point" || sellingTier === "supporting_point";

  return {
    ...("sourceType" in item
      ? {}
      : item),
    citation_label: "citation_label" in item ? item.citation_label : null,
    source_type: sourceType || null,
    source_url: sourceUrl || null,
    title,
    publication: rawPublication || null,
    identity_confidence: typeof identityConfidence === "number" ? identityConfidence : null,
    relevance_score: typeof relevanceScore === "number" ? relevanceScore : null,
    evidence_strength: strength,
    evidence_summary: clean(evidenceSummary) || null,
    outreach_angle: clean(outreachAngle) || null,
    evidence_category: evidenceCategory,
    selling_tier: sellingTier,
    safe_to_use_in_outreach: safeToUse,
    safe_to_use_in_client_brief: safeToUse,
    claim_limit: claimLimit,
  };
}

export function getSellableEvidenceItems(items: ClassifiedEvidenceItem[] | null | undefined) {
  return (items || [])
    .map((item) => item.selling_tier ? item : classifyPublicEvidenceForSelling(item))
    .filter((item) =>
      item.selling_tier === "strong_selling_point" ||
      item.selling_tier === "supporting_point",
    );
}

export function buildCandidateSellingKit(input: SellingKitCandidateInput): CandidateSellingKit {
  const items = (input.publicEvidenceItems || []).map((item) =>
    item.selling_tier ? item : classifyPublicEvidenceForSelling(item),
  );
  const sellableItems = getSellableEvidenceItems(items);
  const topEvidence = sellableItems[0] || null;
  const matchReasons = (input.matchReasons || []).map(clean).filter(Boolean);
  const riskFlags = [...(input.riskFlags || [])];
  const identityOnlyCount = items.filter((item) => item.selling_tier === "identity_only").length;
  const notUsableCount = items.filter((item) => item.selling_tier === "not_usable").length;
  if (identityOnlyCount > 0 && sellableItems.length === 0) {
    riskFlags.push("Only identity-supporting public sources were found.");
  }
  if (notUsableCount > 0) {
    riskFlags.push("Some public results were excluded because identity or authorship was not strong enough.");
  }

  const recommendation =
    input.displayTier === "priority_outreach" || input.bucket === "strong_now" || Number(input.matchScore || 0) >= 80
      ? "reach_out_first"
      : input.displayTier === "worth_reviewing" || input.bucket === "consider_next" || Number(input.matchScore || 0) >= 65
        ? "backup"
        : "do_not_pitch";

  const headline = clean(input.headline);
  const fallbackPitch =
    clean(input.fallbackSummary) ||
    matchReasons[0] ||
    headline ||
    `${input.name} has a potentially relevant LinkedIn background.`;
  const topEvidenceSummary = clean(topEvidence?.evidence_summary);
  const linkedInPitch = matchReasons[0] || headline;
  const oneLinePitch = topEvidenceSummary && linkedInPitch
    ? truncate(`${linkedInPitch.replace(/\.$/, "")} + ${topEvidenceSummary.replace(/\.$/, "")}`, 110)
    : topEvidenceSummary
      ? truncate(topEvidenceSummary.replace(/\.$/, ""), 110)
      : truncate(fallbackPitch.replace(/\.$/, ""), 110);
  const outreachOpener = topEvidence?.outreach_angle
    ? clean(topEvidence.outreach_angle)
    : topEvidenceSummary
      ? `Open with ${topEvidence.citation_label || "[1]"}: ${topEvidenceSummary}`
      : null;
  const positioning = topEvidenceSummary
    ? `${input.name} is easiest to pitch around ${topEvidenceSummary.charAt(0).toLowerCase()}${topEvidenceSummary.slice(1)}`
    : `${input.name} should be pitched from LinkedIn/profile fit until stronger public engineering evidence is verified.`;
  const evidenceRefs = sellableItems.slice(0, 3).map((item, index) => {
    const citation = item.citation_label || `[${index + 1}]`;
    return `${citation} ${clean(item.evidence_summary) || sourceLabel(item.source_type)}`;
  });
  const whyMatch = [
    ...matchReasons.slice(0, 2),
    ...evidenceRefs.slice(0, 2),
  ].filter(Boolean).slice(0, 3);
  const evidenceBadges = items
    .filter((item) => item.selling_tier !== "not_usable")
    .slice(0, 4)
    .map((item) => ({
      label: item.selling_tier === "identity_only"
        ? `${sourceLabel(item.source_type)} only`
        : sourceLabel(item.source_type),
      tier: badgeTierForSellingTier(item.selling_tier || "not_usable"),
      citation_label: item.citation_label || null,
    }));

  return {
    version: 1,
    recommendation,
    one_line_pitch: oneLinePitch,
    outreach_opener: outreachOpener,
    client_brief: {
      positioning,
      why_match: whyMatch.length > 0 ? whyMatch : [fallbackPitch],
      evidence_refs: evidenceRefs,
      risks_to_verify: riskFlags.slice(0, 4),
    },
    evidence_badges: evidenceBadges,
    risk_flags: riskFlags.slice(0, 5),
    generated_at: new Date().toISOString(),
  };
}
