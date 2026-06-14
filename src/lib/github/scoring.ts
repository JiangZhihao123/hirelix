import type {
  GithubSignalStatus,
  GithubEvidenceStrength,
  GithubCommitMessageQuality,
  GithubEvidenceReadout,
  ContributionDay,
} from "./types";
import { normalizeText, compactStringArray, clamp, extractCurrentCompanyFromHeadline, extractPrimaryRoleFromHeadline } from "./discovery";

export function classifyActivityTrendFromWeeks(days: ContributionDay[]) {
  if (days.length === 0) return "No recent public contributions found.";

  const weekSums: number[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7);
    weekSums.push(slice.reduce((sum, day) => sum + (day.contributionCount || 0), 0));
  }

  const activeWeeks = weekSums.filter((value) => value > 0);
  const total = weekSums.reduce((sum, value) => sum + value, 0);
  const maxWeek = Math.max(...weekSums, 0);
  const activeRatio = activeWeeks.length / Math.max(1, weekSums.length);

  if (total === 0) return "No recent public contributions found.";
  if (activeRatio >= 0.65 && maxWeek < total * 0.35) {
    return "Stable contributor across the last 12 months.";
  }
  if (maxWeek >= total * 0.45) {
    return "Contribution pattern is spiky, with concentrated bursts rather than steady output.";
  }
  if (activeRatio <= 0.3) {
    return "Sparse public contribution history over the last 12 months.";
  }
  return "Moderately active, but contribution cadence is uneven.";
}

export function evaluateCommitMessageQuality(messages: string[]): GithubCommitMessageQuality {
  if (messages.length === 0) {
    return {
      label: "unknown",
      detail: "No recent public commit messages available to sample.",
    };
  }

  let strong = 0;
  let weak = 0;
  for (const message of messages) {
    const normalized = message.trim().toLowerCase();
    const looksConventional = /^(feat|fix|refactor|docs|test|chore|perf|build|ci)(\(.+\))?:\s+\S+/.test(normalized);
    const isGeneric = /^(fix|update|wip|misc|test|bugfix|changes?)$/.test(normalized);
    if (looksConventional || (normalized.length >= 16 && normalized.split(/\s+/).length >= 3)) {
      strong += 1;
    } else if (isGeneric || normalized.length <= 8) {
      weak += 1;
    }
  }

  const strongRatio = strong / messages.length;
  const weakRatio = weak / messages.length;

  if (strongRatio >= 0.6) {
    return {
      label: "strong",
      detail: "Recent commit messages are mostly descriptive and specific.",
    };
  }
  if (weakRatio >= 0.5) {
    return {
      label: "weak",
      detail: "Recent commit messages skew generic or too terse.",
    };
  }
  return {
    label: "mixed",
    detail: "Recent commit messages are usable but inconsistent in specificity.",
  };
}

export function computeGithubSignalScore(params: {
  requiredSkills: string[];
  activityTrend: string | null;
  topLanguages: string[];
  mergedPrCount: number | null;
  commitMessageQuality: GithubCommitMessageQuality;
}) {
  let score = 0;

  if (params.activityTrend?.includes("Stable contributor")) score += 28;
  else if (params.activityTrend?.includes("Moderately active")) score += 18;
  else if (params.activityTrend?.includes("spiky")) score += 10;
  else if (params.activityTrend?.includes("Sparse")) score += 6;

  const required = params.requiredSkills.map((skill) => normalizeText(skill));
  const overlap = params.topLanguages.filter((language) =>
    required.some((skill) => skill.includes(normalizeText(language)) || normalizeText(language).includes(skill)),
  ).length;
  score += Math.min(24, overlap * 8);

  const mergedPrCount = params.mergedPrCount || 0;
  if (mergedPrCount >= 10) score += 22;
  else if (mergedPrCount >= 4) score += 16;
  else if (mergedPrCount >= 1) score += 10;

  if (params.commitMessageQuality.label === "strong") score += 18;
  else if (params.commitMessageQuality.label === "mixed") score += 12;
  else if (params.commitMessageQuality.label === "weak") score += 5;

  return clamp(Math.round(score), 0, 100);
}

