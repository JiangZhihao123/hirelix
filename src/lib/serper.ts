/**
 * Serper.dev Google Search API integration
 *
 * Strategy: Search Google for `site:linkedin.com/in` with job-relevant keywords
 * to find real LinkedIn profiles, then use AI to extract and score candidates.
 *
 * Free tier: 2,500 searches/month, then $1/1000 searches
 */
import { fetch as undiciFetch, ProxyAgent } from "undici";

const SERPER_BASE = "https://google.serper.dev";
const SERPER_PROXY_URL =
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  null;
const SERPER_PROXY_AGENT =
  process.env.NODE_ENV === "development" && SERPER_PROXY_URL
    ? new ProxyAgent(SERPER_PROXY_URL)
    : null;

async function serperFetch(input: string, init: RequestInit): Promise<Response> {
  if (SERPER_PROXY_AGENT) {
    const requestInit = (init ?? {}) as Record<string, unknown>;
    return (undiciFetch(input, {
      ...requestInit,
      dispatcher: SERPER_PROXY_AGENT,
    } as never) as unknown) as Response;
  }
  return fetch(input, init);
}

// ──────────────────── Types ────────────────────

export type SerperSearchResult = {
  title: string;
  link: string;
  snippet: string;
  position: number;
};

export type SerperCandidate = {
  name: string;
  headline: string | null;
  linkedin_url: string;
  snippet: string;
};

export type LinkedInQueryTier = "P0" | "P1" | "P2";

export type LinkedInSearchPlanTier = {
  tier: LinkedInQueryTier;
  queries: string[];
};

export type LinkedInSearchPlan = {
  queries: string[];
  tiers: LinkedInSearchPlanTier[];
};

// ──────────────────── Google Search via Serper ────────────────────

export async function serperSearch(
  apiKey: string,
  query: string,
  num: number = 20,
  page: number = 1,
): Promise<SerperSearchResult[]> {
  const res = await serperFetch(`${SERPER_BASE}/search`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num, page }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.organic || []) as SerperSearchResult[];
}

// ──────────────────── Build search query from parsed JD ────────────────────

function cleanLocation(loc: string): string {
  return loc
    .replace(/\(.*?\)/g, "")
    .replace(/remote[-\s]?friendly/i, "")
    .replace(/hybrid/i, "")
    .replace(/on[-\s]?site/gi, "")
    .replace(/in[-\s]?office/gi, "")
    .replace(/remote/i, "")
    .replace(/\bmetro area\b/gi, "")
    .replace(/\bmetropolitan area\b/gi, "")
    .replace(/,\s*$/, "")
    .trim();
}

function deriveLocationVariants(loc: string) {
  const base = cleanLocation(loc);
  const variants = new Set<string>();
  if (!base) return [];
  variants.add(base);

  const commaSplit = base
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaSplit.length > 0) variants.add(commaSplit[0]);

  const wordTrimmed = base
    .replace(/\b(united states|usa|us)\b/gi, "")
    .replace(/\b(city)\b/gi, "City")
    .trim()
    .replace(/,\s*$/, "");
  if (wordTrimmed) variants.add(wordTrimmed);

  if (/new york/i.test(base)) variants.add("New York");
  if (/san francisco/i.test(base)) variants.add("San Francisco");
  if (/los angeles/i.test(base)) variants.add("Los Angeles");

  return Array.from(variants).filter(Boolean).slice(0, 3);
}

function splitSkills(rawSkills: string[]): string[] {
  const skills: string[] = [];
  for (const s of rawSkills) {
    const sub = s.split(/[\/]/).map((x: string) => x.trim()).filter((x: string) => x.length > 1);
    skills.push(...sub);
  }
  return [...new Set(skills)];
}

function normalizeProvidedQueries(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];

  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;

    const cleaned = item.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;

    const withLinkedInScope = /site:linkedin\.com\/in/i.test(cleaned)
      ? cleaned
      : `site:linkedin.com/in ${cleaned}`;

    deduped.add(withLinkedInScope);
    if (deduped.size >= maxItems) break;
  }

  return Array.from(deduped);
}

function deriveTitleVariants(title?: string, functionFocus?: string | null) {
  if (!title) return [];

  const normalizedTitle = title
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
  const variants = new Set<string>();

  variants.add(normalizedTitle);

  const commaSplit = normalizedTitle
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of commaSplit) variants.add(part);

  if (/full[-\s]?stack/i.test(normalizedTitle) && /software engineer/i.test(normalizedTitle)) {
    const seniorityMatch = normalizedTitle.match(/\b(junior|mid|senior|staff|principal|lead)\b/i);
    const seniority = seniorityMatch?.[0]?.trim();
    variants.add(`${seniority ? `${seniority} ` : ""}Software Engineer`);
    variants.add(`${seniority ? `${seniority} ` : ""}Full Stack Engineer`);
    variants.add(`${seniority ? `${seniority} ` : ""}Full-Stack Engineer`);
  }

  if (functionFocus) {
    for (const part of functionFocus
      .split(/[;,/]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 2)) {
      variants.add(part);
    }
  }

  return Array.from(variants).filter(Boolean).slice(0, 4);
}

