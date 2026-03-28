type GithubSignalsLike = {
  status?: string | null;
  highlight?: string | null;
  recruiter_summary?: string | null;
  outreach_angle?: string | null;
  evidence_strength?: string | null;
  evidence_summary?: string[];
};

export type RecruiterOutreachEvidence = {
  evidenceSource: "github" | "linkedin";
  evidenceSourceLabel: "GitHub" | "LinkedIn";
  recruiterSummary: string;
  outreachAngle: string;
  proofToReference: string;
  evidenceStrength: string;
};

function normalizeText(value: string | null | undefined) {
  return (value || "").trim();
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

export function buildRecruiterOutreachEvidence(params: {
  candidateName: string;
  headline?: string | null;
  skills?: string[];
  matchReasons?: string[];
  githubSignals?: unknown;
}): RecruiterOutreachEvidence {
  const githubSignals = extractGithubSignals(params.githubSignals);
  if (githubSignals?.status === "verified") {
    return {
      evidenceSource: "github",
      evidenceSourceLabel: "GitHub",
      recruiterSummary:
        normalizeText(githubSignals.recruiter_summary) ||
        `${params.candidateName} has recruiter-usable public GitHub proof.`,
      outreachAngle:
        normalizeText(githubSignals.outreach_angle) ||
        "Lead with the strongest concrete GitHub proof point.",
      proofToReference:
        normalizeText(githubSignals.highlight) ||
        normalizeText(githubSignals.evidence_summary?.[0]) ||
        "Public GitHub contribution evidence exists.",
      evidenceStrength: normalizeText(githubSignals.evidence_strength) || "medium",
    };
  }

  const linkedInProof =
    normalizeText(params.matchReasons?.[0]) ||
    normalizeText(params.headline) ||
    (params.skills && params.skills.length > 0
      ? `Their profile points to hands-on work in ${params.skills.slice(0, 2).join(" and ")}.`
      : "Their LinkedIn background looks relevant to the role.");

  return {
    evidenceSource: "linkedin",
    evidenceSourceLabel: "LinkedIn",
    recruiterSummary:
      normalizeText(githubSignals?.recruiter_summary) ||
      `${params.candidateName} looks worth contacting from LinkedIn evidence, even without verified public GitHub proof.`,
    outreachAngle:
      normalizeText(githubSignals?.outreach_angle) ||
      "Lead with the strongest specific LinkedIn career detail instead of code evidence.",
    proofToReference: linkedInProof,
    evidenceStrength: normalizeText(githubSignals?.evidence_strength) || "none",
  };
}

export function buildFallbackOutreachDraft(params: {
  firstName: string;
  roleTitle: string;
  evidence: RecruiterOutreachEvidence;
  hasEmail: boolean;
}) {
  const firstName = params.firstName || "there";
  const subject = `${params.roleTitle} fit`;
  const opener = `Hi ${firstName},`;
  const body = `${opener} one thing that stood out was ${params.evidence.proofToReference} We're hiring for a ${params.roleTitle} role and I think that background could translate well here. Open to a quick chat?`;

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
