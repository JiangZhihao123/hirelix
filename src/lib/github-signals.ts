type GithubSignalStatus =
  | "verified"
  | "missing_public_data"
  | "ambiguous_match"
  | "api_error";

type GithubDiscoverySource =
  | "explicit_url"
  | "github_search"
  | "serper_search"
  | "none";

type GithubEvidenceStrength = "strong" | "medium" | "weak" | "none";

type GithubCandidateInput = {
  name: string;
  headline?: string | null;
  location?: string | null;
  skills?: string[];
  githubUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  requiredSkills?: string[];
};

type GithubDiscoveryResult = {
  username: string | null;
  url: string | null;
  confidence: number;
  source: GithubDiscoverySource;
  notes: string[];
};

type GithubLanguageSignal = {
  name: string;
  weight: number;
};

type GithubCommitMessageQuality = {
  label: "strong" | "mixed" | "weak" | "unknown";
  detail: string;
};

export type GithubSignals = {
  status: GithubSignalStatus;
  profile_login: string | null;
  profile_url: string | null;
  activity_trend: string | null;
  top_languages: string[];
  top_language_weights?: GithubLanguageSignal[];
  merged_pr_count: number | null;
  commit_message_quality: string | null;
  highlight: string | null;
  discovery_confidence: number;
  github_signal_score: number | null;
  evidence_strength: GithubEvidenceStrength;
  recruiter_summary: string | null;
  outreach_angle: string | null;
  verification_risks: string[];
  discovery_notes: string[];
  evidence_summary: string[];
  last_enriched_at: string;
};

type GithubEnrichmentResult = {
  githubUrl: string | null;
  githubSignals: GithubSignals;
  githubSignalScore: number | null;
  githubDiscoveryConfidence: number;
};

type ContributionDay = {
  contributionCount: number;
  date: string;
};

type RepositoryContributionSummary = {
  nameWithOwner: string;
  ownerLogin: string | null;
  url: string | null;
  languageWeights: GithubLanguageSignal[];
  contributionCount: number;
};

type RecentCommitSample = {
  repo: string;
  message: string;
};

type SerperGithubSearchResult = {
  link: string | null;
  title: string | null;
  snippet: string | null;
};

type GithubEvidenceReadout = {
  evidenceStrength: GithubEvidenceStrength;
  recruiterSummary: string;
  outreachAngle: string;
  verificationRisks: string[];
};

type MergedPrSignal = {
  count: number;
  highlights: Array<{
    repo: string | null;
    title: string | null;
    url: string | null;
  }>;
};

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const CONTRIBUTION_REPO_LIMIT = 8;
const RECENT_COMMIT_SAMPLE_LIMIT = 25;
const GITHUB_MATCH_CONFIDENCE_THRESHOLD = 0.58;
const SERPER_API_BASE = "https://google.serper.dev";
const GITHUB_RATE_LIMIT_FALLBACK_COOLDOWN_MS = 60_000;

let githubApiCooldownUntilMs = 0;

class GithubRateLimitError extends Error {
  readonly status: number;
  readonly resetAt: string | null;

  constructor(status: number, resetAtMs: number | null) {
    const resetAt = resetAtMs ? new Date(resetAtMs).toISOString() : null;
    super(
      resetAt
        ? `GitHub API rate limit exceeded. Cooldown active until ${resetAt}.`
        : "GitHub API rate limit exceeded. Cooldown active before retrying.",
    );
    this.name = "GithubRateLimitError";
    this.status = status;
    this.resetAt = resetAt;
  }
}

export function resetGithubApiRateLimitStateForTests() {
  githubApiCooldownUntilMs = 0;
}

function normalizeText(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function compactStringArray(values: Array<string | null | undefined>, maxItems: number) {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
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

function extractUsernameFromGithubUrl(url: string | null | undefined) {
  if (!url) return null;
  const match = url.match(/github\.com\/([A-Za-z0-9-]+)(?:\/)?$/i);
  return match?.[1] || null;
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

function getGitHubToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || "";
  return token.trim() || null;
}

function getGitHubRequestHeaders(token: string, init?: RequestInit) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "Hirelix",
    ...(init?.headers || {}),
  };
}

function resolveRetryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp) && timestamp > Date.now()) {
    return timestamp - Date.now();
  }

  return null;
}

function resolveGithubRateLimitResetAtMs(headers: Headers) {
  const retryAfterMs = resolveRetryAfterMs(headers.get("retry-after"));
  if (retryAfterMs) {
    return Date.now() + retryAfterMs;
  }

  const resetEpochSeconds = Number.parseInt(headers.get("x-ratelimit-reset") || "", 10);
  if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds > 0) {
    return resetEpochSeconds * 1000;
  }

  return Date.now() + GITHUB_RATE_LIMIT_FALLBACK_COOLDOWN_MS;
}

function isGithubRateLimitResponse(response: Response, bodyText: string) {
  if (response.status === 429) return true;
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (remaining === "0") return true;

  if (response.status !== 403) return false;
  const normalizedBody = bodyText.toLowerCase();
  return normalizedBody.includes("rate limit");
}

function buildGithubRateLimitError(status: number, headers: Headers) {
  const resetAtMs = resolveGithubRateLimitResetAtMs(headers);
  githubApiCooldownUntilMs = Math.max(githubApiCooldownUntilMs, resetAtMs);
  return new GithubRateLimitError(status, resetAtMs);
}

function throwIfGithubApiCoolingDown() {
  if (githubApiCooldownUntilMs > Date.now()) {
    throw new GithubRateLimitError(403, githubApiCooldownUntilMs);
  }
}

async function githubFetch(path: string, init?: RequestInit) {
  const token = getGitHubToken();
  if (!token) {
    throw new Error("GITHUB_TOKEN is missing");
  }

  throwIfGithubApiCoolingDown();

  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: getGitHubRequestHeaders(token, init),
  });

  if (!response.ok) {
    const text = await response.text();
    if (isGithubRateLimitResponse(response, text)) {
      throw buildGithubRateLimitError(response.status, response.headers);
    }
    throw new Error(`GitHub REST failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json();
}

async function githubGraphql<T>(query: string, variables: Record<string, unknown>) {
  const token = getGitHubToken();
  if (!token) {
    throw new Error("GITHUB_TOKEN is missing");
  }

  throwIfGithubApiCoolingDown();

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getGitHubRequestHeaders(token),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (isGithubRateLimitResponse(response, text)) {
      throw buildGithubRateLimitError(response.status, response.headers);
    }
    throw new Error(`GitHub GraphQL failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    if (payload.errors.some((entry) => (entry.message || "").toLowerCase().includes("rate limit"))) {
      throw buildGithubRateLimitError(response.status || 403, response.headers);
    }
    throw new Error(payload.errors.map((entry) => entry.message || "Unknown GraphQL error").join("; "));
  }

  return payload.data as T;
}

async function serperGithubSearch(apiKey: string, query: string) {
  const response = await fetch(`${SERPER_API_BASE}/search`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5, page: 1 }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper search failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    organic?: Array<{
      link?: string | null;
      title?: string | null;
      snippet?: string | null;
    }>;
  };
  return (payload.organic || []).map((result) => ({
    link: result.link || null,
    title: result.title || null,
    snippet: result.snippet || null,
  })) as SerperGithubSearchResult[];
}

function extractDiscoveryTexts(input: GithubCandidateInput) {
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
      input.headline || null,
      about,
      rawProfile,
      workHistory,
    ],
    20,
  );
}

function extractCurrentCompanyFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const workHistory = Array.isArray(metadata?.work_history) ? metadata.work_history : [];
  for (const entry of workHistory) {
    if (!entry || typeof entry !== "object") continue;
    const company = (entry as Record<string, unknown>).company;
    if (typeof company === "string" && company.trim()) return company.trim();
  }
  return null;
}

