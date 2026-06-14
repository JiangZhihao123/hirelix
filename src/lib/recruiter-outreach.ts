type GithubSignalsLike = {
  status?: string | null;
  highlight?: string | null;
  recruiter_summary?: string | null;
  outreach_angle?: string | null;
  evidence_strength?: string | null;
  evidence_summary?: string[];
};

type PublicEvidenceLike = {
  status?: string | null;
  items?: Array<{
    citation_label?: string | null;
    evidence_summary?: string | null;
    outreach_angle?: string | null;
    evidence_strength?: string | null;
    selling_tier?: string | null;
    source_type?: string | null;
    safe_to_use_in_outreach?: boolean | null;
    claim_limit?: string | null;
  }>;
};

type SellingKitLike = {
  one_line_pitch?: string | null;
  outreach_opener?: string | null;
  client_brief?: {
    evidence_refs?: string[];
    risks_to_verify?: string[];
  } | null;
};

type RecruiterOutreachCandidate = {
  name: string;
  headline?: string | null;
  location?: string | null;
  skills?: string[];
  matchReasons?: string[];
  githubSignals?: unknown;
  publicEvidence?: unknown;
  sellingKit?: unknown;
};

export type RecruiterOutreachEvidence = {
  evidenceSource: "public_evidence" | "github" | "linkedin";
  evidenceSourceLabel: "Candidate Research" | "GitHub" | "LinkedIn";
  recruiterSummary: string;
  outreachAngle: string;
  proofToReference: string;
  evidenceStrength: string;
  proofConfidence: "verified" | "supported" | "weak";
  approvedFacts: string[];
  cautions: string[];
};

function normalizeText(value: string | null | undefined) {
  return (value || "").trim();
}

function joinNonEmpty(items: Array<string | null | undefined>) {
  return items.map((item) => normalizeText(item)).filter(Boolean);
}

function extractGithubSignals(value: unknown): GithubSignalsLike | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    status: typeof item.status === "string" ? item.status : null,
    highlight: typeof item.highlight === "string" ? item.highlight : null,
    recruiter_summary: typeof item.recruiter_summary === "string" ? item.recruiter_summary : null,
    outreach_angle: typeof item.outreach_angle === "string" ? item.outreach_angle : null,
    evidence_strength: typeof item.evidence_strength === "string" ? item.evidence_strength : null,
    evidence_summary: Array.isArray(item.evidence_summary)
      ? item.evidence_summary.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function extractPublicEvidence(value: unknown): PublicEvidenceLike | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    status: typeof item.status === "string" ? item.status : null,
    items: Array.isArray(item.items)
      ? item.items
          .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
          .map((entry) => ({
            citation_label: typeof entry.citation_label === "string" ? entry.citation_label : null,
            evidence_summary: typeof entry.evidence_summary === "string" ? entry.evidence_summary : null,
            outreach_angle: typeof entry.outreach_angle === "string" ? entry.outreach_angle : null,
            evidence_strength: typeof entry.evidence_strength === "string" ? entry.evidence_strength : null,
            selling_tier: typeof entry.selling_tier === "string" ? entry.selling_tier : null,
            source_type: typeof entry.source_type === "string" ? entry.source_type : null,
            safe_to_use_in_outreach:
              typeof entry.safe_to_use_in_outreach === "boolean"
                ? entry.safe_to_use_in_outreach
                : null,
            claim_limit: typeof entry.claim_limit === "string" ? entry.claim_limit : null,
          }))
      : [],
  };
}

function extractSellingKit(value: unknown): SellingKitLike | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const clientBrief = item.client_brief && typeof item.client_brief === "object"
    ? item.client_brief as Record<string, unknown>
    : null;
  return {
    one_line_pitch: typeof item.one_line_pitch === "string" ? item.one_line_pitch : null,
    outreach_opener: typeof item.outreach_opener === "string" ? item.outreach_opener : null,
    client_brief: clientBrief
      ? {
          evidence_refs: Array.isArray(clientBrief.evidence_refs)
            ? clientBrief.evidence_refs.filter((entry): entry is string => typeof entry === "string")
            : [],
          risks_to_verify: Array.isArray(clientBrief.risks_to_verify)
            ? clientBrief.risks_to_verify.filter((entry): entry is string => typeof entry === "string")
            : [],
        }
      : null,
  };
}