export function buildRecruiterFacingGithubReadout(params: {
  status: GithubSignalStatus;
  candidateName: string;
  headline?: string | null;
  currentCompany?: string | null;
  requiredSkills: string[];
  activityTrend: string | null;
  topLanguages: string[];
  mergedPrCount: number | null;
  commitMessageQuality: GithubCommitMessageQuality;
  githubSignalScore: number | null;
  highlight: string | null;
  discoveryConfidence: number;
  discoveryNotes?: string[];
}): GithubEvidenceReadout {
  if (params.status !== "verified") {
    const company = params.currentCompany || extractCurrentCompanyFromHeadline(params.headline);
    const role = extractPrimaryRoleFromHeadline(params.headline) || "engineering work";
    const skillHint = compactStringArray(params.requiredSkills, 2).join(" and ");
    const roleLine = `${params.candidateName} has profile fit worth reviewing as ${role}${company ? ` at ${company}` : ""}.`;
    return {
      evidenceStrength: "none" as GithubEvidenceStrength,
      recruiterSummary: `${roleLine} Run candidate research before citing off-profile proof.`,
      outreachAngle: skillHint
        ? `Lead with the profile background and connect it to the role's ${skillHint} needs.`
        : "Lead with one concrete profile detail instead of public code evidence.",
      verificationRisks: compactStringArray(
        [
          "Public engineering evidence has not been researched yet; verify technical depth before client submission.",
          params.discoveryConfidence > 0 ? "A possible GitHub match existed, but identity confidence stayed too low." : null,
        ],
        3,
      ),
    };
  }

  const mergedPrCount = params.mergedPrCount || 0;
  const topLanguageText = params.topLanguages.slice(0, 2).join(" and ");
  const strongestSkill = compactStringArray(params.requiredSkills, 2).join(" and ");
  const evidenceStrength: GithubEvidenceStrength =
    typeof params.githubSignalScore === "number" && params.githubSignalScore >= 65
      ? "strong"
      : mergedPrCount >= 1 || (params.topLanguages.length > 0 && params.activityTrend?.includes("Stable contributor"))
        ? "medium"
        : "weak";

  const recruiterSummary =
    evidenceStrength === "strong"
      ? `${params.candidateName} looks worth contacting because the public GitHub footprint backs up the resume with concrete ${topLanguageText || "engineering"} work${mergedPrCount > 0 ? ` and ${mergedPrCount} merged PRs into external repositories` : ""}.`
      : `${params.candidateName} looks worth contacting because GitHub supports the LinkedIn story${topLanguageText ? ` through visible ${topLanguageText} work` : ""}${mergedPrCount > 0 ? ` and ${mergedPrCount} merged external PRs` : ""}.`;

  const outreachAngle = params.highlight
    ? `Open with this proof point: ${params.highlight}`
    : strongestSkill
      ? `Lead with the candidate's ${strongestSkill} alignment and reference the visible public code work.`
      : "Lead with the strongest visible public code contribution before pitching the role.";

  const verificationRisks = compactStringArray(
    [
      params.discoveryConfidence < 0.7 ? "GitHub identity is likely correct, but confidence is not fully high yet." : null,
      params.activityTrend?.includes("Sparse") ? "Public contribution history is sparse, so validate current hands-on depth in conversation." : null,
      params.activityTrend?.includes("spiky") ? "Contribution cadence is bursty, so check whether recent activity reflects day-to-day work." : null,
      mergedPrCount === 0 ? "No external merged PR signal surfaced, so collaboration style should be validated manually." : null,
      params.commitMessageQuality.label === "unknown" || params.commitMessageQuality.label === "weak"
        ? "Commit-message quality signal is weak or missing; ask for concrete production examples."
        : null,
      params.discoveryNotes?.some((note) => note.includes("serper"))
        ? "Identity was recovered through external search, so keep one quick sanity check in the first review."
        : null,
    ],
    3,
  );

  return {
    evidenceStrength,
    recruiterSummary,
    outreachAngle,
    verificationRisks,
  };
}