function extractCurrentCompanyFromHeadline(headline: string | null | undefined) {
  if (!headline) return null;
  const match = headline.match(/\bat\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function extractPrimaryRoleFromHeadline(headline: string | null | undefined) {
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

function computeUserMatchScore(params: {
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

async function discoverGithubIdentity(input: GithubCandidateInput): Promise<GithubDiscoveryResult> {
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
      };
    }
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
      `"${input.name}" in:bio type:user`,
      `${nameParts.join(" ")} ${compactStringArray(input.skills || [], 2).join(" ")} type:user`.trim(),
    ],
    4,
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

  for (const query of queries) {
    const search = await githubFetch(`/search/users?q=${encodeURIComponent(query)}&per_page=5`) as {
      items?: Array<{ login: string }>;
    };
    for (const item of search.items || []) {
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
  }

  const ranked = candidates
    .sort((left, right) => right.score - left.score)
    .filter((item, index, list) => list.findIndex((entry) => entry.login === item.login) === index);

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < GITHUB_MATCH_CONFIDENCE_THRESHOLD || (second && best.score - second.score < 0.12)) {
    const serperFallback = await discoverGithubIdentityViaSerper(input).catch(() => null);
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
    };
  }

  return {
    username: best.login,
    url: best.url,
    confidence: best.score,
    source: "github_search",
    notes: best.notes,
  };
}

async function discoverGithubIdentityViaSerper(input: GithubCandidateInput): Promise<GithubDiscoveryResult | null> {
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
    source: "serper_search",
    notes: best.notes,
  };
}

function getSerperApiKey() {
  const key = process.env.SERPER_API_KEY || "";
  return key.trim() || null;
}

export function classifyActivityTrendFromWeeks(days: ContributionDay[]) {
  if (days.length === 0) return "No recent public contributions found.";

  const weekSums: number[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7);
    weekSums.push(slice.reduce((sum, day) => sum + (day.contributionCount || 0), 0));
  }

  const activeWeeks = weekSums.filter((value) => value > 0);
  const total = weekSums.reduce((sum, value) => sum + value, 0);
  const maxWeek = Math.max(...weekSums, 0);
  const activeRatio = activeWeeks.length / Math.max(1, weekSums.length);

  if (total === 0) return "No recent public contributions found.";
  if (activeRatio >= 0.65 && maxWeek < total * 0.35) {
    return "Stable contributor across the last 12 months.";
  }
  if (maxWeek >= total * 0.45) {
    return "Contribution pattern is spiky, with concentrated bursts rather than steady output.";
  }
  if (activeRatio <= 0.3) {
    return "Sparse public contribution history over the last 12 months.";
  }
  return "Moderately active, but contribution cadence is uneven.";
}

function mergeLanguageWeights(entries: GithubLanguageSignal[]) {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.name, (totals.get(entry.name) || 0) + entry.weight);
  }
  return [...totals.entries()]
    .map(([name, weight]) => ({ name, weight: round(weight, 2) }))
    .sort((left, right) => right.weight - left.weight);
}

export function evaluateCommitMessageQuality(messages: string[]): GithubCommitMessageQuality {
  if (messages.length === 0) {
    return {
      label: "unknown",
      detail: "No recent public commit messages available to sample.",
    };
  }

  let strong = 0;
  let weak = 0;
  for (const message of messages) {
    const normalized = message.trim().toLowerCase();
    const looksConventional = /^(feat|fix|refactor|docs|test|chore|perf|build|ci)(\(.+\))?:\s+\S+/.test(normalized);
    const isGeneric = /^(fix|update|wip|misc|test|bugfix|changes?)$/.test(normalized);
    if (looksConventional || (normalized.length >= 16 && normalized.split(/\s+/).length >= 3)) {
      strong += 1;
    } else if (isGeneric || normalized.length <= 8) {
      weak += 1;
    }
  }

  const strongRatio = strong / messages.length;
  const weakRatio = weak / messages.length;

  if (strongRatio >= 0.6) {
    return {
      label: "strong",
      detail: "Recent commit messages are mostly descriptive and specific.",
    };
  }
  if (weakRatio >= 0.5) {
    return {
      label: "weak",
      detail: "Recent commit messages skew generic or too terse.",
    };
  }
  return {
    label: "mixed",
    detail: "Recent commit messages are usable but inconsistent in specificity.",
  };
}