function headlineLooksConcrete(headline: string) {
  const normalized = normalizeText(headline).toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("at ")) return false;
  if (normalized.startsWith("former ")) return true;
  return normalized.includes("engineer") || normalized.includes("developer") || normalized.includes("architect");
}

function reasonIsBoilerplate(reason: string) {
  const normalized = normalizeText(reason).toLowerCase();
  if (!normalized) return true;
  return [
    "still looks worth reviewing",
    "profile fit worth reviewing",
    "run candidate research",
    "looks worth contacting",
    "no public github evidence was verified",
    "public engineering evidence has not been researched",
    "github supports the linkedin story",
    "location fits",
    "location in ",
    "timezone requirement",
  ].some((phrase) => normalized.includes(phrase));
}

function reasonIsInferenceHeavy(reason: string) {
  const normalized = normalizeText(reason).toLowerCase();
  if (!normalized) return false;
  return [
    "suggests ",
    "likely ",
    "appears ",
    "may ",
    "potential ",
    "unclear ",
    "seems ",
    "implied ",
  ].some((phrase) => normalized.includes(phrase));
}

function reasonIsAffiliationOnly(reason: string) {
  const normalized = normalizeText(reason).toLowerCase();
  if (!normalized) return false;
  return [
    "current ",
    "employee",
    "payments domain",
    "top payments domain",
    "current title may be below",
    "location in ",
  ].some((phrase) => normalized.includes(phrase));
}

function buildLinkedInEvidence(params: RecruiterOutreachCandidate): RecruiterOutreachEvidence {
  const normalizedReasons = (params.matchReasons || []).map((item) => normalizeText(item)).filter(Boolean);
  const concreteReason =
    normalizedReasons.find((reason) => !reasonIsBoilerplate(reason) && !reasonIsInferenceHeavy(reason) && !reasonIsAffiliationOnly(reason)) || null;
  const supportedReason =
    normalizedReasons.find((reason) => !reasonIsBoilerplate(reason)) || null;
  const headlineFact = headlineLooksConcrete(params.headline || "") ? normalizeText(params.headline) : null;
  const skillsFact =
    params.skills && params.skills.length > 0
      ? `Profile skills include ${params.skills.slice(0, 2).join(" and ")}.`
      : null;
  const locationFact = params.location ? `Profile location is ${params.location}.` : null;
  const approvedFacts = joinNonEmpty([
    concreteReason,
    headlineFact,
    concreteReason ? supportedReason : null,
    skillsFact,
    locationFact,
  ]).slice(0, 4);
  const proofToReference =
    concreteReason ||
    headlineFact ||
    skillsFact ||
    supportedReason ||
    "Their LinkedIn background looks relevant to the role.";
  const proofConfidence =
    concreteReason || headlineFact
      ? "supported"
      : supportedReason || skillsFact
        ? "weak"
        : "weak";

  return {
    evidenceSource: "linkedin",
    evidenceSourceLabel: "LinkedIn",
    recruiterSummary:
      `${params.name} looks worth contacting from LinkedIn evidence, even without verified public GitHub proof.`,
    outreachAngle:
      proofConfidence === "supported"
        ? "Lead with the most concrete LinkedIn career detail and connect it to the role."
        : "Lead with one cautious LinkedIn detail that caught your eye, and avoid overstating the fit.",
    proofToReference,
    evidenceStrength: proofConfidence === "supported" ? "medium" : "none",
    proofConfidence,
    approvedFacts,
    cautions: [
      "Mention only details that are explicitly supported by the approved facts.",
      "Do not turn likely or inferred experience into confirmed facts.",
      "Do not claim the candidate built, led, or owned specific systems unless an approved fact says so.",
      ...(proofConfidence === "weak"
        ? ["Use cautious language such as 'caught my eye', 'may be relevant', or 'seems aligned'."]
        : []),
    ],
  };
}

