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
/** Map seniority from Claude-parsed JD to PDL job_title_levels values */
const SENIORITY_TO_PDL_LEVELS: Record<string, string[]> = {
  junior: ["entry", "training"],
  entry: ["entry", "training"],
  mid: ["senior"], // PDL doesn't have "mid", senior is closest
  senior: ["senior"],
  staff: ["senior"],
  principal: ["senior", "director"],
  lead: ["senior", "manager"],
  manager: ["manager"],
  director: ["director"],
  vp: ["vp"],
  "c-level": ["cxo"],
};

/** Map job title keywords to PDL job_title_sub_role values */
function inferSubRoles(title: string): string[] {
  const t = title.toLowerCase();
  if (t.includes("frontend") || t.includes("front-end") || t.includes("front end") || t.includes("ui "))
    return ["web", "software"];
  if (t.includes("backend") || t.includes("back-end") || t.includes("back end"))
    return ["software"];
  if (t.includes("fullstack") || t.includes("full-stack") || t.includes("full stack"))
    return ["software", "web"];
  if (t.includes("devops") || t.includes("sre") || t.includes("infrastructure") || t.includes("platform"))
    return ["devops"];
  if (t.includes("data engineer"))
    return ["data_engineering"];
  if (t.includes("data scien"))
    return ["data_science"];
  if (t.includes("machine learning") || t.includes("ml ") || t.includes("ai "))
    return ["data_science"];
  if (t.includes("qa") || t.includes("quality") || t.includes("test"))
    return ["qa_engineering"];
  if (t.includes("product manag"))
    return ["product_management"];
  if (t.includes("product design") || t.includes("ux") || t.includes("ui design"))
    return ["product_design"];
  if (t.includes("software") || t.includes("engineer") || t.includes("developer"))
    return ["software"];
  return [];
}

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
  const filter: Record<string, unknown>[] = [];

  // --- Wide search strategy: minimal must, maximize should for broad candidate pool ---
  // AI will do the real filtering in Step 2, so PDL just needs a diverse pool

  const requiredSkills = (parsed.required_skills || [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 1 && s.length < 40);

  // Only top 1 skill as must (to ensure some relevance), rest as should
  if (requiredSkills.length > 0) {
    must.push({ term: { skills: requiredSkills[0] } });
  }
  for (const skill of requiredSkills.slice(1, 8)) {
    should.push({ term: { skills: skill } });
  }

  const niceSkills = (parsed.nice_to_have_skills || [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 1 && s.length < 40);

  for (const skill of niceSkills.slice(0, 5)) {
    should.push({ term: { skills: skill } });
  }

  // --- Job title sub_role: as should (soft signal, not hard filter) ---
  if (parsed.title) {
    const subRoles = inferSubRoles(parsed.title);
    for (const r of subRoles) {
      should.push({ term: { job_title_sub_role: r } });
    }
  }

  // --- Job title role: keep as must for basic relevance ---
  if (parsed.title) {
    const titleLower = parsed.title.toLowerCase();
    if (titleLower.includes("engineer") || titleLower.includes("developer") || titleLower.includes("software")) {
      must.push({ term: { job_title_role: "engineering" } });
    }
  }

  // --- Seniority: exclude executives (hard filter) but target level as soft signal ---
  if (parsed.seniority) {
    const seniorityLower = parsed.seniority.toLowerCase();
    const levels = SENIORITY_TO_PDL_LEVELS[seniorityLower];
    if (levels && levels.length > 0) {
      const excludeLevels = seniorityLower === "vp" || seniorityLower === "c-level" ? [] : ["cxo", "owner"];
      for (const lvl of excludeLevels) {
        filter.push({ bool: { must_not: [{ term: { job_title_levels: lvl } }] } });
      }
      for (const l of levels) {
        should.push({ term: { job_title_levels: l } });
      }
    }
  }

  // --- Experience years: relaxed range (allow wider pool) ---
  if (parsed.experience_years_min && parsed.experience_years_min > 2) {
    filter.push({
      range: {
        inferred_years_experience: { gte: Math.max(parsed.experience_years_min - 3, 0) },
      },
    });
  }

  // --- Location: soft preference ---
  if (parsed.location && parsed.location.toLowerCase() !== "remote") {
    const loc = parsed.location.toLowerCase().trim();
    const parts = loc.split(",").map((p) => p.trim());
    if (parts.length >= 1 && parts[0]) {
      should.push({ term: { location_locality: parts[0] } });
    }
    if (parts.length >= 2 && parts[1]) {
      should.push({ term: { location_region: parts[1] } });
    }
  }

  // Fallback: if no must conditions, require engineering role
  if (must.length === 0) {
    must.push({ term: { job_title_role: "engineering" } });
  }

  const query: Record<string, unknown> = {
    bool: {
      must,
      ...(should.length > 0 ? { should } : {}),
      ...(filter.length > 0 ? { filter } : {}),
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

/**
 * Generate a rich text profile summary for AI analysis.
 * Includes work history, education, skills — much more context than just name + headline.
 */
export function pdlPersonToRichProfile(person: PDLPerson, index: number): string {
  const lines: string[] = [];
  const name = person.full_name || `${person.first_name} ${person.last_name}`;
  const headline = [person.job_title, person.job_company_name].filter(Boolean).join(" at ");
  const location = resolveLocation(person);

  lines.push(`[${index}] ${name}`);
  if (headline) lines.push(`  Current: ${headline}`);
  if (location) lines.push(`  Location: ${location}`);

  // Work history (top 4 most recent)
  if (person.experience && person.experience.length > 0) {
    const jobs = person.experience
      .filter((e) => e.title?.name || e.company?.name)
      .slice(0, 4);
    if (jobs.length > 0) {
      lines.push("  Work History:");
      for (const job of jobs) {
        const title = job.title?.name || "Unknown Role";
        const company = job.company?.name || "Unknown Company";
        const dates = [job.start_date, job.end_date || "present"].filter(Boolean).join(" → ");
        lines.push(`    - ${title} at ${company} (${dates})`);
      }
    }
  }

  // Skills (up to 15)
  const skills = (person.skills || []).slice(0, 15);
  if (skills.length > 0) {
    lines.push(`  Skills: ${skills.join(", ")}`);
  }

  // Education
  if (person.education && person.education.length > 0) {
    const edu = person.education
      .filter((e) => e.school?.name)
      .slice(0, 2);
    if (edu.length > 0) {
      lines.push("  Education:");
      for (const e of edu) {
        const degree = e.degrees?.[0] || "";
        const major = e.majors?.[0] || "";
        const school = e.school?.name || "";
        lines.push(`    - ${[degree, major].filter(Boolean).join(" in ")}${school ? ` @ ${school}` : ""}`);
      }
    }
  }

  return lines.join("\n");
}
