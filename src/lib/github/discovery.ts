import type { GithubCandidateInput, GithubDiscoveryResult, GithubIdentityEvidence } from "./types";
import { githubFetch, serperGithubSearch, getSerperApiKey } from "./api";
import { extractPublicProfileLinks, type PublicProfileLinks } from "./public-links";

export function normalizeText(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function compactStringArray(values: Array<string | null | undefined>, maxItems: number) {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function extractGitHubUrlsFromText(text: string) {
  if (!text.trim()) return [];
  const matches = text.match(/https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)(?:\/)?/gi) || [];
  return compactStringArray(
    matches.map((match) => match.replace(/\/+$/, "")),
    5,
  );
}

export function extractUsernameFromGithubUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== "github.com" && parsed.hostname.toLowerCase() !== "www.github.com") {
      return null;
    }
    const owner = parsed.pathname.split("/").filter(Boolean)[0];
    if (!owner || RESERVED_GITHUB_PATHS.has(owner.toLowerCase())) return null;
    return /^[A-Za-z0-9-]+$/.test(owner) ? owner : null;
  } catch {
    return null;
  }
}

const RESERVED_GITHUB_PATHS = new Set([
  "about",
  "account",
  "apps",
  "blog",
  "collections",
  "contact",
  "dashboard",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "gists",
  "github",
  "home",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "repositories",
  "search",
  "security",
  "settings",
  "signup",
  "site",
  "sponsors",
  "stars",
  "topics",
  "trending",
  "users",
]);

export function extractGithubOwnerCandidateFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com" && host !== "gist.github.com") {
      return null;
    }

    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length === 0) return null;

    const owner = segments[0];
    if (!/^[A-Za-z0-9-]+$/.test(owner)) return null;
    if (RESERVED_GITHUB_PATHS.has(owner.toLowerCase())) return null;
    return owner;
  } catch {
    return null;
  }
}

function extractGithubOwnerCandidatesFromText(text: string) {
  if (!text.trim()) return [];
  const rawMatches = text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s)"']+|https?:\/\/gist\.github\.com\/[^\s)"']+/gi) || [];
  return compactStringArray(
    rawMatches
      .map((match) => extractGithubOwnerCandidateFromUrl(match.replace(/[),.;]+$/, "")))
      .filter((value): value is string => Boolean(value)),
    6,
  );
}

export function extractDiscoveryTexts(input: GithubCandidateInput) {
  const rawProfile =
    input.metadata?.raw_profile && typeof input.metadata.raw_profile === "object"
      ? JSON.stringify(input.metadata.raw_profile)
      : "";
  const workHistory =
    Array.isArray(input.metadata?.work_history) ? JSON.stringify(input.metadata.work_history) : "";
  const about =
    typeof input.metadata?.about === "string" ? input.metadata.about : "";

  return compactStringArray(
    [
      input.githubUrl || null,
      ...extractPublicLinksFromMetadata(input.metadata).github_urls,
      ...extractPublicLinksFromMetadata(input.metadata).personal_sites,
      ...extractPublicLinksFromMetadata(input.metadata).developer_profiles,
      input.headline || null,
      about,
      rawProfile,
      workHistory,
    ],
    20,
  );
}

function extractPublicLinksFromMetadata(metadata: Record<string, unknown> | null | undefined): PublicProfileLinks {
  const existing = metadata?.public_links;
  const fromMetadata = existing && typeof existing === "object"
    ? {
      github_urls: Array.isArray((existing as Record<string, unknown>).github_urls)
        ? ((existing as Record<string, unknown>).github_urls as unknown[]).filter((entry): entry is string => typeof entry === "string")
        : [],
      personal_sites: Array.isArray((existing as Record<string, unknown>).personal_sites)
        ? ((existing as Record<string, unknown>).personal_sites as unknown[]).filter((entry): entry is string => typeof entry === "string")
        : [],
      developer_profiles: Array.isArray((existing as Record<string, unknown>).developer_profiles)
        ? ((existing as Record<string, unknown>).developer_profiles as unknown[]).filter((entry): entry is string => typeof entry === "string")
        : [],
      source_fields: Array.isArray((existing as Record<string, unknown>).source_fields)
        ? ((existing as Record<string, unknown>).source_fields as unknown[]).filter((entry): entry is string => typeof entry === "string")
        : [],
    }
    : null;

  return fromMetadata || extractPublicProfileLinks(metadata || {});
}