export function computeGithubSignalScore(params: {
  requiredSkills: string[];
  activityTrend: string | null;
  topLanguages: string[];
  mergedPrCount: number | null;
  commitMessageQuality: GithubCommitMessageQuality;
}) {
  let score = 0;

  if (params.activityTrend?.includes("Stable contributor")) score += 28;
  else if (params.activityTrend?.includes("Moderately active")) score += 18;
  else if (params.activityTrend?.includes("spiky")) score += 10;
  else if (params.activityTrend?.includes("Sparse")) score += 6;

  const required = params.requiredSkills.map((skill) => normalizeText(skill));
  const overlap = params.topLanguages.filter((language) =>
    required.some((skill) => skill.includes(normalizeText(language)) || normalizeText(language).includes(skill)),
  ).length;
  score += Math.min(24, overlap * 8);

  const mergedPrCount = params.mergedPrCount || 0;
  if (mergedPrCount >= 10) score += 22;
  else if (mergedPrCount >= 4) score += 16;
  else if (mergedPrCount >= 1) score += 10;

  if (params.commitMessageQuality.label === "strong") score += 18;
  else if (params.commitMessageQuality.label === "mixed") score += 12;
  else if (params.commitMessageQuality.label === "weak") score += 5;

  return clamp(Math.round(score), 0, 100);
}

export function buildRecruiterFacingGithubReadout(params: {
  status: GithubSignalStatus;
  candidateName: string;
  headline?: string | null;
  currentCompany?: string | null;
  requiredSkills: string[];
  activityTrend: string | null;
  topLanguages: string[];
  mergedPrCount: number | null;
  commitMessageQuality: GithubCommitMessageQuality;
  githubSignalScore: number | null;
  highlight: string | null;
  discoveryConfidence: number;
  discoveryNotes?: string[];
}) : GithubEvidenceReadout {
  if (params.status !== "verified") {
    const company = params.currentCompany || extractCurrentCompanyFromHeadline(params.headline);
    const role = extractPrimaryRoleFromHeadline(params.headline) || "engineering work";
    const skillHint = compactStringArray(params.requiredSkills, 2).join(" and ");
    return {
      evidenceStrength: "none",
      recruiterSummary: `${params.candidateName} still looks worth reviewing from LinkedIn as a ${role}${company ? ` at ${company}` : ""}, but no public GitHub evidence was verified.`,
      outreachAngle: skillHint
        ? `Lead with the LinkedIn background and connect it to the role's ${skillHint} needs.`
        : "Lead with one concrete LinkedIn career detail instead of code evidence.",
      verificationRisks: compactStringArray(
        [
          "No public GitHub footprint was verified, so technical depth should be checked manually.",
          params.discoveryConfidence > 0 ? "A possible GitHub match existed, but identity confidence stayed too low." : null,
        ],
        3,
      ),
    };
  }

  const mergedPrCount = params.mergedPrCount || 0;
  const topLanguageText = params.topLanguages.slice(0, 2).join(" and ");
  const strongestSkill = compactStringArray(params.requiredSkills, 2).join(" and ");
  const evidenceStrength: GithubEvidenceStrength =
    typeof params.githubSignalScore === "number" && params.githubSignalScore >= 65
      ? "strong"
      : mergedPrCount >= 1 || (params.topLanguages.length > 0 && params.activityTrend?.includes("Stable contributor"))
        ? "medium"
        : "weak";

  const recruiterSummary =
    evidenceStrength === "strong"
      ? `${params.candidateName} looks worth contacting because the public GitHub footprint backs up the resume with concrete ${topLanguageText || "engineering"} work${mergedPrCount > 0 ? ` and ${mergedPrCount} merged PRs into external repositories` : ""}.`
      : `${params.candidateName} looks worth contacting because GitHub supports the LinkedIn story${topLanguageText ? ` through visible ${topLanguageText} work` : ""}${mergedPrCount > 0 ? ` and ${mergedPrCount} merged external PRs` : ""}.`;

  const outreachAngle = params.highlight
    ? `Open with this proof point: ${params.highlight}`
    : strongestSkill
      ? `Lead with the candidate's ${strongestSkill} alignment and reference the visible public code work.`
      : "Lead with the strongest visible public code contribution before pitching the role.";

  const verificationRisks = compactStringArray(
    [
      params.discoveryConfidence < 0.7 ? "GitHub identity is likely correct, but confidence is not fully high yet." : null,
      params.activityTrend?.includes("Sparse") ? "Public contribution history is sparse, so validate current hands-on depth in conversation." : null,
      params.activityTrend?.includes("spiky") ? "Contribution cadence is bursty, so check whether recent activity reflects day-to-day work." : null,
      mergedPrCount === 0 ? "No external merged PR signal surfaced, so collaboration style should be validated manually." : null,
      params.commitMessageQuality.label === "unknown" || params.commitMessageQuality.label === "weak"
        ? "Commit-message quality signal is weak or missing; ask for concrete production examples."
        : null,
      params.discoveryNotes?.some((note) => note.includes("serper"))
        ? "Identity was recovered through external search, so keep one quick sanity check in the first review."
        : null,
    ],
    3,
  );

  return {
    evidenceStrength,
    recruiterSummary,
    outreachAngle,
    verificationRisks,
  };
}

