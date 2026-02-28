const PDL_BASE_URL = "https://api.peopledatalabs.com/v5";

export type PDLPerson = {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  job_company_name: string | null;
  job_company_website: string | null;
  location_name: string | null;
  location_country: string | null;
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

  // Match by skills (required)
  if (parsed.required_skills && parsed.required_skills.length > 0) {
    for (const skill of parsed.required_skills.slice(0, 8)) {
      must.push({
        term: { skills: skill.toLowerCase() },
      });
    }
  }

  // Match by nice-to-have skills (boost, not required)
  if (parsed.nice_to_have_skills && parsed.nice_to_have_skills.length > 0) {
    for (const skill of parsed.nice_to_have_skills.slice(0, 5)) {
      should.push({
        term: { skills: skill.toLowerCase() },
      });
    }
  }

  // Match by job title keywords
  if (parsed.title) {
    // Extract key terms from title for matching
    const titleTerms = parsed.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !["the", "and", "for", "with"].includes(t));

    if (titleTerms.length > 0) {
      should.push({
        match: {
          job_title: {
            query: titleTerms.join(" "),
            boost: 2,
          },
        },
      });
    }
  }

  // Location filter
  if (parsed.location && parsed.location.toLowerCase() !== "remote") {
    should.push({
      match: {
        location_name: {
          query: parsed.location,
          boost: 1.5,
        },
      },
    });
  }

  // Seniority — map to job_title_levels if available
  if (parsed.seniority) {
    const seniorityMap: Record<string, string> = {
      junior: "entry",
      mid: "senior",
      senior: "senior",
      staff: "vp",
      principal: "vp",
      lead: "director",
    };
    const level = seniorityMap[parsed.seniority.toLowerCase()];
    if (level) {
      should.push({
        term: { job_title_levels: level },
      });
    }
  }

  const query: Record<string, unknown> = {
    bool: {
      ...(must.length > 0 ? { must } : {}),
      ...(should.length > 0 ? { should, minimum_should_match: 1 } : {}),
    },
  };

  return { query };
}

/**
 * Search for real people using PDL Person Search API.
 */
export async function searchPeople(
  apiKey: string,
  query: Record<string, unknown>,
  size: number = 10,
): Promise<PDLSearchResult> {
  const res = await fetch(`${PDL_BASE_URL}/person/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      query: query.query,
      size,
      dataset: "resume",
      titlecase: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PDL API error ${res.status}: ${errText}`);
  }

  return res.json();
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

  // Get primary email
  const primaryEmail =
    person.emails?.find((e) => e.type === "professional")?.address ||
    person.emails?.[0]?.address ||
    null;

  // Build headline
  const headline = [person.job_title, person.job_company_name]
    .filter(Boolean)
    .join(" at ");

  return {
    name: person.full_name || `${person.first_name} ${person.last_name}`,
    headline: headline || null,
    location: person.location_name || null,
    skills: (person.skills || []).slice(0, 15),
    experience_years: experienceYears || null,
    profile_url: person.linkedin_url || person.github_url || null,
    email: primaryEmail,
    // These will be filled by AI later
    match_score: 0,
    match_reasons: [] as string[],
    outreach_draft: null as string | null,
  };
}