function quoteTerm(term: string) {
  return term.includes(" ") ? `"${term}"` : term;
}

function addQuery(
  target: Set<string>,
  parts: Array<string | null | undefined>,
) {
  const normalized = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  if (!normalized.length) return;
  if (normalized.length === 1 && normalized[0] === "site:linkedin.com/in") return;
  target.add(normalized.join(" "));
}

function pickSkill(skills: string[], index: number) {
  const skill = skills[index];
  if (!skill) return null;
  return quoteTerm(skill);
}

/**
 * Build a quality-first, tiered query plan:
 * - P0: high precision
 * - P1: balanced recall
 * - P2: exploratory expansion
 */
export function buildLinkedInSearchPlan(parsed: {
  title?: string;
  required_skills?: string[];
  nice_to_have_skills?: string[];
  location?: string;
  seniority?: string;
  industry?: string;
  search_queries?: string[];
  hiring_brief?: {
    work_model?: string;
    location_scope?: string | null;
    location_flexibility?: string;
    role_core?: {
      function_focus?: string | null;
    } | null;
  } | null;
  recall_spec?: {
    countries?: string[];
    title_variants?: string[];
    core_skill_terms?: string[];
  } | null;
}): LinkedInSearchPlan {
  const providedQueries = normalizeProvidedQueries(parsed.search_queries);
  if (providedQueries.length > 0) {
    return {
      queries: providedQueries,
      tiers: [
        {
          tier: "P0",
          queries: providedQueries,
        },
      ],
    };
  }

  const p0Queries = new Set<string>();
  const p1Queries = new Set<string>();
  const p2Queries = new Set<string>();

  const recallSkills = Array.isArray(parsed.recall_spec?.core_skill_terms)
    ? parsed.recall_spec?.core_skill_terms.filter((value): value is string => typeof value === "string")
    : [];
  const mustSkills = splitSkills(
    ((parsed.required_skills && parsed.required_skills.length > 0
      ? parsed.required_skills
      : recallSkills) || []).slice(0, 8),
  );
  const niceSkills = splitSkills((parsed.nice_to_have_skills || []).slice(0, 6));
  const recallTitleVariants = Array.isArray(parsed.recall_spec?.title_variants)
    ? parsed.recall_spec?.title_variants.filter((value): value is string => typeof value === "string")
    : [];
  const generatedTitleVariants = deriveTitleVariants(
    parsed.title,
    parsed.hiring_brief?.role_core?.function_focus ?? null,
  );
  const titleVariants = Array.from(
    new Set(
      [...recallTitleVariants, ...generatedTitleVariants]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 5);

  const locationScope =
    parsed.hiring_brief?.location_scope ||
    parsed.location ||
    (Array.isArray(parsed.recall_spec?.countries) ? parsed.recall_spec?.countries[0] : "") ||
    "";
  const locationVariants = locationScope ? deriveLocationVariants(locationScope) : [];
  const loc = locationVariants[0] || "";
  const workModel = (parsed.hiring_brief?.work_model || "").toLowerCase();
  const locationFlexibility = (parsed.hiring_brief?.location_flexibility || "").toLowerCase();
  const strictLocationConstraint =
    (workModel === "onsite" || workModel === "hybrid") &&
    locationFlexibility === "strict";
  const strictLocationTerm = strictLocationConstraint && loc.length > 2 ? `"${loc}"` : null;
  const normalizedRawTitle = parsed.title?.trim() || null;
  const primaryTitle =
    titleVariants[0]
      ? `"${titleVariants[0]}"`
      : (normalizedRawTitle ? quoteTerm(normalizedRawTitle) : null);

  // P0: high precision (title variants + must-have skills + strict location if required)
  for (const title of titleVariants.slice(0, 3)) {
    addQuery(p0Queries, [
      "site:linkedin.com/in",
      parsed.seniority || null,
      `"${title}"`,
      pickSkill(mustSkills, 0),
      pickSkill(mustSkills, 1),
      strictLocationTerm,
    ]);
    addQuery(p0Queries, [
      "site:linkedin.com/in",
      `"${title}"`,
      pickSkill(mustSkills, 0),
      pickSkill(mustSkills, 2),
      strictLocationTerm,
    ]);
  }

  if (p0Queries.size === 0) {
    addQuery(p0Queries, [
      "site:linkedin.com/in",
      primaryTitle,
      pickSkill(mustSkills, 0),
      pickSkill(mustSkills, 1),
      strictLocationTerm,
    ]);
  }

  // P1: balanced (title + must-have, location relaxed)
  for (const title of titleVariants.slice(0, 4)) {
    addQuery(p1Queries, [
      "site:linkedin.com/in",
      parsed.seniority || null,
      `"${title}"`,
      pickSkill(mustSkills, 0),
      pickSkill(mustSkills, 1),
    ]);
    addQuery(p1Queries, [
      "site:linkedin.com/in",
      `"${title}"`,
      pickSkill(mustSkills, 1),
      pickSkill(mustSkills, 2),
      parsed.industry ? quoteTerm(parsed.industry) : null,
    ]);
  }
  addQuery(p1Queries, [
    "site:linkedin.com/in",
    parsed.seniority || null,
    primaryTitle,
    pickSkill(mustSkills, 0),
    pickSkill(mustSkills, 1),
    pickSkill(mustSkills, 2),
  ]);
  if (!strictLocationConstraint && loc.length > 2) {
    addQuery(p1Queries, [
      "site:linkedin.com/in",
      primaryTitle,
      pickSkill(mustSkills, 0),
      `"${loc}"`,
    ]);
  }

  // P2: exploratory (expanded skills and optional nice-to-have terms)
  const expandedSkills = [...mustSkills, ...niceSkills].slice(0, 8);
  const skillPairs: Array<[number, number]> = [
    [0, 2],
    [1, 2],
    [2, 3],
    [0, 3],
    [1, 4],
  ];
  for (const [leftIndex, rightIndex] of skillPairs) {
    addQuery(p2Queries, [
      "site:linkedin.com/in",
      parsed.seniority || null,
      primaryTitle,
      pickSkill(expandedSkills, leftIndex),
      pickSkill(expandedSkills, rightIndex),
      locationVariants[leftIndex % Math.max(locationVariants.length, 1)]
        ? `"${locationVariants[leftIndex % Math.max(locationVariants.length, 1)]}"`
        : null,
    ]);
  }
  if (niceSkills.length > 0) {
    addQuery(p2Queries, [
      "site:linkedin.com/in",
      primaryTitle,
      pickSkill(mustSkills, 0),
      pickSkill(niceSkills, 0),
      pickSkill(niceSkills, 1),
    ]);
  }
  addQuery(p2Queries, [
    "site:linkedin.com/in",
    parsed.seniority || null,
    parsed.industry ? quoteTerm(parsed.industry) : null,
    pickSkill(expandedSkills, 0),
    pickSkill(expandedSkills, 1),
  ]);

  const tiers = ([
    { tier: "P0" as const, queries: Array.from(p0Queries).slice(0, 8) },
    { tier: "P1" as const, queries: Array.from(p1Queries).slice(0, 10) },
    { tier: "P2" as const, queries: Array.from(p2Queries).slice(0, 12) },
  ] satisfies LinkedInSearchPlanTier[]).filter((tier) => tier.queries.length > 0);

  return {
    queries: tiers.flatMap((tier) => tier.queries),
    tiers,
  };
}

// ──────────────────── Parse search results into candidates ────────────────────

export function parseSearchResults(results: SerperSearchResult[]): SerperCandidate[] {
  const candidates: SerperCandidate[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    // Only LinkedIn profile pages
    if (!r.link?.includes("linkedin.com/in/")) continue;

    // Deduplicate by LinkedIn URL (normalize)
    const linkedinUrl = r.link.split("?")[0].replace(/\/$/, "");
    if (seen.has(linkedinUrl)) continue;
    seen.add(linkedinUrl);

    // Extract name from title (format: "Name - Title - LinkedIn" or "Name | LinkedIn")
    const name = extractNameFromTitle(r.title);
    if (!name || name.length < 2) continue;

    // Extract headline from title
    const headline = extractHeadlineFromTitle(r.title);

    candidates.push({
      name,
      headline,
      linkedin_url: linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`,
      snippet: r.snippet || "",
    });
  }

  return candidates;
}

function extractNameFromTitle(title: string): string {
  // Common patterns:
  // "John Doe - Senior Engineer at Google - LinkedIn"
  // "John Doe | LinkedIn"
  // "John Doe – Senior Engineer – LinkedIn"
  const cleaned = title.replace(/\s*[-–|]\s*LinkedIn\s*$/i, "");
  const parts = cleaned.split(/\s*[-–|]\s*/);
  return (parts[0] || "").trim();
}

function extractHeadlineFromTitle(title: string): string | null {
  const cleaned = title.replace(/\s*[-–|]\s*LinkedIn\s*$/i, "");
  const parts = cleaned.split(/\s*[-–|]\s*/);
  if (parts.length > 1) {
    return parts.slice(1).join(" | ").trim() || null;
  }
  return null;
}

// ──────────────────── Build rich profile text for AI analysis ────────────────────

export function serperCandidateToRichProfile(candidate: SerperCandidate, index: number): string {
  const lines: string[] = [];
  lines.push(`[${index}] ${candidate.name}`);
  if (candidate.headline) {
    lines.push(`  Headline: ${candidate.headline}`);
  }
  lines.push(`  LinkedIn: ${candidate.linkedin_url}`);
  if (candidate.snippet) {
    lines.push(`  Details: ${candidate.snippet}`);
  }
  return lines.join("\n");
}

// ──────────────────── Convert to candidate format for DB ────────────────────

export function serperCandidateToDbCandidate(candidate: SerperCandidate) {
  return {
    name: candidate.name,
    headline: candidate.headline,
    location: null as string | null,
    skills: [] as string[],
    experience_years: null as number | null,
    match_score: 0,
    match_reasons: [] as string[],
    profile_url: candidate.linkedin_url,
    github_url: null as string | null,
    email: null as string | null,
    outreach_draft: null as string | null,
  };
}