async function fetchContributionSignals(username: string) {
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();

  const data = await githubGraphql<{
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          weeks?: Array<{
            contributionDays?: Array<{
              contributionCount?: number;
              date?: string;
            }>;
          }>;
        };
        commitContributionsByRepository?: Array<{
          repository?: {
            nameWithOwner?: string;
            url?: string;
            owner?: { login?: string | null } | null;
            languages?: {
              edges?: Array<{
                size?: number;
                node?: { name?: string | null } | null;
              }>;
            } | null;
          } | null;
          contributions?: { totalCount?: number | null } | null;
        }>;
      };
    };
  }>(
    `query GitHubSignals($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
          commitContributionsByRepository(maxRepositories: ${CONTRIBUTION_REPO_LIMIT}) {
            repository {
              nameWithOwner
              url
              owner { login }
              languages(first: 5, orderBy: { field: SIZE, direction: DESC }) {
                edges {
                  size
                  node { name }
                }
              }
            }
            contributions(first: 1) {
              totalCount
            }
          }
        }
      }
    }`,
    { login: username, from, to },
  );

  const days: ContributionDay[] = [];
  for (const week of data.user?.contributionsCollection?.contributionCalendar?.weeks || []) {
    for (const day of week.contributionDays || []) {
      days.push({
        contributionCount: day.contributionCount || 0,
        date: day.date || "",
      });
    }
  }

  const repoSummaries: RepositoryContributionSummary[] = [];
  for (const item of data.user?.contributionsCollection?.commitContributionsByRepository || []) {
    const repository = item.repository;
    if (!repository?.nameWithOwner) continue;
    const contributionCount = item.contributions?.totalCount || 0;
    const languageWeights = (repository.languages?.edges || [])
      .map((edge) => ({
        name: edge.node?.name || "",
        weight: contributionCount * ((edge.size || 0) / Math.max(1, (repository.languages?.edges || []).reduce((sum, entry) => sum + (entry.size || 0), 0))),
      }))
      .filter((entry) => entry.name && entry.weight > 0);
    repoSummaries.push({
      nameWithOwner: repository.nameWithOwner,
      ownerLogin: repository.owner?.login || null,
      url: repository.url || null,
      languageWeights,
      contributionCount,
    });
  }

  return {
    days,
    repoSummaries,
  };
}

function repositoryNameFromApiUrl(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/\/repos\/([^/]+\/[^/]+)$/);
  return match?.[1] || null;
}

async function fetchMergedPrSignals(username: string): Promise<MergedPrSignal> {
  const data = await githubFetch(`/search/issues?q=${encodeURIComponent(`type:pr is:merged author:${username} -user:${username} archived:false`)}&per_page=5`) as {
    total_count?: number;
    items?: Array<{
      title?: string | null;
      html_url?: string | null;
      repository_url?: string | null;
    }>;
  };
  return {
    count: data.total_count || 0,
    highlights: (data.items || []).map((item) => ({
      repo: repositoryNameFromApiUrl(item.repository_url),
      title: item.title || null,
      url: item.html_url || null,
    })),
  };
}

async function fetchRecentCommitSamples(username: string, repoNames: string[]) {
  const samples: RecentCommitSample[] = [];

  const uniqueRepos = compactStringArray(repoNames, 5);
  for (const repo of uniqueRepos) {
    try {
      const commits = await githubFetch(`/repos/${repo}/commits?author=${encodeURIComponent(username)}&per_page=5`) as Array<{
        commit?: { message?: string | null };
      }>;
      for (const entry of commits || []) {
        const message = entry.commit?.message?.trim();
        if (!message) continue;
        samples.push({ repo, message });
        if (samples.length >= RECENT_COMMIT_SAMPLE_LIMIT) {
          return samples;
        }
      }
    } catch {
      // Continue on per-repo failure.
    }
  }

  return samples;
}

