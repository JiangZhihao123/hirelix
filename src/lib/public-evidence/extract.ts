import {
  generateLlmJson,
  getLightweightLlmModel,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import {
  compactStringArray,
  extractCurrentCompanyFromHeadline,
  extractCurrentCompanyFromMetadata,
  normalizeText,
  round,
} from "@/lib/github/discovery";
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
    publication_title?: string | null;
    publication_venue?: string | null;
    publication_year?: string | null;
    publication_authors?: string[];
    citation_count?: number | null;
    risks?: string[];
  }>;
};

const PUBLIC_EVIDENCE_SYSTEM_PROMPT = `You are Hirelix's public engineering evidence analyst.

You analyze public web evidence for recruiters. Your job is to decide whether each public source belongs to the same candidate and whether it proves job-relevant engineering ability.

Stable rules:
- Identity comes first. A page that is not clearly about the candidate must be rejected even if it contains impressive technology.
- Verified identity signals include exact candidate name, same employer, LinkedIn/profile cross-link, personal website ownership, author byline, package maintainer name, GitHub profile ownership, or search result title/snippet tying the name to the URL.
- Strong engineering evidence is concrete public work: merged PRs, maintained repos, packages, technical articles by the candidate, conference talks, papers, official project credits, or company engineering blog posts with clear authorship.
- Medium evidence is compatible but less direct: personal portfolio project, sparse GitHub profile with relevant repos, blog summary without deep technical detail.
- Weak evidence is identity-confirmed but low engineering substance.
- For paper/publication sources, verify that the candidate is an author or clearly linked researcher. Do not verify a paper just because it has relevant keywords.
- For paper/publication sources, prefer evidence_summary that names the paper/project area and, when visible, venue or year.
- For paper/publication sources, use "uncertain" unless the source shows exact candidate authorship plus at least one corroborating identity signal such as employer/affiliation, profile cross-link, personal website, or a distinctive research domain from their profile.
- An author profile with only a common name is not strong evidence. Mark it uncertain or weak unless affiliation/profile context matches.
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
      "publication_title": "paper title when source_type is paper, else null",
      "publication_venue": "venue/conference/journal when visible, else null",
      "publication_year": "year when visible, else null",
      "publication_authors": ["visible author names"],
      "citation_count": 123,
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

function compactSnapshotForRetry(snapshot: PageSnapshot): PageSnapshot {
  return {
    ...snapshot,
    text: snapshot.text ? snapshot.text.slice(0, 2_500) : null,
  };
}

function isOfficialPaperUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return [
      "ifaamas.org",
      "openreview.net",
      "aclanthology.org",
      "proceedings.mlr.press",
      "neurips.cc",
      "thecvf.com",
      "cvf.com",
      "aaai.org",
      "ijcai.org",
      "acm.org",
      "ieee.org",
      "usenix.org",
    ].some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
  } catch {
    return false;
  }
}

function officialPaperVenue(snapshot: PageSnapshot) {
  const normalized = normalizeText(`${snapshot.url} ${snapshot.title || ""}`);
  if (normalized.includes("aamas")) return "AAMAS";
  if (normalized.includes("openreview")) return "OpenReview";
  if (normalized.includes("acl")) return "ACL Anthology";
  if (normalized.includes("neurips")) return "NeurIPS";
  if (normalized.includes("cvf") || normalized.includes("thecvf")) return "CVF";
  if (normalized.includes("aaai")) return "AAAI";
  if (normalized.includes("ijcai")) return "IJCAI";
  if (normalized.includes("acm")) return "ACM";
  if (normalized.includes("ieee")) return "IEEE";
  if (normalized.includes("usenix")) return "USENIX";
  return "official conference proceedings";
}

function yearFromText(value: string) {
  return value.match(/\b(20\d{2}|19\d{2})\b/)?.[1] || null;
}

function hasCompanyContext(sourceContext: string, currentCompany: string | null) {
  const normalizedCompany = currentCompany ? normalizeText(currentCompany) : "";
  return Boolean(
    normalizedCompany &&
    (sourceContext.includes(normalizedCompany) ||
      (normalizedCompany.includes("new york university") && sourceContext.includes("nyu")) ||
      (normalizedCompany === "nyu" && sourceContext.includes("new york university"))),
  );
}

function buildOfficialPaperSnippetItems(
  snapshots: PageSnapshot[],
  candidate: PublicEvidenceCandidateInput,
): PublicEvidenceItem[] {
  const candidateName = normalizeText(candidate.name);
  const currentCompany =
    extractCurrentCompanyFromMetadata(candidate.metadata) ||
    extractCurrentCompanyFromHeadline(candidate.headline);
  return snapshots
    .filter((snapshot) => snapshot.source_type === "paper" && isOfficialPaperUrl(snapshot.url))
    .map((snapshot): PublicEvidenceItem | null => {
      const sourceContext = normalizeText(`${snapshot.title || ""}\n${snapshot.snippet || ""}\n${snapshot.text || ""}`);
      if (!sourceContext.includes(candidateName) || !hasCompanyContext(sourceContext, currentCompany)) {
        return null;
      }
      const venue = officialPaperVenue(snapshot);
      const year = yearFromText(`${snapshot.url} ${snapshot.title || ""} ${snapshot.snippet || ""}`);
      const paperTitle = snapshot.title?.replace(/^\[PDF\]\s*/i, "").trim() || null;
      return {
        sourceType: "paper" as const,
        sourceUrl: snapshot.url,
        title: snapshot.title,
        snippet: snapshot.snippet,
        identityStatus: "verified" as const,
        identityConfidence: 0.92,
        relevanceScore: 88,
        evidenceStrength: "strong" as const,
        evidenceSummary: `${candidate.name} appears as a verified author on ${venue}${year ? ` ${year}` : ""} research with ${currentCompany || "institution"} context.`,
        outreachAngle: `Open with the verified ${venue}${year ? ` ${year}` : ""} research authorship.`,
        rawMetadata: {
          extract_version: PUBLIC_EVIDENCE_EXTRACT_VERSION,
          deterministic_source: "official_paper_snippet",
          publication: {
            title: paperTitle,
            venue,
            year,
            authors: [candidate.name],
            citation_count: null,
          },
        },
      };
    })
    .filter((item): item is PublicEvidenceItem => Boolean(item));
}

export async function buildPublicEvidenceSnapshots(
  sources: PublicEvidenceSourceCandidate[],
): Promise<PageSnapshot[]> {
  const selected = sources.slice(0, 12);
  return Promise.all(
    selected.map(async (source) => {
      const fetchedText =
        source.sourceType === "github"
          ? source.snippet
          : await fetchPublicPageText(source.url);
      return {
        url: source.url,
        title: source.title,
        snippet: source.snippet,
        source_type: source.sourceType,
        text: fetchedText || source.snippet,
      };
    }),
  );
}

function normalizeExtractedItem(
  raw: PublicEvidenceExtractResponse["items"][number],
  snapshotsByUrl: Map<string, PageSnapshot>,
  candidate: PublicEvidenceCandidateInput,
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
  const candidateName = normalizeText(candidate.name);
  const currentCompany =
    extractCurrentCompanyFromMetadata(candidate.metadata) ||
    extractCurrentCompanyFromHeadline(candidate.headline);
  const normalizedCompany = currentCompany ? normalizeText(currentCompany) : "";
  const sourceContext = normalizeText(`${snapshot.title || ""}\n${snapshot.snippet || ""}\n${snapshot.text || ""}`);
  const publicationAuthors = compactStringArray(raw.publication_authors || [], 12);
  const hasCandidateAuthor = publicationAuthors.some((author) => {
    const normalizedAuthor = normalizeText(author);
    return Boolean(normalizedAuthor && (
      normalizedAuthor === candidateName ||
      normalizedAuthor.includes(candidateName) ||
      candidateName.includes(normalizedAuthor)
    ));
  });
  const hasCompanyContext = Boolean(
    normalizedCompany &&
    (sourceContext.includes(normalizedCompany) ||
      (normalizedCompany.includes("new york university") && sourceContext.includes("nyu"))),
  );
  const hasPublicationTitle = typeof raw.publication_title === "string" && raw.publication_title.trim().length > 0;
  const evidenceStrength =
    raw.evidence_strength === "strong" ||
    raw.evidence_strength === "medium" ||
    raw.evidence_strength === "weak"
      ? raw.evidence_strength
      : "weak";
  let adjustedEvidenceStrength = evidenceStrength;
  let adjustedRelevanceCap: number | null = null;
  if (snapshot.source_type === "paper") {
    const hasPaperIdentityProof =
      hasCompanyContext ||
      (hasCandidateAuthor && identityConfidence >= 0.92) ||
      (hasPublicationTitle && hasCandidateAuthor && sourceContext.includes(candidateName));
    if (!hasPaperIdentityProof) return null;
    if (!hasPublicationTitle || !hasCandidateAuthor) {
      adjustedEvidenceStrength = "medium";
      adjustedRelevanceCap = 70;
    }
  }
  if (snapshot.source_type === "other_professional") {
    adjustedEvidenceStrength = "weak";
    adjustedRelevanceCap = 55;
  }
  const relevanceScore = Math.max(0, Math.min(100, Math.round(Number(raw.relevance_score) || 0)));
  const adjustedRelevanceScore = adjustedRelevanceCap ? Math.min(relevanceScore, adjustedRelevanceCap) : relevanceScore;
  if (!raw.evidence_summary || relevanceScore < 35) return null;
  return {
    sourceType: snapshot.source_type as PublicEvidenceItem["sourceType"],
    sourceUrl: raw.source_url,
    title: typeof raw.title === "string" ? raw.title : snapshot.title,
    snippet: snapshot.snippet,
    identityStatus,
    identityConfidence,
    relevanceScore: adjustedRelevanceScore,
    evidenceStrength: adjustedEvidenceStrength,
    evidenceSummary: raw.evidence_summary,
    outreachAngle: typeof raw.outreach_angle === "string" ? raw.outreach_angle : null,
    rawMetadata: {
      extract_version: PUBLIC_EVIDENCE_EXTRACT_VERSION,
      capability_signals: compactStringArray(raw.capability_signals || [], 8),
      domain_signals: compactStringArray(raw.domain_signals || [], 8),
      technical_keywords: compactStringArray(raw.technical_keywords || [], 12),
      publication:
        snapshot.source_type === "paper"
          ? {
              title: typeof raw.publication_title === "string" ? raw.publication_title : null,
              venue: typeof raw.publication_venue === "string" ? raw.publication_venue : null,
              year: typeof raw.publication_year === "string" ? raw.publication_year : null,
              authors: compactStringArray(raw.publication_authors || [], 12),
              citation_count: typeof raw.citation_count === "number" ? raw.citation_count : null,
            }
          : undefined,
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
    try {
      ({ data } = await runExtraction(params.snapshots.slice(0, 6).map(compactSnapshotForRetry), 3000));
    } catch (retryError) {
      if (!params.snapshots[3]) throw retryError;
      ({ data } = await runExtraction(params.snapshots.slice(0, 3).map(compactSnapshotForRetry), 1800));
    }
  }
  const snapshotsByUrl = new Map(params.snapshots.map((snapshot) => [snapshot.url, snapshot]));
  const llmItems = (data.items || [])
    .map((item) => normalizeExtractedItem(item, snapshotsByUrl, params.candidate))
    .filter((item): item is PublicEvidenceItem => Boolean(item));
  const officialPaperItems = buildOfficialPaperSnippetItems(params.snapshots, params.candidate);
  const byUrl = new Map<string, PublicEvidenceItem>();
  for (const item of [...officialPaperItems, ...llmItems]) {
    byUrl.set(item.sourceUrl, item);
  }
  return Array.from(byUrl.values())
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, 8);
}
