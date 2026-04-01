type GithubSignalsLike = {
  status?: string | null;
  highlight?: string | null;
  recruiter_summary?: string | null;
  outreach_angle?: string | null;
  evidence_strength?: string | null;
  evidence_summary?: string[];
};

type RecruiterOutreachCandidate = {
  name: string;
  headline?: string | null;
  location?: string | null;
  skills?: string[];
  matchReasons?: string[];
  githubSignals?: unknown;
};

export type RecruiterOutreachEvidence = {
  evidenceSource: "github" | "linkedin";
  evidenceSourceLabel: "GitHub" | "LinkedIn";
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
    "looks worth contacting",
    "no public github evidence was verified",
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

function buildLinkedInEvidence(params: RecruiterOutreachCandidate): RecruiterOutreachEvidence {
  const normalizedReasons = (params.matchReasons || []).map((item) => normalizeText(item)).filter(Boolean);
  const concreteReason =
    normalizedReasons.find((reason) => !reasonIsBoilerplate(reason) && !reasonIsInferenceHeavy(reason)) || null;
  const supportedReason =
    normalizedReasons.find((reason) => !reasonIsBoilerplate(reason)) || null;
  const headlineFact = headlineLooksConcrete(params.headline || "") ? normalizeText(params.headline) : null;
  const skillsFact =
    params.skills && params.skills.length > 0
      ? `Profile skills include ${params.skills.slice(0, 2).join(" and ")}.`
      : null;
  const locationFact = params.location ? `Profile location is ${params.location}.` : null;
  const approvedFacts = joinNonEmpty([concreteReason, headlineFact, supportedReason, skillsFact, locationFact]).slice(0, 4);
  const proofToReference =
    concreteReason ||
    headlineFact ||
    supportedReason ||
    skillsFact ||
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
      ...(proofConfidence === "weak"
        ? ["Use cautious language such as 'caught my eye', 'may be relevant', or 'seems aligned'."]
        : []),
    ],
  };
}

function truncateForPrompt(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function buildRecruiterOutreachEvidence(
  params: RecruiterOutreachCandidate,
): RecruiterOutreachEvidence {
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
Match reasons: ${params.candidate.matchReasons?.slice(0, 3).join("; ") || "Strong fit for the role"}
Evidence source: ${evidence.evidenceSourceLabel}
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
- If evidence confidence is "weak", use cautious language such as "caught my eye", "may be relevant", or "seems aligned".
- Avoid phrases like "perfect match", "aligns perfectly", or "extensive experience" unless the proof explicitly supports them.
- If the evidence source is GitHub, keep the message anchored in that concrete code, project, or PR detail.
- If the evidence source is GitHub, use it as an engineering credibility signal only. Do not infer payments or domain expertise unless the proof itself shows it.
- If the evidence source is LinkedIn, use one concrete career detail instead of inventing GitHub proof.
- Keep the LinkedIn InMail under 80 words and casual.
- Keep the email body under 120 words and slightly more formal.
- Both drafts must start with "Hi ${firstName},"
- No markdown. No code fences. No extra keys.`;
}

export function buildFallbackOutreachDraft(params: {
  firstName: string;
  roleTitle: string;
  evidence: RecruiterOutreachEvidence;
  hasEmail: boolean;
}) {
  const firstName = params.firstName || "there";
  const subject = `${params.roleTitle} opportunity`;
  const opener = `Hi ${firstName},`;
  const overlapLine =
    params.evidence.proofConfidence === "weak"
      ? "and thought there may be overlap with a search I'm running for one of my clients."
      : "and thought it could translate well to a search I'm running for one of my clients.";
  const body = `${opener} one thing that caught my eye was ${params.evidence.proofToReference} I'm working on a ${params.roleTitle} role ${overlapLine} Open to a quick chat?`;

  return {
    subject,
    linkedin: body,
    ...(params.hasEmail
      ? {
          email: `${body}\n\nBest regards`,
        }
      : {}),
  };
}