function buildGithubHighlight(params: {
  username: string;
  activityTrend: string;
  topLanguages: string[];
  repoSummaries: RepositoryContributionSummary[];
  mergedPrSignals: MergedPrSignal;
}) {
  const topMergedPr = params.mergedPrSignals.highlights[0];
  if (topMergedPr?.repo && topMergedPr.title) {
    return `${params.username} has a merged PR in ${topMergedPr.repo} titled "${topMergedPr.title}", which is a concrete open-source collaboration signal.`;
  }
  const topRepo = params.repoSummaries[0];
  if (topRepo) {
    const language = topRepo.languageWeights[0]?.name || params.topLanguages[0] || "their main stack";
    return `${params.username} shows concrete public code work in ${topRepo.nameWithOwner}, with ${topRepo.contributionCount} tracked commit contributions concentrated in ${language}.`;
  }
  if (params.mergedPrSignals.count > 0) {
    return `${params.username} has ${params.mergedPrSignals.count} merged PRs into repositories they do not own, which is a strong collaboration signal.`;
  }
  if (params.topLanguages.length > 0) {
    return `${params.username} has recent public contribution activity in ${params.topLanguages.slice(0, 2).join(" and ")}.`;
  }
  return params.activityTrend;
}

export async function enrichGithubSignalsForCandidate(
  input: GithubCandidateInput,
): Promise<GithubEnrichmentResult> {
  const timestamp = new Date().toISOString();
  const currentCompany =
    extractCurrentCompanyFromMetadata(input.metadata) ||
    extractCurrentCompanyFromHeadline(input.headline);
  if (!getGitHubToken()) {
    const readout = buildRecruiterFacingGithubReadout({
      status: "missing_public_data",
      candidateName: input.name,
      headline: input.headline,
      currentCompany,
      requiredSkills: input.requiredSkills || [],
      activityTrend: null,
      topLanguages: [],
      mergedPrCount: null,
      commitMessageQuality: {
        label: "unknown",
        detail: "No recent public commit messages available to sample.",
      },
      githubSignalScore: null,
      highlight: null,
      discoveryConfidence: 0,
    });
    return {
      githubUrl: input.githubUrl || null,
      githubSignals: {
        status: "missing_public_data",
        profile_login: extractUsernameFromGithubUrl(input.githubUrl),
        profile_url: input.githubUrl || null,
        activity_trend: null,
        top_languages: [],
        merged_pr_count: null,
        commit_message_quality: null,
        highlight: null,
        discovery_confidence: 0,
        github_signal_score: null,
        evidence_strength: readout.evidenceStrength,
        recruiter_summary: readout.recruiterSummary,
        outreach_angle: readout.outreachAngle,
        verification_risks: readout.verificationRisks,
        discovery_notes: ["github_token_missing"],
        evidence_summary: compactStringArray(
          [readout.recruiterSummary, "GitHub API token is not configured."],
          4,
        ),
        last_enriched_at: timestamp,
      },
      githubSignalScore: null,
      githubDiscoveryConfidence: 0,
    };
  }

  try {
    const discovery = await discoverGithubIdentity(input);
    if (!discovery.username || !discovery.url) {
      const missingStatus = discovery.confidence > 0 ? "ambiguous_match" : "missing_public_data";
      const readout = buildRecruiterFacingGithubReadout({
        status: missingStatus,
        candidateName: input.name,
        headline: input.headline,
        currentCompany,
        requiredSkills: input.requiredSkills || [],
        activityTrend: null,
        topLanguages: [],
        mergedPrCount: null,
        commitMessageQuality: {
          label: "unknown",
          detail: "No recent public commit messages available to sample.",
        },
        githubSignalScore: null,
        highlight: null,
        discoveryConfidence: round(discovery.confidence, 3),
        discoveryNotes: discovery.notes,
      });
      return {
        githubUrl: null,
        githubSignals: {
          status: missingStatus,
          profile_login: null,
          profile_url: null,
          activity_trend: null,
          top_languages: [],
          merged_pr_count: null,
          commit_message_quality: null,
          highlight: null,
          discovery_confidence: round(discovery.confidence, 3),
          github_signal_score: null,
          evidence_strength: readout.evidenceStrength,
          recruiter_summary: readout.recruiterSummary,
          outreach_angle: readout.outreachAngle,
          verification_risks: readout.verificationRisks,
          discovery_notes: discovery.notes,
          evidence_summary: compactStringArray(
            [
              readout.recruiterSummary,
              ...discovery.notes,
            ],
            6,
          ),
          last_enriched_at: timestamp,
        },
        githubSignalScore: null,
        githubDiscoveryConfidence: round(discovery.confidence, 3),
      };
    }

    const metadataRepoNames = repoSummariesFromMetadata(input.metadata);
    const { days, repoSummaries } = await fetchContributionSignals(discovery.username);
    const mergedPrSignals = await fetchMergedPrSignals(discovery.username);

    const commitSamples = await fetchRecentCommitSamples(
      discovery.username,
      metadataRepoNames,
    ).catch(() => [] as RecentCommitSample[]);

    const repoBackfillSamples = commitSamples.length > 0
      ? commitSamples
      : await fetchRecentCommitSamples(
        discovery.username,
        repoSummaries.map((entry) => entry.nameWithOwner),
      );

    const activityTrend = classifyActivityTrendFromWeeks(days);
    const topLanguageWeights = mergeLanguageWeights(
      repoSummaries.flatMap((entry) => entry.languageWeights),
    ).slice(0, 5);
    const topLanguages = topLanguageWeights.map((entry) => entry.name);
    const commitMessageQuality = evaluateCommitMessageQuality(
      repoBackfillSamples.map((entry) => entry.message),
    );
    const githubSignalScore = computeGithubSignalScore({
      requiredSkills: input.requiredSkills || [],
      activityTrend,
      topLanguages,
      mergedPrCount: mergedPrSignals.count,
      commitMessageQuality,
    });
    const highlight = buildGithubHighlight({
      username: discovery.username,
      activityTrend,
      topLanguages,
      repoSummaries,
      mergedPrSignals,
    });
    const readout = buildRecruiterFacingGithubReadout({
      status: "verified",
      candidateName: input.name,
      headline: input.headline,
      currentCompany,
      requiredSkills: input.requiredSkills || [],
      activityTrend,
      topLanguages,
      mergedPrCount: mergedPrSignals.count,
      commitMessageQuality,
      githubSignalScore,
      highlight,
      discoveryConfidence: round(discovery.confidence, 3),
      discoveryNotes: discovery.notes,
    });

    return {
      githubUrl: discovery.url,
      githubSignals: {
        status: "verified",
        profile_login: discovery.username,
        profile_url: discovery.url,
        activity_trend: activityTrend,
        top_languages: topLanguages,
        top_language_weights: topLanguageWeights,
        merged_pr_count: mergedPrSignals.count,
        commit_message_quality: `${commitMessageQuality.label}: ${commitMessageQuality.detail}`,
        highlight,
        discovery_confidence: round(discovery.confidence, 3),
        github_signal_score: githubSignalScore,
        evidence_strength: readout.evidenceStrength,
        recruiter_summary: readout.recruiterSummary,
        outreach_angle: readout.outreachAngle,
        verification_risks: readout.verificationRisks,
        discovery_notes: discovery.notes,
        evidence_summary: compactStringArray(
          [
            readout.recruiterSummary,
            highlight,
            activityTrend,
            mergedPrSignals.highlights[0]?.title
              ? `Merged PR proof: ${mergedPrSignals.highlights[0]?.title}${mergedPrSignals.highlights[0]?.repo ? ` in ${mergedPrSignals.highlights[0]?.repo}` : ""}`
              : mergedPrSignals.count > 0
                ? `${mergedPrSignals.count} merged PRs into external repositories`
                : null,
            commitMessageQuality.detail,
          ],
          6,
        ),
        last_enriched_at: timestamp,
      },
      githubSignalScore,
      githubDiscoveryConfidence: round(discovery.confidence, 3),
    };
  } catch (error) {
    const isRateLimited = error instanceof GithubRateLimitError;
    const rateLimitSummary = isRateLimited
      ? error.message
      : "GitHub enrichment hit an API error; verify manually before relying on code evidence.";
    const readout = buildRecruiterFacingGithubReadout({
      status: "api_error",
      candidateName: input.name,
      headline: input.headline,
      currentCompany,
      requiredSkills: input.requiredSkills || [],
      activityTrend: null,
      topLanguages: [],
      mergedPrCount: null,
      commitMessageQuality: {
        label: "unknown",
        detail: "No recent public commit messages available to sample.",
      },
      githubSignalScore: null,
      highlight: null,
      discoveryConfidence: 0,
    });
    return {
      githubUrl: input.githubUrl || null,
      githubSignals: {
        status: "api_error",
        profile_login: extractUsernameFromGithubUrl(input.githubUrl),
        profile_url: input.githubUrl || null,
        activity_trend: null,
        top_languages: [],
        merged_pr_count: null,
        commit_message_quality: null,
        highlight: null,
        discovery_confidence: 0,
        github_signal_score: null,
        evidence_strength: readout.evidenceStrength,
        recruiter_summary: readout.recruiterSummary,
        outreach_angle: readout.outreachAngle,
        verification_risks: compactStringArray(
          [...readout.verificationRisks, rateLimitSummary],
          3,
        ),
        discovery_notes: [isRateLimited ? "api_rate_limited" : "api_error"],
        evidence_summary: compactStringArray(
          [readout.recruiterSummary, isRateLimited ? rateLimitSummary : (error instanceof Error ? error.message : String(error))],
          4,
        ),
        last_enriched_at: timestamp,
      },
      githubSignalScore: null,
      githubDiscoveryConfidence: 0,
    };
  }
}

function repoSummariesFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const workHistory = Array.isArray(metadata?.work_history) ? metadata.work_history : [];
  return workHistory
    .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>).company : null))
    .filter((value): value is string => typeof value === "string" && value.includes("/"));
}

export function applyGithubSignalsToCandidateRow<TCandidate extends {
  match_score: number;
  match_reasons: string[];
  github_url: string | null;
  metadata: Record<string, unknown>;
}>(params: {
  candidate: TCandidate;
  enrichment: GithubEnrichmentResult;
}): TCandidate {
  const metadata = { ...(params.candidate.metadata || {}) };
  const baseOverallScore =
    typeof metadata.overall_score === "number"
      ? metadata.overall_score
      : params.candidate.match_score;
  const githubSignalScore = params.enrichment.githubSignalScore;
  const nextOverallScore =
    typeof githubSignalScore === "number"
      ? Math.round(baseOverallScore * 0.7 + githubSignalScore * 0.3)
      : baseOverallScore;

  metadata.github_signals = params.enrichment.githubSignals;
  metadata.github_signal_score = githubSignalScore;
  metadata.github_discovery_confidence = params.enrichment.githubDiscoveryConfidence;
  metadata.base_overall_score = baseOverallScore;
  metadata.overall_score = nextOverallScore;
  if (metadata.suitability && typeof metadata.suitability === "object") {
    const suitability = { ...(metadata.suitability as Record<string, unknown>) };
    suitability.overall_score = nextOverallScore;
    metadata.suitability = suitability;
  }
  if (metadata.scoring_breakdown && typeof metadata.scoring_breakdown === "object") {
    const scoringBreakdown = { ...(metadata.scoring_breakdown as Record<string, unknown>) };
    scoringBreakdown.overall_score = nextOverallScore;
    metadata.scoring_breakdown = scoringBreakdown;
  }

  const nextReasons = [...params.candidate.match_reasons];
  if (params.enrichment.githubSignals.recruiter_summary) {
    nextReasons.unshift(params.enrichment.githubSignals.recruiter_summary);
  }
  if (params.enrichment.githubSignals.status === "verified" && params.enrichment.githubSignals.highlight) {
    nextReasons.unshift(params.enrichment.githubSignals.highlight);
  }

  return {
    ...params.candidate,
    github_url: params.enrichment.githubUrl || params.candidate.github_url,
    match_score: nextOverallScore,
    match_reasons: compactStringArray(nextReasons, 5),
    metadata,
  };
}
