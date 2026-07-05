import {
  filterDatasetProfiles,
  getBrightDataAccountBalance,
  type BrightDataFilterRule,
  type BrightDataProfile,
} from "@/lib/brightdata";

import { readEnv } from "./env";
import type { CandidateLead, ParsedSearchIntent, ProviderName, ProviderReadiness, SourcingLane } from "./types";

export async function checkProviderReadiness(options: {
  checkNetwork: boolean;
}): Promise<ProviderReadiness[]> {
  const results: ProviderReadiness[] = [];

  const deepSeekKey = readEnv("DEEPSEEK_API_KEY");
  results.push({
    provider: "deepseek",
    required: true,
    configured: Boolean(deepSeekKey),
    usable: Boolean(deepSeekKey),
    status: deepSeekKey ? "ready" : "missing",
    message: deepSeekKey ? "DEEPSEEK_API_KEY is configured" : "DEEPSEEK_API_KEY is missing",
  });

  const serperKey = readEnv("SERPER_API_KEY");
  results.push({
    provider: "serper",
    required: true,
    configured: Boolean(serperKey),
    usable: Boolean(serperKey),
    status: serperKey ? "ready" : "missing",
    message: serperKey ? "SERPER_API_KEY is configured" : "SERPER_API_KEY is missing",
  });

  const exaKey = readEnv("EXA_API_KEY");
  results.push({
    provider: "exa",
    required: false,
    configured: Boolean(exaKey),
    usable: Boolean(exaKey),
    status: exaKey ? "ready" : "warning",
    message: exaKey ? "EXA_API_KEY is configured" : "EXA_API_KEY is missing; semantic web discovery will be skipped",
  });

  const firecrawlKey = readEnv("FIRECRAWL_API_KEY");
  results.push({
    provider: "firecrawl",
    required: false,
    configured: Boolean(firecrawlKey),
    usable: Boolean(firecrawlKey),
    status: firecrawlKey ? "ready" : "warning",
    message: firecrawlKey ? "FIRECRAWL_API_KEY is configured" : "FIRECRAWL_API_KEY is missing; URL extraction will be skipped",
  });

  const githubToken = readEnv("GITHUB_TOKEN");
  results.push({
    provider: "github",
    required: false,
    configured: Boolean(githubToken),
    usable: Boolean(githubToken),
    status: githubToken ? "ready" : "warning",
    message: githubToken ? "GITHUB_TOKEN is configured" : "GITHUB_TOKEN is missing; GitHub evidence will be limited",
  });

  const brightToken = readEnv("BRIGHTDATA_API_TOKEN");
  const brightDatasetId = readEnv("BRIGHTDATA_DATASET_ID");
  if (!brightToken || !brightDatasetId) {
    results.push({
      provider: "bright",
      required: false,
      configured: Boolean(brightToken && brightDatasetId),
      usable: false,
      status: "warning",
      message: "Bright token or dataset id is missing; Bright probe will be skipped",
      details: {
        hasToken: Boolean(brightToken),
        hasDatasetId: Boolean(brightDatasetId),
      },
    });
  } else if (!options.checkNetwork) {
    results.push({
      provider: "bright",
      required: false,
      configured: true,
      usable: true,
      status: "ready",
      message: "Bright env is configured; balance not checked because --network was not passed",
      details: { balanceChecked: false },
    });
  } else {
    try {
      const balance = await getBrightDataAccountBalance(brightToken);
      results.push({
        provider: "bright",
        required: false,
        configured: true,
        usable: typeof balance === "number" ? balance > 0 : true,
        status: typeof balance === "number" && balance <= 5 ? "warning" : "ready",
        message: typeof balance === "number"
          ? `Bright balance is $${balance.toFixed(2)}`
          : "Bright balance endpoint succeeded but did not expose a numeric balance",
        details: {
          balance,
          brightBudgetRecommendedCapUsd: 5,
        },
      });
    } catch (error) {
      results.push({
        provider: "bright",
        required: false,
        configured: true,
        usable: false,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export type SerperSearchResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

export async function serperSearch(params: {
  query: string;
  num?: number;
  signal?: AbortSignal;
}) {
  const key = readEnv("SERPER_API_KEY");
  if (!key) throw new Error("SERPER_API_KEY is missing");

  const timeout = createTimeoutSignal(params.signal, 15000);
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({
      q: params.query,
      num: params.num ?? 10,
    }),
    signal: timeout.signal,
  }).finally(timeout.cleanup);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper search failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = await response.json() as {
    organic?: SerperSearchResult[];
  };
  return payload.organic ?? [];
}

export type ExaSearchResult = {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  score?: number;
  publishedDate?: string;
  author?: string;
};

export function mapSerperResultsToLeads(params: {
  laneId: string;
  results: SerperSearchResult[];
}): CandidateLead[] {
  return params.results
    .filter((result) => result.link)
    .map((result, index) => {
      const url = result.link!;
      return {
        lead_id: `serper:${params.laneId}:${index}:${stableId(url)}`,
        provider: "serper",
        lane_id: params.laneId,
        url,
        title: result.title ?? null,
        snippet: result.snippet ?? null,
        source_type: classifyUrl(url),
        source_confidence: url.includes("linkedin.com/in/") ? "high" : "medium",
        raw: { ...result },
      };
    });
}

export async function firecrawlExtractUrl(params: {
  url: string;
  formats?: string[];
  signal?: AbortSignal;
}) {
  const key = readEnv("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY is missing");

  const timeout = createTimeoutSignal(params.signal, 30000);
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      url: params.url,
      formats: params.formats ?? ["markdown"],
      onlyMainContent: true,
    }),
    signal: timeout.signal,
  }).finally(timeout.cleanup);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firecrawl scrape failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return await response.json();
}

