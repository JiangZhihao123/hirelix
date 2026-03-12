/**
 * Serper.dev Google Search API integration
 *
 * Strategy: Search Google for `site:linkedin.com/in` with job-relevant keywords
 * to find real LinkedIn profiles, then use AI to extract and score candidates.
 *
 * Free tier: 2,500 searches/month, then $1/1000 searches
 */

const SERPER_BASE = "https://google.serper.dev";

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

// ──────────────────── Google Search via Serper ────────────────────

export async function serperSearch(
  apiKey: string,
  query: string,
  num: number = 20,
): Promise<SerperSearchResult[]> {
  const res = await fetch(`${SERPER_BASE}/search`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
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
    .replace(/remote/i, "")
    .replace(/,\s*$/, "")
    .trim();
}

function splitSkills(rawSkills: string[]): string[] {
  const skills: string[] = [];
  for (const s of rawSkills) {
    const sub = s.split(/[\/]/).map((x: string) => x.trim()).filter((x: string) => x.length > 1);
    skills.push(...sub);
  }
  return [...new Set(skills)];
}

/**
 * Build multiple search queries with decreasing specificity.
 * This ensures we get enough candidates even when exact queries are too narrow.
 */
export function buildLinkedInSearchQueries(parsed: {
  title?: string;
  required_skills?: string[];
  nice_to_have_skills?: string[];
  location?: string;
  seniority?: string;
}): string[] {
  const queries: string[] = [];
  const skills = splitSkills((parsed.required_skills || []).slice(0, 6));
  const loc = parsed.location ? cleanLocation(parsed.location) : "";

  // Query 1: Title + top 2 skills + location (most specific)
  {
    const parts = ["site:linkedin.com/in"];
    if (parsed.title) parts.push(`"${parsed.title}"`);
    for (const sk of skills.slice(0, 2)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (loc.length > 2) parts.push(`"${loc}"`);
    queries.push(parts.join(" "));
  }

  // Query 2: Title + different skills, no location (broader)
  {
    const parts = ["site:linkedin.com/in"];
    if (parsed.title) parts.push(`"${parsed.title}"`);
    for (const sk of skills.slice(0, 3)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    queries.push(parts.join(" "));
  }

  // Query 3: Just skills + location, no exact title (even broader)
  {
    const parts = ["site:linkedin.com/in"];
    if (parsed.seniority) parts.push(parsed.seniority);
    for (const sk of skills.slice(0, 4)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (loc.length > 2) parts.push(`"${loc}"`);
    queries.push(parts.join(" "));
  }

  return queries;
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
