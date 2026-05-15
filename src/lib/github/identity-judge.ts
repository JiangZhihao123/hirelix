import {
  generateLlmJson,
  getLightweightLlmModel,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import type { GithubCandidateInput, GithubDiscoveryResult } from "./types";
import { githubFetch } from "./api";
import { compactStringArray, round } from "./discovery";

export const GITHUB_IDENTITY_JUDGE_VERSION = 2;

type GithubIdentityJudgeProfile = {
  login: string | null;
  url: string | null;
  name: string | null;
  company: string | null;
  bio: string | null;
  location: string | null;
  blog: string | null;
};

type GithubIdentityJudgeResponse = {
  same_person: boolean;
  confidence: number;
  risk_level: "low" | "medium" | "high";
  matched_evidence: string[];
  rejection_reasons: string[];
  summary: string;
};

export type GithubIdentityJudgeVerdict = {
  samePerson: boolean;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  matchedEvidence: string[];
  rejectionReasons: string[];
  summary: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cacheMissInputTokens: number;
  };
};

export const GITHUB_IDENTITY_JUDGE_SYSTEM_PROMPT = `You are Hirelix's GitHub identity verification judge.

Your job is to decide whether a GitHub profile belongs to the same person as a recruiting candidate.

Use conservative recruiting-grade identity logic:
- Strong positive evidence: exact or near-exact name match, same current company, same role/domain, same location, personal site cross-link, LinkedIn/profile page linking to GitHub, highly specific public search result tying the name to GitHub.
- Medium evidence: same uncommon name plus compatible engineering background, same employer family, same technical stack, or search result title/snippet explicitly pairs the candidate name with GitHub.
- Weak evidence: username resembles name but profile has little public data.
- Negative evidence: different full name, clearly different location/company/domain, organization account, celebrity/common-name collision, no public identity evidence.

Do not verify just because the account has good code. Identity comes first.
Do not reject only because GitHub bio is sparse if external search evidence directly links the candidate name to the GitHub URL.
Prefer "same_person": false when identity evidence is thin or conflicting.

Stable decision manual for cache-friendly repeated calls:

1. Recruiting identity standard
The product is used by recruiters. A verified GitHub profile may change candidate ranking and outreach copy, so the decision must be useful and defensible. The goal is not to find any technically impressive account; the goal is to decide whether this exact GitHub account is likely owned by this exact candidate. Treat identity as a separate question from engineering strength.

2. Evidence hierarchy
Tier A evidence is usually enough when not contradicted: a LinkedIn/public profile field contains the GitHub URL; an owned personal website links to the GitHub profile; a search result title/snippet names the candidate and directly points to the GitHub URL; the GitHub profile name exactly matches an uncommon candidate name and company/domain also aligns.
Tier B evidence can support but rarely proves identity alone: username resembles the candidate name; GitHub display name partially matches; profile location is compatible; bio mentions a relevant stack; company is in the same ecosystem; repositories show relevant work.
Tier C evidence is weak: common first/last name only; no display name; organization or topic pages; old public profile data; generic usernames; repositories in the right language but no identity signal.

3. Positive decision patterns
Return same_person=true when the candidate name and GitHub profile name match exactly or near-exactly and at least one of company, location, role/domain, public search evidence, or cross-link evidence aligns. Also return true when a Google/Serper result explicitly pairs the candidate name with the GitHub URL, even if the GitHub bio is sparse. If the candidate has a unique full name and GitHub display name is exact, compatible engineering context can be enough.

4. Negative decision patterns
Return same_person=false when the GitHub account has a different person name, a clearly unrelated company/domain, a geography that conflicts with the candidate profile, or no human profile evidence. Return false for organization accounts, product accounts, school labs, company accounts, and broad community accounts. Return false when the only evidence is that the account writes code in a relevant language.

5. Common edge cases
Company mismatch is not fatal if the GitHub profile may be stale or if external search evidence directly ties the candidate name to the account. Sparse GitHub profile is not fatal if external search evidence is strong. A common name requires more corroboration. A username that resembles the name is useful but insufficient by itself. Academic profiles and professional profiles may use different affiliations; rely on exact name plus domain/location/search evidence.

6. Output calibration
Use confidence 0.90-0.98 for explicit cross-links or exact name plus strong external evidence. Use 0.78-0.89 for exact/near-exact name plus compatible company/domain/location. Use 0.55-0.77 when the account is plausible but not safe to verify. Use below 0.55 when identity evidence is weak or conflicting. risk_level should be low only when a recruiter could confidently cite the GitHub evidence; medium when manual review would still be prudent; high when the match should not be used.

Example A:
Candidate: "Venky Manicks", Engineering Manager at Google, search/distributed systems.
GitHub: "venkyman", display name "Venky Manicks", external search result pairs "Venky Manicks" with GitHub.
Decision: same_person=true, confidence around 0.85-0.92, risk_level=low. Exact name and external search evidence overcome minor company staleness.

Example B:
Candidate: "Simon Radford", Senior Software Engineer.
GitHub: "simonrad", display name "Simon Radford", external search result pairs the name with GitHub.
Decision: same_person=true, confidence around 0.85, risk_level=low. Exact name plus direct external evidence is enough.

Example C:
Candidate: "Christopher Baik", Microsoft researcher/engineer.
GitHub result: account name "chrisjbaik" but profile is sparse and search results mostly point to papers or organizations.
Decision: same_person=false unless there is direct cross-link or strong exact-name evidence. Do not infer from name resemblance alone.

Example D:
Candidate: "Scarlett Qu", cloud/platform engineer.
GitHub result: account display name matches but profile has no company/location/domain signal and search results do not directly tie candidate to account.
Decision: same_person=false or medium/high risk. Exact name can be insufficient for common or low-evidence profiles.

Return compact JSON only:
{
  "same_person": boolean,
  "confidence": number from 0 to 1,
  "risk_level": "low" | "medium" | "high",
  "matched_evidence": string[],
  "rejection_reasons": string[],
  "summary": string
}`;

