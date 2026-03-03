const PDL_BASE_URL = "https://api.peopledatalabs.com/v5";

export type PDLPerson = {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  job_company_name: string | null;
  job_company_website: string | null;
  location_name: string | boolean | null;
  location_locality: string | boolean | null;
  location_region: string | boolean | null;
  location_country: string | boolean | null;
  linkedin_url: string | null;
  github_url: string | null;
  skills: string[];
  experience: {
    title: { name: string } | null;
    company: { name: string; website: string | null } | null;
    start_date: string | null;
    end_date: string | null;
    is_primary: boolean;
  }[];
  emails: { address: string; type: string | null }[];
  education: {
    school: { name: string } | null;
    degrees: string[];
    majors: string[];
  }[];
};

export type PDLSearchResult = {
  status: number;
  total: number;
  data: PDLPerson[];
  scroll_token?: string;
};

/**
 * Build an Elasticsearch query for PDL Person Search from parsed JD requirements.
 * Uses only simple `term` queries which PDL supports (no `match`, `boost`, etc.).
 */
export function buildPDLQuery(parsed: {
  required_skills?: string[];
  nice_to_have_skills?: string[];
  experience_years_min?: number;
  location?: string;
  seniority?: string;
  title?: string;
}): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];
  const should: Record<string, unknown>[] = [];

  // Match by top required skills (use first 3 as must, rest as should)
  // PDL term queries work with multi-word skills too (e.g. "product design")
  const requiredSkills = (parsed.required_skills || [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 1 && s.length < 40);

  for (const skill of requiredSkills.slice(0, 3)) {
    must.push({ term: { skills: skill } });
  }
  for (const skill of requiredSkills.slice(3, 6)) {
    should.push({ term: { skills: skill } });
  }

  // Nice-to-have skills as should
  const niceSkills = (parsed.nice_to_have_skills || [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 1 && s.length < 40);

  for (const skill of niceSkills.slice(0, 3)) {
    should.push({ term: { skills: skill } });
  }

  // Job title role (only for engineering — other roles like "design" have spotty coverage in PDL)
  if (parsed.title) {
    const titleLower = parsed.title.toLowerCase();
    if (titleLower.includes("engineer") || titleLower.includes("developer")) {
      must.push({ term: { job_title_role: "engineering" } });
    }
  }

  // Fallback: if no skills and no role matched, require engineering
  if (must.length === 0) {
    must.push({ term: { job_title_role: "engineering" } });
  }

  const query: Record<string, unknown> = {
    bool: {
      must,
      ...(should.length > 0 ? { should } : {}),
    },
  };

  return { query };
}

/**
 * Search for real people using PDL Person Search API.
 */
export async function searchPeople(
  apiKey: string,
  query: { sql?: string; query?: unknown },
  size: number = 10,
): Promise<PDLSearchResult> {
  const body: Record<string, unknown> = {
    size,
    dataset: "resume",
    titlecase: true,
  };

  if (query.sql) {
    body.sql = query.sql;
  } else if (query.query) {
    body.query = query.query;
  }

  const res = await fetch(`${PDL_BASE_URL}/person/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PDL API error ${res.status}: ${errText}`);
  }

  return res.json();
}

/** Resolve location from PDL person, trying multiple fields (resume dataset returns booleans) */
function resolveLocation(person: PDLPerson): string | null {
  // Try location_name first (full string like "San Francisco, California, United States")
  if (typeof person.location_name === "string" && person.location_name.length > 1) {
    return person.location_name;
  }
  // Fallback: build from locality + region
  const parts: string[] = [];
  if (typeof person.location_locality === "string") parts.push(person.location_locality);
  if (typeof person.location_region === "string") parts.push(person.location_region);
  if (parts.length > 0) return parts.join(", ");
  // Last fallback: country
  if (typeof person.location_country === "string" && person.location_country.length > 1) {
    return person.location_country;
  }
  return null;
}

/** Ensure profile URLs have https:// prefix */
function formatProfileUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

/**
 * Convert a PDL person record into our candidate format.
 */
export function pdlPersonToCandidate(person: PDLPerson) {
  // Calculate experience years from experience array
  let experienceYears = 0;
  if (person.experience && person.experience.length > 0) {
    const earliest = person.experience
      .filter((e) => e.start_date)
      .map((e) => new Date(e.start_date!).getTime())
      .filter((t) => !isNaN(t));
    if (earliest.length > 0) {
      const firstJob = Math.min(...earliest);
      experienceYears = Math.round(
        (Date.now() - firstJob) / (365.25 * 24 * 60 * 60 * 1000),
      );
    }
  }

  // Get primary email (PDL resume dataset may return boolean instead of array)
  let primaryEmail: string | null = null;
  if (Array.isArray(person.emails) && person.emails.length > 0) {
    primaryEmail =
      person.emails.find((e) => e.type === "professional")?.address ||
      person.emails[0]?.address ||
      null;
  }

  // Build headline
  const headline = [person.job_title, person.job_company_name]
    .filter(Boolean)
    .join(" at ");

  return {
    name: person.full_name || `${person.first_name} ${person.last_name}`,
    headline: headline || null,
    location: resolveLocation(person),
    skills: (person.skills || []).slice(0, 15),
    experience_years: experienceYears || null,
    profile_url: formatProfileUrl(person.linkedin_url) || null,
    github_url: formatProfileUrl(person.github_url) || null,
    email: primaryEmail,
    // These will be filled by AI later
    match_score: 0,
    match_reasons: [] as string[],
    outreach_draft: null as string | null,
  };
}
