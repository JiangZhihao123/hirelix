import {
  generateLlmJson,
  getLightweightLlmModel,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import { compactStringArray, round } from "@/lib/github/discovery";
import type {
  PublicEvidenceCandidateInput,
  PublicEvidenceItem,
  PublicEvidenceSourceCandidate,
} from "./types";

export const PUBLIC_EVIDENCE_EXTRACT_VERSION = 1;

type PageSnapshot = {
  url: string;
  title: string | null;
  snippet: string | null;
  source_type: string;
  text: string | null;
};

type PublicEvidenceExtractResponse = {
  items: Array<{
    source_url: string;
    source_type: string;
    title?: string | null;
    identity_status: "verified" | "rejected" | "uncertain";
    identity_confidence: number;
    relevance_score: number;
    evidence_strength: "strong" | "medium" | "weak";
    evidence_summary: string;
    outreach_angle?: string | null;
    capability_signals?: string[];
    domain_signals?: string[];
    technical_keywords?: string[];
    risks?: string[];
  }>;
};

const PUBLIC_EVIDENCE_SYSTEM_PROMPT = `You are Hirelix's public engineering evidence analyst.

You analyze public web evidence for recruiters. Your job is to decide whether each public source belongs to the same candidate and whether it proves job-relevant engineering ability.

Stable rules:
- Identity comes first. A page that is not clearly about the candidate must be rejected even if it contains impressive technology.
- Verified identity signals include exact candidate name, same employer, LinkedIn/profile cross-link, personal website ownership, author byline, package maintainer name, GitHub profile ownership, or search result title/snippet tying the name to the URL.
- Strong engineering evidence is concrete public work: merged PRs, maintained repos, packages, technical articles by the candidate, conference talks, papers, or company engineering blog posts with clear authorship.
- Medium evidence is compatible but less direct: personal portfolio project, sparse GitHub profile with relevant repos, blog summary without deep technical detail.
- Weak evidence is identity-confirmed but low engineering substance.
- Do not verify generic company pages, organization homepages, topic pages, search pages, or pages where the candidate name is absent.
- Missing public evidence must not punish the candidate. Only verified useful evidence should produce positive summaries.

Job relevance:
- Tie evidence to the provided JD skills and role context when possible.
- Prefer concrete technical nouns over prestige.
- Output recruiter-usable summaries, not raw scraping notes.
- Return at most 5 items. Prefer the strongest verified and job-relevant sources.
- Keep each evidence_summary and outreach_angle under 32 words.

Return compact JSON only:
{
  "items": [
    {
      "source_url": "url from input",
      "source_type": "same source type from input",
      "title": "short title or null",
      "identity_status": "verified" | "rejected" | "uncertain",
      "identity_confidence": 0-1,
      "relevance_score": 0-100,
      "evidence_strength": "strong" | "medium" | "weak",
      "evidence_summary": "one concrete recruiter-facing sentence",
      "outreach_angle": "optional one sentence",
      "capability_signals": ["short phrases"],
      "domain_signals": ["short phrases"],
      "technical_keywords": ["keywords"],
      "risks": ["short caveats"]
    }
  ]
}`;

async function fetchPublicPageText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HirelixBot/1.0 (+https://hirelix.online)",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.5",
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return null;
    return (await response.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export async function buildPublicEvidenceSnapshots(
  sources: PublicEvidenceSourceCandidate[],
): Promise<PageSnapshot[]> {
  const selected = sources.slice(0, 12);
  return Promise.all(
    selected.map(async (source) => ({
      url: source.url,
      title: source.title,
      snippet: source.snippet,
      source_type: source.sourceType,
      text:
        source.sourceType === "github"
          ? source.snippet
          : await fetchPublicPageText(source.url),
    })),
  );
}

function normalizeExtractedItem(
  raw: PublicEvidenceExtractResponse["items"][number],
  snapshotsByUrl: Map<string, PageSnapshot>,
): PublicEvidenceItem | null {
  const snapshot = snapshotsByUrl.get(raw.source_url);
  if (!snapshot) return null;
  const identityStatus =
    raw.identity_status === "verified" ||
    raw.identity_status === "rejected" ||
    raw.identity_status === "uncertain"
      ? raw.identity_status
      : "uncertain";
  if (identityStatus !== "verified") return null;
  const identityConfidence = round(Math.max(0, Math.min(1, Number(raw.identity_confidence) || 0)), 3);
  if (identityConfidence < 0.78) return null;
  const evidenceStrength =
    raw.evidence_strength === "strong" ||
    raw.evidence_strength === "medium" ||
    raw.evidence_strength === "weak"
      ? raw.evidence_strength
      : "weak";
  const relevanceScore = Math.max(0, Math.min(100, Math.round(Number(raw.relevance_score) || 0)));
  if (!raw.evidence_summary || relevanceScore < 35) return null;
  return {
    sourceType: snapshot.source_type as PublicEvidenceItem["sourceType"],
    sourceUrl: raw.source_url,
    title: typeof raw.title === "string" ? raw.title : snapshot.title,
    snippet: snapshot.snippet,
    identityStatus,
    identityConfidence,
    relevanceScore,
    evidenceStrength,
    evidenceSummary: raw.evidence_summary,
    outreachAngle: typeof raw.outreach_angle === "string" ? raw.outreach_angle : null,
    rawMetadata: {
      extract_version: PUBLIC_EVIDENCE_EXTRACT_VERSION,
      capability_signals: compactStringArray(raw.capability_signals || [], 8),
      domain_signals: compactStringArray(raw.domain_signals || [], 8),
      technical_keywords: compactStringArray(raw.technical_keywords || [], 12),
      risks: compactStringArray(raw.risks || [], 8),
    },
  };
}

export async function extractPublicEvidenceItems(params: {
  candidate: PublicEvidenceCandidateInput;
  snapshots: PageSnapshot[];
}) {
  if (!params.snapshots.length) return [];
  const runExtraction = (snapshots: PageSnapshot[], maxOutputTokens: number) => generateLlmJson<PublicEvidenceExtractResponse>({
    model: getLightweightLlmModel(),
    messages: [
      { role: "system", content: PUBLIC_EVIDENCE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `PUBLIC_EVIDENCE_CONTEXT_JSON\n${safeJson({
          candidate: {
            name: params.candidate.name,
            headline: params.candidate.headline || null,
            location: params.candidate.location || null,
            linkedin_url: params.candidate.profileUrl || null,
            github_url: params.candidate.githubUrl || null,
            required_skills: params.candidate.requiredSkills,
            public_links: params.candidate.metadata?.public_links || null,
            work_history: Array.isArray(params.candidate.metadata?.work_history)
              ? params.candidate.metadata?.work_history
              : null,
          },
          sources: snapshots,
        })}`,
      },
    ],
    maxOutputTokens,
    temperature: 0,
    timeoutMs: 60_000,
    requireParameters: true,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PUBLIC_EVIDENCE_THINKING", "disabled"),
    usageEvent: {
      searchId: params.candidate.searchId,
      userId: params.candidate.userId,
      stage: "public_evidence_extract",
      batchSize: snapshots.length,
      metadata: {
        public_evidence_extract_version: PUBLIC_EVIDENCE_EXTRACT_VERSION,
        candidate_id: params.candidate.candidateId,
      },
    },
  });
  let data: PublicEvidenceExtractResponse;
  try {
    ({ data } = await runExtraction(params.snapshots.slice(0, 12), 4200));
  } catch (error) {
    if (!params.snapshots[6]) throw error;
    ({ data } = await runExtraction(params.snapshots.slice(0, 6), 3000));
  }
  const snapshotsByUrl = new Map(params.snapshots.map((snapshot) => [snapshot.url, snapshot]));
  return (data.items || [])
    .map((item) => normalizeExtractedItem(item, snapshotsByUrl))
    .filter((item): item is PublicEvidenceItem => Boolean(item))
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, 8);
}