export function extractCurrentCompanyFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const workHistory = Array.isArray(metadata?.work_history) ? metadata.work_history : [];
  for (const entry of workHistory) {
    if (!entry || typeof entry !== "object") continue;
    const company = (entry as Record<string, unknown>).company;
    if (typeof company === "string" && company.trim()) return company.trim();
  }
  return null;
}

export function extractCurrentCompanyFromHeadline(headline: string | null | undefined) {
  if (!headline) return null;
  const match = headline.match(/\bat\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function extractPrimaryRoleFromHeadline(headline: string | null | undefined) {
  if (!headline) return null;
  const cleaned = headline.split(" at ")[0]?.trim();
  return cleaned || headline.trim();
}

function candidateNameAppearsInText(text: string, candidateName: string) {
  const normalizedText = normalizeText(text);
  const normalizedName = normalizeText(candidateName);
  if (!normalizedText || !normalizedName) return false;
  if (normalizedText.includes(normalizedName)) return true;
  const parts = normalizedName.split(" ").filter((part) => part.length >= 3);
  return parts.length >= 2 && parts.every((part) => normalizedText.includes(part));
}

function computeExternalResultMatchBonus(params: {
  candidateName: string;
  resultTitle?: string | null;
  resultSnippet?: string | null;
  headline?: string | null;
  requiredSkills?: string[];
}) {
  const title = params.resultTitle || "";
  const snippet = params.resultSnippet || "";
  const combined = `${title}\n${snippet}`;

  let bonus = 0;
  const notes: string[] = [];

  if (candidateNameAppearsInText(title, params.candidateName)) {
    bonus += 0.3;
    notes.push("external_title_name_match");
  } else if (candidateNameAppearsInText(combined, params.candidateName)) {
    bonus += 0.2;
    notes.push("external_snippet_name_match");
  }

  const headlineCompany = extractCurrentCompanyFromHeadline(params.headline);
  if (headlineCompany && normalizeText(combined).includes(normalizeText(headlineCompany))) {
    bonus += 0.08;
    notes.push("external_company_match");
  }

  const matchedSkills = compactStringArray(params.requiredSkills || [], 4)
    .map((skill) => normalizeText(skill))
    .filter((skill) => normalizeText(combined).includes(skill));
  if (matchedSkills.length > 0) {
    bonus += Math.min(0.12, matchedSkills.length * 0.04);
    notes.push(`external_skill_overlap:${matchedSkills.length}`);
  }

  return {
    bonus: round(bonus, 3),
    notes,
  };
}

export function computeUserMatchScore(params: {
  candidateName: string;
  headline?: string | null;
  location?: string | null;
  requiredSkills?: string[];
  profile: {
    login?: string | null;
    name?: string | null;
    company?: string | null;
    bio?: string | null;
    location?: string | null;
    blog?: string | null;
  };
}) {
  const candidateName = normalizeText(params.candidateName);
  const profileName = normalizeText(params.profile.name || params.profile.login);
  const headline = normalizeText(params.headline);
  const profileCompany = normalizeText(params.profile.company);
  const profileBio = normalizeText(params.profile.bio);
  const candidateLocation = normalizeText(params.location);
  const profileLocation = normalizeText(params.profile.location);

  let score = 0;
  const notes: string[] = [];

  const candidateParts = candidateName.split(" ").filter(Boolean);
  const exactNameMatch = profileName === candidateName;
  const strongPartialNameMatch =
    candidateParts.length >= 2 &&
    candidateParts.every((part) => profileName.includes(part));

  if (exactNameMatch) {
    score += 0.45;
    notes.push("exact_name_match");
  } else if (strongPartialNameMatch) {
    score += 0.3;
    notes.push("partial_name_match");
  }

  const companyFromHeadline = headline.includes(" at ")
    ? headline.split(" at ").slice(1).join(" at ")
    : headline;
  if (companyFromHeadline && profileCompany && (
    companyFromHeadline.includes(profileCompany) || profileCompany.includes(companyFromHeadline)
  )) {
    score += 0.2;
    notes.push("company_match");
  }

  const allSkillHints = compactStringArray(params.requiredSkills || [], 8)
    .map((skill) => normalizeText(skill))
    .filter(Boolean);
  const matchedSkills = allSkillHints.filter((skill) =>
    profileBio.includes(skill) || normalizeText(params.profile.blog).includes(skill),
  );
  if (matchedSkills.length > 0) {
    score += Math.min(0.15, matchedSkills.length * 0.05);
    notes.push(`skill_overlap:${matchedSkills.length}`);
  }

  if (candidateLocation && profileLocation && (
    candidateLocation.includes(profileLocation) || profileLocation.includes(candidateLocation)
  )) {
    score += 0.1;
    notes.push("location_match");
  }

  return {
    score: clamp(round(score, 4), 0, 1),
    notes,
  };
}

const GITHUB_MATCH_CONFIDENCE_THRESHOLD = 0.58;

function buildEvidence(params: Partial<GithubIdentityEvidence>): GithubIdentityEvidence {
  return {
    name_match: params.name_match || "none",
    company_match: Boolean(params.company_match),
    location_match: Boolean(params.location_match),
    website_backlink: Boolean(params.website_backlink),
    linkedin_or_profile_crosslink: Boolean(params.linkedin_or_profile_crosslink),
    skill_overlap: params.skill_overlap || [],
    source_urls: params.source_urls || [],
  };
}

async function fetchWebsiteText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
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
    return (await response.text()).slice(0, 200_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverGithubIdentityViaOwnedWebsite(input: GithubCandidateInput): Promise<GithubDiscoveryResult | null> {
  const publicLinks = extractPublicLinksFromMetadata(input.metadata);
  for (const site of publicLinks.personal_sites.slice(0, 2)) {
    const body = await fetchWebsiteText(site);
    if (!body) continue;
    const githubUrl = extractGitHubUrlsFromText(body)[0];
    const username = extractUsernameFromGithubUrl(githubUrl);
    if (!githubUrl || !username) continue;
    return {
      username,
      url: githubUrl,
      confidence: 0.88,
      source: "owned_website",
      notes: ["owned_website_github_link"],
      evidence: buildEvidence({
        website_backlink: true,
        source_urls: [site, githubUrl],
      }),
    };
  }
  return null;
}

export async function discoverGithubIdentity(input: GithubCandidateInput): Promise<GithubDiscoveryResult> {
  const publicLinks = extractPublicLinksFromMetadata(input.metadata);
  const explicitGithubUrl = input.githubUrl || publicLinks.github_urls[0] || null;
  const explicitUsername = extractUsernameFromGithubUrl(explicitGithubUrl);
  if (explicitGithubUrl && explicitUsername) {
    return {
      username: explicitUsername,
      url: explicitGithubUrl,
      confidence: 0.98,
      source: "explicit_url",
      notes: ["explicit_url"],
      evidence: buildEvidence({
        linkedin_or_profile_crosslink: Boolean(publicLinks.github_urls.includes(explicitGithubUrl)),
        source_urls: [explicitGithubUrl],
      }),
    };
  }

  const texts = extractDiscoveryTexts(input);
  for (const text of texts) {
    const explicit = extractGitHubUrlsFromText(text)[0];
    const username = extractUsernameFromGithubUrl(explicit);
    if (explicit && username) {
      return {
        username,
        url: explicit,
        confidence: 0.98,
        source: "explicit_url",
        notes: ["explicit_url"],
        evidence: buildEvidence({ source_urls: [explicit] }),
      };
    }

    const ownerFromNestedUrl = extractGithubOwnerCandidatesFromText(text)[0];
    if (ownerFromNestedUrl) {
      return {
        username: ownerFromNestedUrl,
        url: `https://github.com/${ownerFromNestedUrl}`,
        confidence: 0.9,
        source: "explicit_url",
        notes: ["explicit_owner_url"],
        evidence: buildEvidence({ source_urls: [`https://github.com/${ownerFromNestedUrl}`] }),
      };
    }
  }

  const ownedWebsiteResult = await discoverGithubIdentityViaOwnedWebsite(input);
  if (ownedWebsiteResult) return ownedWebsiteResult;

  const serperFallback = await discoverGithubIdentityViaSerper(input).catch(() => null);
  if (serperFallback?.username && serperFallback.url && serperFallback.confidence >= 0.78) {
    return serperFallback;
  }

  const nameParts = compactStringArray(input.name.split(/\s+/), 3);
  if (nameParts.length === 0) {
    return {
      username: null,
      url: null,
      confidence: 0,
      source: "none",
      notes: ["missing_name"],
    };
  }

  const queries = compactStringArray(
    [
      `${nameParts.join(" ")} in:fullname type:user`,
      `"${input.name}" type:user`,
    ],
    2,
  );

  const candidates: Array<{
    login: string;
    url: string;
    name: string | null;
    company: string | null;
    bio: string | null;
    location: string | null;
    score: number;
    notes: string[];
  }> = [];

  const seenLogins = new Set<string>();

  for (const query of queries) {
    const search = await githubFetch(`/search/users?q=${encodeURIComponent(query)}&per_page=3`) as {
      items?: Array<{ login: string }>;
    };
    for (const item of search.items || []) {
      if (seenLogins.has(item.login)) continue;
      seenLogins.add(item.login);
      try {
        const profile = await githubFetch(`/users/${encodeURIComponent(item.login)}`) as {
          login?: string;
          html_url?: string;
          name?: string | null;
          company?: string | null;
          bio?: string | null;
          location?: string | null;
          type?: string | null;
        };
        if ((profile.type || "User") !== "User") {
          continue;
        }
        const scored = computeUserMatchScore({
          candidateName: input.name,
          headline: input.headline,
          location: input.location,
          requiredSkills: input.requiredSkills || input.skills,
          profile,
        });
        candidates.push({
          login: profile.login || item.login,
          url: profile.html_url || `https://github.com/${item.login}`,
          name: profile.name || null,
          company: profile.company || null,
          bio: profile.bio || null,
          location: profile.location || null,
          score: scored.score,
          notes: scored.notes,
        });
      } catch {
        // Ignore per-user lookup failures and continue.
      }
    }

    // Early exit: if we already have a clear high-confidence winner, skip remaining queries.
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const second = sorted[1];
    if (top && top.score >= 0.80 && (!second || top.score - second.score >= 0.20)) {
      break;
    }
  }

  const ranked = candidates
    .sort((left, right) => right.score - left.score)
    .filter((item, index, list) => list.findIndex((entry) => entry.login === item.login) === index);

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < GITHUB_MATCH_CONFIDENCE_THRESHOLD || (second && best.score - second.score < 0.12)) {
    if (serperFallback?.username && serperFallback.url) {
      return serperFallback;
    }
    return {
      username: null,
      url: null,
      confidence: best?.score || 0,
      source: "none",
      notes: compactStringArray(
        [
          ...(best ? best.notes : ["no_match"]),
          getSerperApiKey() ? "external_search_no_hit" : "external_search_unconfigured",
        ],
        6,
      ),
      evidence: best
        ? buildEvidence({
          name_match: best.notes.includes("exact_name_match") ? "exact" : best.notes.includes("partial_name_match") ? "partial" : "none",
          company_match: best.notes.includes("company_match"),
          location_match: best.notes.includes("location_match"),
        })
        : undefined,
    };
  }

  return {
    username: best.login,
    url: best.url,
    confidence: best.score,
    source: "github_search",
    notes: best.notes,
    evidence: buildEvidence({
      name_match: best.notes.includes("exact_name_match") ? "exact" : best.notes.includes("partial_name_match") ? "partial" : "none",
      company_match: best.notes.includes("company_match"),
      location_match: best.notes.includes("location_match"),
      skill_overlap: best.notes.filter((note) => note.startsWith("skill_overlap")),
      source_urls: [best.url],
    }),
  };
}

export async function discoverGithubIdentityViaSerper(input: GithubCandidateInput): Promise<GithubDiscoveryResult | null> {
  const apiKey = getSerperApiKey();
  if (!apiKey) return null;

  const currentCompany =
    extractCurrentCompanyFromMetadata(input.metadata) ||
    extractCurrentCompanyFromHeadline(input.headline) ||
    "";
  const queryTemplates = compactStringArray(
    [
      `site:github.com "${input.name}" github`,
      `site:github.com "${input.name}" ${compactStringArray(input.skills || [], 2).join(" ")}`.trim(),
      currentCompany ? `site:github.com "${input.name}" "${currentCompany}"` : null,
      `site:github.com "${input.name}" ${extractPrimaryRoleFromHeadline(input.headline) || ""}`.trim(),
    ],
    4,
  );

  const candidateMap = new Map<string, {
    login: string;
    url: string;
    score: number;
    notes: string[];
  }>();

  for (const query of queryTemplates) {
    const results = await serperGithubSearch(apiKey, query);
    for (const result of results) {
      if (!result.link) continue;
      const login = extractGithubOwnerCandidateFromUrl(result.link);
      if (!login) continue;

      try {
        const profile = await githubFetch(`/users/${encodeURIComponent(login)}`) as {
          login?: string;
          html_url?: string;
          name?: string | null;
          company?: string | null;
          bio?: string | null;
          location?: string | null;
          blog?: string | null;
          type?: string | null;
        };
        if ((profile.type || "User") !== "User") {
          continue;
        }
        const match = computeUserMatchScore({
          candidateName: input.name,
          headline: input.headline,
          location: input.location,
          requiredSkills: input.requiredSkills || input.skills,
          profile,
        });
        const externalBonus = computeExternalResultMatchBonus({
          candidateName: input.name,
          resultTitle: result.title,
          resultSnippet: result.snippet,
          headline: input.headline,
          requiredSkills: input.requiredSkills || input.skills,
        });
        const combinedScore = clamp(round(match.score + externalBonus.bonus + 0.08, 3), 0, 1);
        const existing = candidateMap.get(profile.login || login);
        const nextCandidate = {
          login: profile.login || login,
          url: profile.html_url || `https://github.com/${login}`,
          score: combinedScore,
          notes: compactStringArray(
            [
              ...match.notes,
              ...externalBonus.notes,
              `serper_query:${query}`,
              "serper_fallback",
            ],
            8,
          ),
        };
        if (!existing || nextCandidate.score > existing.score) {
          candidateMap.set(nextCandidate.login, nextCandidate);
        }
      } catch {
        // Ignore and continue.
      }
    }
  }

  const best = [...candidateMap.values()].sort((left, right) => right.score - left.score)[0];
  if (!best || best.score < 0.38) return null;

  return {
    username: best.login,
    url: best.url,
    confidence: clamp(round(best.score, 3), 0, 1),
    source: "external_search",
    notes: best.notes,
    evidence: buildEvidence({
      name_match: best.notes.includes("exact_name_match") || best.notes.includes("external_title_name_match")
        ? "exact"
        : best.notes.includes("partial_name_match") || best.notes.includes("external_snippet_name_match")
          ? "partial"
          : "none",
      company_match: best.notes.includes("company_match") || best.notes.includes("external_company_match"),
      skill_overlap: best.notes.filter((note) => note.includes("skill_overlap")),
      source_urls: [best.url],
    }),
  };
}
