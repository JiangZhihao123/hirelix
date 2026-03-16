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

export type LinkedInSearchPlan = {
  queries: string[];
};

// ──────────────────── Google Search via Serper ────────────────────

export async function serperSearch(
  apiKey: string,
  query: string,
  num: number = 20,
  page: number = 1,
): Promise<SerperSearchResult[]> {
  const res = await fetch(`${SERPER_BASE}/search`, {
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

/**
 * Build 10-12 diverse search queries to retrieve 300+ LinkedIn profiles.
 * All queries go into a single pool — no primary/extended split.
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
    };
  }

  const allQueries: string[] = [];
  const recallSkills = Array.isArray(parsed.recall_spec?.core_skill_terms)
    ? parsed.recall_spec?.core_skill_terms.filter((value): value is string => typeof value === "string")
    : [];
  const skills = splitSkills(
    ((parsed.required_skills && parsed.required_skills.length > 0
      ? parsed.required_skills
      : recallSkills) || []).slice(0, 8),
  );
  const niceSkills = splitSkills((parsed.nice_to_have_skills || []).slice(0, 6));
  const recallTitleVariants = Array.isArray(parsed.recall_spec?.title_variants)
    ? parsed.recall_spec?.title_variants.filter((value): value is string => typeof value === "string")
    : [];
  const titleVariants = deriveTitleVariants(
    recallTitleVariants[0] || parsed.title,
    parsed.hiring_brief?.role_core?.function_focus ?? null,
  );
  const locationScope =
    parsed.hiring_brief?.location_scope ||
    parsed.location ||
    (Array.isArray(parsed.recall_spec?.countries) ? parsed.recall_spec?.countries[0] : "") ||
    "";
  const locationVariants = locationScope ? deriveLocationVariants(locationScope) : [];
  const loc = locationVariants[0] || "";
  const workModel = (parsed.hiring_brief?.work_model || "").toLowerCase();
  const locationFlexibility = (parsed.hiring_brief?.location_flexibility || "").toLowerCase();
  const isRemoteFriendly = workModel === "remote";
  const useLocation = !isRemoteFriendly && loc.length > 2;

  // Q1: title + top 2 skills + location
  {
    const parts = ["site:linkedin.com/in"];
    if (titleVariants[0]) parts.push(`"${titleVariants[0]}"`);
    for (const sk of skills.slice(0, 2)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (useLocation) parts.push(`"${loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q2: seniority + title variant + skills + location
  {
    const parts = ["site:linkedin.com/in"];
    if (parsed.seniority) parts.push(parsed.seniority);
    if (titleVariants[1] || titleVariants[0]) parts.push(`"${titleVariants[1] || titleVariants[0]}"`);
    for (const sk of skills.slice(0, 3)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (useLocation) parts.push(`"${locationVariants[1] || loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q3: title variant + industry + mid skills + location
  {
    const parts = ["site:linkedin.com/in"];
    if (titleVariants[2] || titleVariants[0]) parts.push(`"${titleVariants[2] || titleVariants[0]}"`);
    if (parsed.industry) parts.push(parsed.industry);
    for (const sk of skills.slice(2, 4)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (useLocation) parts.push(`"${locationVariants[2] || loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q4: title variant + no location (broader reach)
  {
    const parts = ["site:linkedin.com/in"];
    if (titleVariants[3] || titleVariants[0]) parts.push(`"${titleVariants[3] || titleVariants[0]}"`);
    for (const sk of skills.slice(0, 3)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    allQueries.push(parts.join(" "));
  }

  // Q5: seniority + skills only + location (no title)
  if (skills.length >= 2) {
    const parts = ["site:linkedin.com/in"];
    if (parsed.seniority) parts.push(parsed.seniority);
    for (const sk of skills.slice(0, 4)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (useLocation) parts.push(`"${loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q6: title + later skills + location variant
  if (skills.length > 3) {
    const parts = ["site:linkedin.com/in"];
    if (titleVariants[0]) parts.push(`"${titleVariants[0]}"`);
    for (const sk of skills.slice(3, 6)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (useLocation) parts.push(`"${locationVariants[1] || loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q7: nice-to-have skills + title
  if (niceSkills.length > 0) {
    const parts = ["site:linkedin.com/in"];
    if (titleVariants[0]) parts.push(`"${titleVariants[0]}"`);
    for (const sk of niceSkills.slice(0, 3)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (useLocation) parts.push(`"${loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q8: seniority + skills + no location (broad)
  if (skills.length >= 2) {
    const parts = ["site:linkedin.com/in"];
    if (parsed.seniority) parts.push(parsed.seniority);
    for (const sk of skills.slice(1, 5)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    allQueries.push(parts.join(" "));
  }

  // Q9: location-only broad + top skills
  if (useLocation && skills.length >= 2) {
    const parts = ["site:linkedin.com/in"];
    if (parsed.seniority) parts.push(parsed.seniority);
    parts.push(`"${loc}"`);
    for (const sk of skills.slice(0, 2)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    allQueries.push(parts.join(" "));
  }

  // Q10: nice-to-have + seniority + no title
  if (niceSkills.length >= 2) {
    const parts = ["site:linkedin.com/in"];
    if (parsed.seniority) parts.push(parsed.seniority);
    for (const sk of niceSkills.slice(0, 4)) {
      parts.push(sk.includes(" ") ? `"${sk}"` : sk);
    }
    if (useLocation) parts.push(`"${loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q11: title + required skill #1 + nice skill #1 + location
  if (skills.length > 0 && niceSkills.length > 0) {
    const parts = ["site:linkedin.com/in"];
    if (titleVariants[0]) parts.push(`"${titleVariants[0]}"`);
    const sk0 = skills[0];
    parts.push(sk0.includes(" ") ? `"${sk0}"` : sk0);
    const ns0 = niceSkills[0];
    parts.push(ns0.includes(" ") ? `"${ns0}"` : ns0);
    if (useLocation) parts.push(`"${loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q12: industry + seniority + location (broadest)
  if (parsed.industry) {
    const parts = ["site:linkedin.com/in"];
    if (parsed.seniority) parts.push(parsed.seniority);
    parts.push(parsed.industry);
    if (skills[0]) {
      const sk0 = skills[0];
      parts.push(sk0.includes(" ") ? `"${sk0}"` : sk0);
    }
    if (useLocation) parts.push(`"${loc}"`);
    allQueries.push(parts.join(" "));
  }

  // Q13-Q20: Skill pair combinations with different titles
  if (skills.length >= 4) {
    const skillPairs = [
      [0, 1], [0, 2], [1, 2], [2, 3],
      [0, 3], [1, 3], [3, 4], [4, 5]
    ];
    for (const [i, j] of skillPairs) {
      if (skills[i] && skills[j]) {
        const parts = ["site:linkedin.com/in"];
        const titleIdx = Math.floor(i / 2) % titleVariants.length;
        if (titleVariants[titleIdx]) parts.push(`"${titleVariants[titleIdx]}"`);
        const sk1 = skills[i];
        const sk2 = skills[j];
        parts.push(sk1.includes(" ") ? `"${sk1}"` : sk1);
        parts.push(sk2.includes(" ") ? `"${sk2}"` : sk2);
        if (useLocation && i % 2 === 0) {
          const locIdx = i % locationVariants.length;
          parts.push(`"${locationVariants[locIdx] || loc}"`);
        }
        allQueries.push(parts.join(" "));
      }
    }
  }

  // Q21-Q25: Nice-to-have skill combinations
  if (niceSkills.length >= 3) {
    const nicePairs = [[0, 1], [1, 2], [0, 2], [2, 3], [1, 3]];
    for (const [i, j] of nicePairs) {
      if (niceSkills[i] && niceSkills[j]) {
        const parts = ["site:linkedin.com/in"];
        if (titleVariants[0]) parts.push(`"${titleVariants[0]}"`);
        const ns1 = niceSkills[i];
        const ns2 = niceSkills[j];
        parts.push(ns1.includes(" ") ? `"${ns1}"` : ns1);
        parts.push(ns2.includes(" ") ? `"${ns2}"` : ns2);
        if (useLocation && i === 0) parts.push(`"${loc}"`);
        allQueries.push(parts.join(" "));
      }
    }
  }

  // Q26-Q30: Location variants with top skills
  if (locationVariants.length > 1 && skills.length >= 2) {
    for (let i = 0; i < Math.min(5, locationVariants.length); i++) {
      const parts = ["site:linkedin.com/in"];
      if (parsed.seniority) parts.push(parsed.seniority);
      if (titleVariants[i % titleVariants.length]) {
        parts.push(`"${titleVariants[i % titleVariants.length]}"`);
      }
      const sk1 = skills[i % skills.length];
      const sk2 = skills[(i + 1) % skills.length];
      parts.push(sk1.includes(" ") ? `"${sk1}"` : sk1);
      parts.push(sk2.includes(" ") ? `"${sk2}"` : sk2);
      parts.push(`"${locationVariants[i]}"`);
      allQueries.push(parts.join(" "));
    }
  }

  // Q31-Q35: Mixed required + nice-to-have combinations
  if (skills.length >= 2 && niceSkills.length >= 2) {
    const mixPairs = [[0, 0], [1, 0], [0, 1], [2, 1], [1, 2]];
    for (const [si, ni] of mixPairs) {
      if (skills[si] && niceSkills[ni]) {
        const parts = ["site:linkedin.com/in"];
        const titleIdx = si % titleVariants.length;
        if (titleVariants[titleIdx]) parts.push(`"${titleVariants[titleIdx]}"`);
        const sk = skills[si];
        const ns = niceSkills[ni];
        parts.push(sk.includes(" ") ? `"${sk}"` : sk);
        parts.push(ns.includes(" ") ? `"${ns}"` : ns);
        if (useLocation && si % 2 === 0) parts.push(`"${loc}"`);
        allQueries.push(parts.join(" "));
      }
    }
  }

  // Q36-Q40: Seniority + skill triplets
  if (parsed.seniority && skills.length >= 3) {
    const triplets = [[0, 1, 2], [1, 2, 3], [2, 3, 4], [0, 2, 4], [1, 3, 5]];
    for (const [i, j, k] of triplets) {
      if (skills[i] && skills[j] && skills[k]) {
        const parts = ["site:linkedin.com/in"];
        parts.push(parsed.seniority);
        const sk1 = skills[i];
        const sk2 = skills[j];
        const sk3 = skills[k];
        parts.push(sk1.includes(" ") ? `"${sk1}"` : sk1);
        parts.push(sk2.includes(" ") ? `"${sk2}"` : sk2);
        parts.push(sk3.includes(" ") ? `"${sk3}"` : sk3);
        if (useLocation && i === 0) parts.push(`"${loc}"`);
        allQueries.push(parts.join(" "));
      }
    }
  }

  const unique = Array.from(new Set(allQueries.filter(Boolean)));

  return {
    queries: unique,
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