export async function exaSearch(params: {
  query: string;
  numResults?: number;
  signal?: AbortSignal;
}) {
  const key = readEnv("EXA_API_KEY");
  if (!key) throw new Error("EXA_API_KEY is missing");

  const timeout = createTimeoutSignal(params.signal, 15000);
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      query: params.query,
      numResults: params.numResults ?? 10,
      useAutoprompt: true,
    }),
    signal: timeout.signal,
  }).finally(timeout.cleanup);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exa search failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return await response.json();
}

export async function fetchGithubEvidence(params: {
  url: string;
  signal?: AbortSignal;
}) {
  const parsed = parseGithubUrl(params.url);
  if (!parsed) throw new Error(`Not a GitHub profile or repo URL: ${params.url}`);
  const token = readEnv("GITHUB_TOKEN");
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const user = await githubJson(`https://api.github.com/users/${parsed.owner}`, {
    headers,
    signal: params.signal,
  });
  const repos = await githubJson(
    `https://api.github.com/users/${parsed.owner}/repos?sort=updated&per_page=5`,
    { headers, signal: params.signal },
  );
  const repo = parsed.repo
    ? await githubJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
        headers,
        signal: params.signal,
      })
    : null;

  return {
    owner: parsed.owner,
    repo_name: parsed.repo,
    user,
    repos,
    repo,
  };
}

export function mapExaResultsToLeads(params: {
  laneId: string;
  payload: unknown;
}): CandidateLead[] {
  const results = extractExaResults(params.payload);
  return results
    .filter((result) => result.url)
    .map((result, index) => {
      const url = result.url!;
      return {
        lead_id: `exa:${params.laneId}:${index}:${stableId(url)}`,
        provider: "exa",
        lane_id: params.laneId,
        url,
        title: result.title ?? null,
        snippet: result.summary || excerpt(result.text, 280),
        source_type: classifyUrl(url),
        source_confidence: result.score && result.score > 0.75 ? "high" : "medium",
        raw: { ...result },
      };
    });
}

export async function runBrightProbe(params: {
  lane: Pick<SourcingLane, "lane_id" | "must_keep" | "goal">;
  intent: ParsedSearchIntent;
  query: string;
  recordsLimit: number;
}) {
  const apiToken = readEnv("BRIGHTDATA_API_TOKEN");
  const datasetId = readEnv("BRIGHTDATA_DATASET_ID");
  if (!apiToken) throw new Error("BRIGHTDATA_API_TOKEN is missing");
  if (!datasetId) throw new Error("BRIGHTDATA_DATASET_ID is missing");

  const filter = buildBrightProbeFilter(params);
  const result = await filterDatasetProfiles(
    apiToken,
    {
      datasetId,
      filter,
      recordsLimit: params.recordsLimit,
    },
    {
      timeoutMs: 90000,
      pollIntervalMs: 5000,
    },
  );

  return {
    ...result,
    filter,
  };
}