function truncateForPrompt(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function humanizeProofForTemplate(proof: string) {
  const normalized = normalizeText(proof).replace(/[.]+$/, "");
  if (!normalized) return "your profile";
  if (normalized.startsWith("Current ") && normalized.includes("Stripe")) {
    return "your Stripe background caught my eye";
  }
  if (normalized.startsWith("Profile skills include ")) {
    return `your profile mentions ${normalized.slice("Profile skills include ".length)}`;
  }
  if (normalized.startsWith("Profile location is ")) {
    return normalized;
  }
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

export function buildRecruiterOutreachEvidence(
  params: RecruiterOutreachCandidate,
): RecruiterOutreachEvidence {
  const sellingKit = extractSellingKit(params.sellingKit);
  const publicEvidence = extractPublicEvidence(params.publicEvidence);
  const topPublicEvidence = publicEvidence?.items?.find((item) =>
    item.safe_to_use_in_outreach === true &&
    (item.selling_tier === "strong_selling_point" || item.selling_tier === "supporting_point") &&
    Boolean(item.evidence_summary),
  );
  if (topPublicEvidence) {
    const citation = topPublicEvidence.citation_label || "[1]";
    const proof = `${citation} ${topPublicEvidence.evidence_summary}`;
    return {
      evidenceSource: "public_evidence",
      evidenceSourceLabel: "Candidate Research",
      recruiterSummary:
        normalizeText(sellingKit?.one_line_pitch) ||
        normalizeText(topPublicEvidence.evidence_summary) ||
        `${params.name} has recruiter-usable public engineering proof.`,
      outreachAngle:
        normalizeText(sellingKit?.outreach_opener) ||
        normalizeText(topPublicEvidence.outreach_angle) ||
        `Open with ${proof}.`,
      proofToReference: proof,
      evidenceStrength: normalizeText(topPublicEvidence.evidence_strength) || "medium",
      proofConfidence: "verified",
      approvedFacts: joinNonEmpty([
        proof,
        normalizeText(topPublicEvidence.claim_limit),
        ...(sellingKit?.client_brief?.evidence_refs || []),
      ]).slice(0, 5),
      cautions: [
        "Use only the research evidence listed in approved facts.",
        "Do not use identity-only sources as engineering proof.",
        "Do not imply the candidate solely owned a paper, product, or project unless the evidence explicitly says so.",
        ...(sellingKit?.client_brief?.risks_to_verify || []),
      ].slice(0, 6),
    };
  }

  const githubSignals = extractGithubSignals(params.githubSignals);
  if (githubSignals?.status === "verified") {
    return {
      evidenceSource: "github",
      evidenceSourceLabel: "GitHub",
      recruiterSummary:
        normalizeText(githubSignals.recruiter_summary) ||
        `${params.name} has recruiter-usable public GitHub proof.`,
      outreachAngle:
        normalizeText(githubSignals.outreach_angle) ||
        "Lead with the strongest concrete GitHub proof point.",
      proofToReference:
        normalizeText(githubSignals.highlight) ||
        normalizeText(githubSignals.evidence_summary?.[0]) ||
        "Public GitHub contribution evidence exists.",
      evidenceStrength: normalizeText(githubSignals.evidence_strength) || "medium",
      proofConfidence: "verified",
      approvedFacts: joinNonEmpty([
        normalizeText(githubSignals.highlight),
        normalizeText(githubSignals.recruiter_summary),
      ]),
      cautions: [
        "Use GitHub proof as an engineering credibility signal, not automatic proof of domain expertise.",
        "Do not claim payments or industry depth unless the GitHub proof itself supports it.",
      ],
    };
  }

  return buildLinkedInEvidence(params);
}

export function buildRecruiterOutreachPrompt(params: {
  jdText: string;
  roleTitle: string;
  candidate: RecruiterOutreachCandidate;
}) {
  const firstName = params.candidate.name.split(/\s+/).filter(Boolean)[0] || "there";
  const evidence = buildRecruiterOutreachEvidence(params.candidate);
  const approvedFacts =
    evidence.approvedFacts.length > 0
      ? evidence.approvedFacts.map((fact) => `- ${fact}`).join("\n")
      : "- No concrete fact is available beyond general profile relevance.";
  const cautionFacts = evidence.cautions.map((item) => `- ${item}`).join("\n");

  return `You are a third-party headhunter writing outreach on behalf of a client company. You must NEVER reveal the client company name. Refer to the opportunity as "one of my clients" or describe the company type (e.g. "a Series B fintech", "a fast-growing infrastructure startup"). Sign off as the recruiter, not the company. Build intrigue so the candidate wants to learn more, not like they are being mass-emailed.

## Job Description (confidential client role)
${truncateForPrompt(params.jdText.trim(), 4000)}

## Role Summary
Title: ${params.roleTitle}

## Candidate
Name: ${params.candidate.name}
Headline: ${params.candidate.headline || "Professional"}
Location: ${params.candidate.location || "Unknown"}
Skills: ${params.candidate.skills?.slice(0, 8).join(", ") || "Unknown"}
Research basis: ${evidence.evidenceSourceLabel}
Evidence strength: ${evidence.evidenceStrength}
Evidence confidence: ${evidence.proofConfidence}
Recruiter summary: ${evidence.recruiterSummary}
Proof to reference: ${evidence.proofToReference}
Outreach angle: ${evidence.outreachAngle}

## Approved facts
${approvedFacts}

## Cautions
${cautionFacts}

## Task
Return ONLY valid JSON with this exact shape:
{
  "subject": "string",
  "linkedin": "string",
  "email": "string"
}

Rules:
- Write from the perspective of a third-party headhunter, not an in-house recruiter.
- Never name or hint at the client company. Use "one of my clients" or a generic descriptor (stage, industry, team size).
- Make both drafts specific to this person and this role.
- You must reference the proof line above. Do not ignore it.
- Mention only facts that are explicitly supported by the proof line or approved facts.
- Never turn inferred fit, likely experience, or role requirements into confirmed candidate facts.
- Do not use company affiliation, domain association, or role title alone to claim the candidate built or led a specific system.
- If evidence confidence is "weak", use cautious language such as "caught my eye", "may be relevant", or "seems aligned".
- Avoid phrases like "perfect match", "aligns perfectly", or "extensive experience" unless the proof explicitly supports them.
- If research basis is Candidate Research, cite the proof naturally but do not include bracket labels unless they read cleanly.
- Never use identity-only public sources as engineering proof.
- If the evidence source is GitHub, keep the message anchored in that concrete code, project, or PR detail.
- If the evidence source is GitHub, use it as an engineering credibility signal only. Do not infer payments or domain expertise unless the proof itself shows it.
- If the evidence source is LinkedIn, use one concrete career detail instead of inventing GitHub proof.
- Keep the LinkedIn InMail under 80 words and casual.
- Keep the email body under 120 words and slightly more formal.
- Both drafts must start with "Hi ${firstName},"
- No markdown. No code fences. No extra keys.`;
}

export function buildDeterministicWeakEvidenceOutreachDraft(params: {
  firstName: string;
  roleTitle: string;
  evidence: RecruiterOutreachEvidence;
  hasEmail: boolean;
}) {
  const firstName = params.firstName || "there";
  const subject = `${params.roleTitle} opportunity`;
  const proof = humanizeProofForTemplate(params.evidence.proofToReference);
  const linkedin =
    `Hi ${firstName}, I noticed ${proof} and thought there may be overlap with a ${params.roleTitle} search I'm running for one of my clients. ` +
    "Open to a quick chat?";
  const email =
    `Hi ${firstName}, I noticed ${proof} and thought there may be overlap with a ${params.roleTitle} search I'm running for one of my clients. ` +
    "If you're open to a brief conversation, I'd be happy to share a bit more context.\n\nBest regards";

  return {
    subject,
    linkedin,
    ...(params.hasEmail ? { email } : {}),
  };
}