function safeJsonForPrompt(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function shouldUseLlmIdentityJudge(discovery: GithubDiscoveryResult) {
  if (!discovery.username || !discovery.url) return false;
  if (discovery.source === "explicit_url" || discovery.source === "owned_website") return false;
  if (discovery.confidence >= 0.78) return false;
  if (discovery.evidence?.llm_identity_judged) return false;
  return discovery.confidence >= 0.25;
}

export function buildGithubIdentityJudgeMessages(params: {
  candidate: GithubCandidateInput;
  discovery: GithubDiscoveryResult;
  githubProfile: GithubIdentityJudgeProfile | null;
}) {
  return [
    {
      role: "system" as const,
      content: GITHUB_IDENTITY_JUDGE_SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: `CANDIDATE_AND_GITHUB_CONTEXT_JSON\n${safeJsonForPrompt({
        candidate: {
          name: params.candidate.name,
          headline: params.candidate.headline || null,
          location: params.candidate.location || null,
          linkedin_url: params.candidate.profileUrl || null,
          required_skills: params.candidate.requiredSkills || params.candidate.skills || [],
          public_links: params.candidate.metadata?.public_links || null,
          work_history: Array.isArray(params.candidate.metadata?.work_history)
            ? params.candidate.metadata?.work_history
            : null,
        },
        github_discovery: {
          username: params.discovery.username,
          url: params.discovery.url,
          heuristic_confidence: params.discovery.confidence,
          source: params.discovery.source,
          notes: params.discovery.notes,
          evidence: params.discovery.evidence || null,
        },
        github_profile: params.githubProfile,
      })}`,
    },
  ];
}

async function fetchGithubProfileForJudge(username: string): Promise<GithubIdentityJudgeProfile | null> {
  try {
    const profile = await githubFetch(`/users/${encodeURIComponent(username)}`) as {
      login?: string;
      html_url?: string;
      name?: string | null;
      company?: string | null;
      bio?: string | null;
      location?: string | null;
      blog?: string | null;
      type?: string | null;
    };
    if ((profile.type || "User") !== "User") return null;
    return {
      login: profile.login || username,
      url: profile.html_url || `https://github.com/${username}`,
      name: profile.name || null,
      company: profile.company || null,
      bio: profile.bio || null,
      location: profile.location || null,
      blog: profile.blog || null,
    };
  } catch {
    return null;
  }
}

export async function judgeGithubIdentityWithLlm(params: {
  candidate: GithubCandidateInput;
  discovery: GithubDiscoveryResult;
  searchId?: string | null;
  jobId?: string | null;
  userId?: string | null;
}): Promise<GithubIdentityJudgeVerdict | null> {
  if (!shouldUseLlmIdentityJudge(params.discovery) || !params.discovery.username) {
    return null;
  }

  const githubProfile = await fetchGithubProfileForJudge(params.discovery.username);
  const { data, usage } = await generateLlmJson<GithubIdentityJudgeResponse>({
    model: getLightweightLlmModel(),
    messages: buildGithubIdentityJudgeMessages({
      candidate: params.candidate,
      discovery: params.discovery,
      githubProfile,
    }),
    maxOutputTokens: 420,
    temperature: 0,
    timeoutMs: 45_000,
    requireParameters: true,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_GITHUB_IDENTITY_THINKING", "disabled"),
    usageEvent: {
      searchId: params.searchId,
      jobId: null,
      userId: params.userId,
      stage: "github_identity_judge",
      batchSize: 1,
      metadata: {
        identity_judge_version: GITHUB_IDENTITY_JUDGE_VERSION,
        github_enrichment_job_id: params.jobId ?? null,
        discovery_source: params.discovery.source,
        discovery_confidence: params.discovery.confidence,
      },
    },
  });

  return {
    samePerson: Boolean(data.same_person),
    confidence: round(Math.max(0, Math.min(1, Number(data.confidence) || 0)), 3),
    riskLevel: data.risk_level === "low" || data.risk_level === "medium" || data.risk_level === "high"
      ? data.risk_level
      : "high",
    matchedEvidence: compactStringArray(data.matched_evidence || [], 6),
    rejectionReasons: compactStringArray(data.rejection_reasons || [], 6),
    summary: typeof data.summary === "string" ? data.summary : "",
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheMissInputTokens: usage.cacheMissInputTokens,
    },
  };
}