export function mapBrightProfilesToLeads(params: {
  laneId: string;
  profiles: BrightDataProfile[];
}): CandidateLead[] {
  return params.profiles
    .filter((profile) => profile.url)
    .map((profile, index) => ({
      lead_id: `bright:${params.laneId}:${index}:${stableId(profile.url || profile.name)}`,
      provider: "bright",
      lane_id: params.laneId,
      url: profile.url!,
      title: [profile.name, profile.current_company?.title, profile.current_company?.name]
        .filter(Boolean)
        .join(" - ") || profile.name,
      snippet: [
        profile.headline,
        profile.about,
        profile.skills?.slice(0, 8).join(", "),
      ].filter(Boolean).join("\n").slice(0, 600),
      source_type: "linkedin",
      source_confidence: "high",
      raw: {
        profile,
      },
    }));
}

export function buildBrightProbeFilter(params: {
  lane: Pick<SourcingLane, "must_keep" | "goal">;
  intent: ParsedSearchIntent;
  query: string;
}): BrightDataFilterRule {
  const titleTerms = compactTerms([
    params.intent.target_title,
    ...params.lane.must_keep,
    ...extractQuotedTerms(params.query),
  ], 4).filter(looksLikeRoleTerm);

  const roleTerms = titleTerms.length > 0
    ? titleTerms
    : compactTerms([params.intent.target_title, params.lane.goal], 2);

  const filters: BrightDataFilterRule[] = [
    {
      operator: "or",
      filters: roleTerms.map((term) => ({
        name: "position",
        operator: "includes",
        value: term,
      })),
    },
  ];

  const country = inferCountryCode([params.intent.location, params.query].filter(Boolean).join(" "));
  if (country) {
    filters.push({
      name: "country_code",
      operator: "=",
      value: country,
    });
  }

  const locationTerm = inferStrictLocationTerm(params.intent.location || params.query);
  if (locationTerm) {
    filters.push({
      name: "location",
      operator: "includes",
      value: locationTerm,
    });
  }

  return filters.length === 1 ? filters[0] : { operator: "and", filters };
}

export function mapFirecrawlExtractionToLead(params: {
  sourceLead: CandidateLead;
  payload: unknown;
}): CandidateLead {
  const record = params.payload && typeof params.payload === "object"
    ? params.payload as Record<string, unknown>
    : {};
  const data = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : record;
  const metadata = data.metadata && typeof data.metadata === "object"
    ? data.metadata as Record<string, unknown>
    : {};
  const markdown = typeof data.markdown === "string" ? data.markdown : "";
  const title = stringValue(metadata.title) || stringValue(data.title) || params.sourceLead.title;
  const description =
    stringValue(metadata.description) ||
    stringValue(data.description) ||
    excerpt(markdown, 500) ||
    params.sourceLead.snippet;

  return {
    ...params.sourceLead,
    title,
    snippet: description,
    source_confidence: params.sourceLead.source_confidence === "high" ? "high" : "medium",
    raw: {
      ...params.sourceLead.raw,
      firecrawl: {
        title,
        description,
        markdown_excerpt: excerpt(markdown, 1200),
      },
    },
  };
}

export function mapGithubEvidenceToLead(params: {
  sourceLead: CandidateLead;
  payload: unknown;
}): CandidateLead {
  const payload = params.payload && typeof params.payload === "object"
    ? params.payload as Record<string, unknown>
    : {};
  const user = payload.user && typeof payload.user === "object"
    ? payload.user as Record<string, unknown>
    : {};
  const repos = Array.isArray(payload.repos)
    ? payload.repos.filter((repo): repo is Record<string, unknown> => Boolean(repo && typeof repo === "object"))
    : [];
  const repo = payload.repo && typeof payload.repo === "object"
    ? payload.repo as Record<string, unknown>
    : null;

  const displayName = stringValue(user.name) || stringValue(user.login) || params.sourceLead.title;
  const bio = stringValue(user.bio);
  const repoSummary = repo
    ? summarizeRepo(repo)
    : repos.slice(0, 3).map(summarizeRepo).filter(Boolean).join("\n");
  return {
    ...params.sourceLead,
    title: displayName,
    snippet: [bio, repoSummary].filter(Boolean).join("\n") || params.sourceLead.snippet,
    source_confidence: "medium",
    raw: {
      ...params.sourceLead.raw,
      github: {
        owner: payload.owner,
        repo_name: payload.repo_name,
        name: stringValue(user.name),
        login: stringValue(user.login),
        bio,
        company: stringValue(user.company),
        location: stringValue(user.location),
        followers: numericValue(user.followers),
        public_repos: numericValue(user.public_repos),
        repos: repos.slice(0, 5).map((item) => ({
          name: stringValue(item.name),
          description: stringValue(item.description),
          language: stringValue(item.language),
          stars: numericValue(item.stargazers_count),
          updated_at: stringValue(item.updated_at),
        })),
        repo: repo ? {
          name: stringValue(repo.name),
          description: stringValue(repo.description),
          language: stringValue(repo.language),
          stars: numericValue(repo.stargazers_count),
          forks: numericValue(repo.forks_count),
          updated_at: stringValue(repo.updated_at),
        } : null,
      },
    },
  };
}

