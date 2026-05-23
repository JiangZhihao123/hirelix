import { AsyncLocalStorage } from "node:async_hooks";
import type {
  GithubRequestCategory,
  GithubRequestTrace,
  GithubRequestTraceEntry,
  GithubSignalStatus,
  GithubDiscoverySource,
  SerperGithubSearchResult,
} from "./types";
import { withTimeout } from "@/lib/search/concurrency";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const SERPER_API_BASE = "https://google.serper.dev";
const GITHUB_RATE_LIMIT_FALLBACK_COOLDOWN_MS = 60_000;
const DEFAULT_GITHUB_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_SERPER_REQUEST_TIMEOUT_MS = 15_000;

// Proactive rate limiter: spaces out requests so we never exceed GitHub API limits.
// All workers in the same process share the same limiter instances.
class GithubApiRateLimiter {
  private nextAllowedMs = 0;
  constructor(private readonly minIntervalMs: number) {}
  async acquire(): Promise<void> {
    const now = Date.now();
    if (now >= this.nextAllowedMs) {
      this.nextAllowedMs = now + this.minIntervalMs;
      return;
    }
    const waitMs = this.nextAllowedMs - now;
    this.nextAllowedMs += this.minIntervalMs;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}
// Search API: 30 req/min limit → enforce 28/min (one per ~2143ms)
const githubSearchLimiter = new GithubApiRateLimiter(Math.ceil(60_000 / 28));
// Core API: 5000 req/hour = ~83/min limit → enforce 70/min (one per ~857ms)
const githubCoreLimiter = new GithubApiRateLimiter(Math.ceil(60_000 / 70));

let githubApiCooldownUntilMs = 0;
export const githubRequestTraceStorage = new AsyncLocalStorage<GithubRequestTrace>();

export class GithubRateLimitError extends Error {
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

export function isGithubTraceLoggingEnabled() {
  const value = process.env.GITHUB_TRACE_LOGS || "";
  return ["1", "true", "yes", "on", "debug"].includes(value.trim().toLowerCase());
}

export function parseGithubRateLimitNumber(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatResetAt(value: string | null) {
  const epochSeconds = parseGithubRateLimitNumber(value);
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
}

export function readGithubRateLimitHeaders(headers: Headers) {
  return {
    resource: headers.get("x-ratelimit-resource"),
    limit: parseGithubRateLimitNumber(headers.get("x-ratelimit-limit")),
    remaining: parseGithubRateLimitNumber(headers.get("x-ratelimit-remaining")),
    used: parseGithubRateLimitNumber(headers.get("x-ratelimit-used")),
    resetAt: formatResetAt(headers.get("x-ratelimit-reset")),
    retryAfterMs: resolveRetryAfterMs(headers.get("retry-after")),
  };
}

export function classifyGithubRestPath(path: string): GithubRequestCategory {
  if (path.startsWith("/search/users")) return "search_users";
  if (path.startsWith("/search/issues")) return "search_issues";
  if (path.startsWith("/users/")) return "user_lookup";
  if (/^\/repos\/[^/]+\/[^/]+\/commits\?/.test(path)) return "repo_commits";
  return "other_rest";
}

export function classifyGithubGraphqlQuery(query: string): GithubRequestCategory {
  if (query.includes("contributionsCollection")) return "graphql_contributions";
  return "graphql_other";
}

export function createGithubRequestTrace(candidateName: string): GithubRequestTrace {
  return {
    candidateName,
    startedAt: Date.now(),
    requestCount: 0,
    rateLimitHits: 0,
    categoryCounts: {},
    resourceCounts: {},
    statusCounts: {},
    requests: [],
  };
}

export function recordGithubTraceEntry(entry: GithubRequestTraceEntry) {
  const trace = githubRequestTraceStorage.getStore();
  if (!trace) return;

  trace.requestCount += 1;
  trace.categoryCounts[entry.category] = (trace.categoryCounts[entry.category] || 0) + 1;
  trace.statusCounts[String(entry.status)] = (trace.statusCounts[String(entry.status)] || 0) + 1;
  if (entry.resource) {
    trace.resourceCounts[entry.resource] = (trace.resourceCounts[entry.resource] || 0) + 1;
  }
  if (entry.rateLimited) {
    trace.rateLimitHits += 1;
  }
  trace.requests.push(entry);

  if (isGithubTraceLoggingEnabled()) {
    console.info("[github-signals] request", JSON.stringify({
      candidate_name: trace.candidateName,
      ...entry,
    }));
  }
}

export function logGithubTraceSummary(params: {
  outcome: GithubSignalStatus;
  discoverySource?: GithubDiscoverySource | null;
  githubLogin?: string | null;
  error?: string | null;
}) {
  const trace = githubRequestTraceStorage.getStore();
  if (!trace) return;

  const topResources = Object.entries(trace.resourceCounts)
    .sort((left, right) => right[1] - left[1]);
  const recentRequests = trace.requests.slice(-8);
  console.info("[github-signals] summary", JSON.stringify({
    candidate_name: trace.candidateName,
    github_login: params.githubLogin || null,
    outcome: params.outcome,
    discovery_source: params.discoverySource || null,
    duration_ms: Date.now() - trace.startedAt,
    request_count: trace.requestCount,
    rate_limit_hits: trace.rateLimitHits,
    category_counts: trace.categoryCounts,
    status_counts: trace.statusCounts,
    top_rate_limit_resources: topResources,
    recent_requests: recentRequests,
    error: params.error || null,
  }));
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

function getGithubRequestTimeoutMs() {
  const parsed = Number.parseInt(process.env.GITHUB_REQUEST_TIMEOUT_MS || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_GITHUB_REQUEST_TIMEOUT_MS;
  return parsed;
}

function getSerperRequestTimeoutMs() {
  const parsed = Number.parseInt(process.env.SERPER_REQUEST_TIMEOUT_MS || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SERPER_REQUEST_TIMEOUT_MS;
  return parsed;
}

function mergeAbortSignals(signal: AbortSignal | null | undefined, timeoutSignal: AbortSignal) {
  if (!signal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  if (signal.aborted) return signal;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason || timeoutSignal.reason);
  signal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export function getGitHubToken() {
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

export async function githubFetch(path: string, init?: RequestInit) {
  const token = getGitHubToken();
  if (!token) {
    throw new Error("GITHUB_TOKEN is missing");
  }

  throwIfGithubApiCoolingDown();
  const category = classifyGithubRestPath(path);
  if (category === "search_users" || category === "search_issues") {
    await githubSearchLimiter.acquire();
  } else {
    await githubCoreLimiter.acquire();
  }
  const startedAt = Date.now();

  const response = await withTimeout(
    (signal) => fetch(`${GITHUB_API_BASE}${path}`, {
      ...init,
      signal: mergeAbortSignals(init?.signal, signal),
      headers: getGitHubRequestHeaders(token, init),
    }),
    getGithubRequestTimeoutMs(),
    `GitHub REST ${path}`,
  );
  const rateLimitHeaders = readGithubRateLimitHeaders(response.headers);

  if (!response.ok) {
    const text = await response.text();
    const rateLimited = isGithubRateLimitResponse(response, text);
    recordGithubTraceEntry({
      category,
      path,
      status: response.status,
      resource: rateLimitHeaders.resource,
      limit: rateLimitHeaders.limit,
      remaining: rateLimitHeaders.remaining,
      used: rateLimitHeaders.used,
      resetAt: rateLimitHeaders.resetAt,
      retryAfterMs: rateLimitHeaders.retryAfterMs,
      durationMs: Date.now() - startedAt,
      rateLimited,
    });
    if (isGithubRateLimitResponse(response, text)) {
      throw buildGithubRateLimitError(response.status, response.headers);
    }
    throw new Error(`GitHub REST failed (${response.status}): ${text.slice(0, 300)}`);
  }

  recordGithubTraceEntry({
    category,
    path,
    status: response.status,
    resource: rateLimitHeaders.resource,
    limit: rateLimitHeaders.limit,
    remaining: rateLimitHeaders.remaining,
    used: rateLimitHeaders.used,
    resetAt: rateLimitHeaders.resetAt,
    retryAfterMs: rateLimitHeaders.retryAfterMs,
    durationMs: Date.now() - startedAt,
    rateLimited: false,
  });

  return response.json();
}

export async function githubGraphql<T>(query: string, variables: Record<string, unknown>) {
  const token = getGitHubToken();
  if (!token) {
    throw new Error("GITHUB_TOKEN is missing");
  }

  throwIfGithubApiCoolingDown();
  await githubCoreLimiter.acquire();
  const startedAt = Date.now();
  const category = classifyGithubGraphqlQuery(query);

  const response = await withTimeout(
    (signal) => fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getGitHubRequestHeaders(token),
      },
      body: JSON.stringify({ query, variables }),
      signal,
    }),
    getGithubRequestTimeoutMs(),
    "GitHub GraphQL",
  );
  const rateLimitHeaders = readGithubRateLimitHeaders(response.headers);

  if (!response.ok) {
    const text = await response.text();
    const rateLimited = isGithubRateLimitResponse(response, text);
    recordGithubTraceEntry({
      category,
      path: "graphql",
      status: response.status,
      resource: rateLimitHeaders.resource,
      limit: rateLimitHeaders.limit,
      remaining: rateLimitHeaders.remaining,
      used: rateLimitHeaders.used,
      resetAt: rateLimitHeaders.resetAt,
      retryAfterMs: rateLimitHeaders.retryAfterMs,
      durationMs: Date.now() - startedAt,
      rateLimited,
    });
    if (isGithubRateLimitResponse(response, text)) {
      throw buildGithubRateLimitError(response.status, response.headers);
    }
    throw new Error(`GitHub GraphQL failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    const rateLimited = payload.errors.some((entry) => (entry.message || "").toLowerCase().includes("rate limit"));
    recordGithubTraceEntry({
      category,
      path: "graphql",
      status: response.status,
      resource: rateLimitHeaders.resource,
      limit: rateLimitHeaders.limit,
      remaining: rateLimitHeaders.remaining,
      used: rateLimitHeaders.used,
      resetAt: rateLimitHeaders.resetAt,
      retryAfterMs: rateLimitHeaders.retryAfterMs,
      durationMs: Date.now() - startedAt,
      rateLimited,
    });
    if (rateLimited) {
      throw buildGithubRateLimitError(response.status || 403, response.headers);
    }
    throw new Error(payload.errors.map((entry) => entry.message || "Unknown GraphQL error").join("; "));
  }

  recordGithubTraceEntry({
    category,
    path: "graphql",
    status: response.status,
    resource: rateLimitHeaders.resource,
    limit: rateLimitHeaders.limit,
    remaining: rateLimitHeaders.remaining,
    used: rateLimitHeaders.used,
    resetAt: rateLimitHeaders.resetAt,
    retryAfterMs: rateLimitHeaders.retryAfterMs,
    durationMs: Date.now() - startedAt,
    rateLimited: false,
  });

  return payload.data as T;
}

export async function serperGithubSearch(apiKey: string, query: string) {
  const response = await withTimeout(
    (signal) => fetch(`${SERPER_API_BASE}/search`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 5, page: 1 }),
      signal,
    }),
    getSerperRequestTimeoutMs(),
    `Serper search ${query}`,
  );

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

export function getSerperApiKey() {
  const key = process.env.SERPER_API_KEY || "";
  return key.trim() || null;
}