function classifyUrl(url: string): CandidateLead["source_type"] {
  const lower = url.toLowerCase();
  if (lower.includes("linkedin.com/in/")) return "linkedin";
  if (lower.includes("github.com/")) return "github";
  if (lower.includes("/team") || lower.includes("/people") || lower.includes("/about")) return "company_page";
  if (lower.includes("medium.com") || lower.includes("substack.com") || lower.includes("/blog")) return "article";
  if (lower.includes("linkedin.com/company/")) return "company_page";
  return "other";
}

async function githubJson(url: string, init: RequestInit) {
  const timeout = createTimeoutSignal(init.signal || undefined, 15000);
  const response = await fetch(url, {
    ...init,
    signal: timeout.signal,
  }).finally(timeout.cleanup);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return await response.json();
}

function parseGithubUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.hostname.toLowerCase().endsWith("github.com")) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  if (!owner || ["topics", "orgs", "marketplace", "features", "enterprise"].includes(owner)) {
    return null;
  }
  return {
    owner,
    repo: parts[1] || null,
  };
}

function summarizeRepo(repo: Record<string, unknown>) {
  const parts = [
    stringValue(repo.name),
    stringValue(repo.language),
    numericValue(repo.stargazers_count) != null
      ? `${numericValue(repo.stargazers_count)} stars`
      : null,
    stringValue(repo.description),
  ].filter(Boolean);
  return parts.join(" | ");
}

function extractExaResults(payload: unknown): ExaSearchResult[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const results = Array.isArray(record.results) ? record.results : [];
  return results.filter((item): item is ExaSearchResult => Boolean(item && typeof item === "object"));
}

function excerpt(value: unknown, limit: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractQuotedTerms(value: string) {
  return Array.from(value.matchAll(/"([^"]{3,80})"/g)).map((match) => match[1] || "");
}

function compactTerms(values: Array<string | null | undefined>, limit: number) {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length < 3) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size >= limit) break;
  }
  return Array.from(seen);
}

function looksLikeRoleTerm(value: string) {
  return /\b(engineer|developer|architect|manager|scientist|analyst|lead|staff|principal|sre|devops|platform|backend|frontend|full[- ]?stack|data|ml)\b/i.test(value);
}

function inferCountryCode(value: string) {
  if (/\b(united states|usa|u\.s\.|us|new york|nyc|san francisco|california|remote us|remote usa)\b/i.test(value)) {
    return "US";
  }
  if (/\bcanada|toronto|vancouver\b/i.test(value)) return "CA";
  if (/\bunited kingdom|uk|london\b/i.test(value)) return "GB";
  return null;
}

function inferStrictLocationTerm(value: string) {
  if (/\bremote\b/i.test(value)) return null;
  if (/\bnew york|nyc|manhattan|brooklyn\b/i.test(value)) return "New York";
  if (/\bsan francisco|bay area\b/i.test(value)) return "San Francisco";
  return null;
}

function stableId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function createTimeoutSignal(parent: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  if (parent) {
    if (parent.aborted) {
      controller.abort(parent.reason);
    } else {
      parent.addEventListener("abort", () => controller.abort(parent.reason), { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

export function isProviderName(value: string): value is ProviderName {
  return ["deepseek", "serper", "exa", "firecrawl", "bright", "github"].includes(value);
}
