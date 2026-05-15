/**
 * Bright Data LinkedIn Profiles Scraper API integration
 *
 * Scrapes full LinkedIn profile data including experience, education, skills,
 * about section, and more.
 *
 * Pricing: ~$1.50/1k records ($0.0015/profile)
 * Flow: trigger → snapshot_id → poll until ready → get JSON results
 */
import { createHash } from "node:crypto";
import { extractPublicProfileLinks, type PublicProfileLinks } from "@/lib/github/public-links";

const BRIGHTDATA_API_BASE = "https://api.brightdata.com/datasets/v3";
const BRIGHTDATA_FILTER_API_BASE = "https://api.brightdata.com/datasets";
const BRIGHTDATA_REQUEST_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.SEARCH_BRIGHTDATA_REQUEST_TIMEOUT_MS || "", 10) || 300000,
);

type BrightDataScrapeOptions = {
  batchSize?: number;
  concurrency?: number;
  maxAttempts?: number;
  intervalMs?: number;
  allowPartial?: boolean;
};

export type BrightDataFilterRule =
  | {
      name: string;
      operator: string;
      value: string | number | boolean;
    }
  | {
      operator: "and" | "or";
      filters: BrightDataFilterRule[];
    };

export type BrightDataDatasetFilterRequest = {
  datasetId: string;
  filter: BrightDataFilterRule;
  recordsLimit: number;
};

const BRIGHTDATA_MAX_RULES_PER_GROUP = 4;
const BRIGHTDATA_MAX_GROUP_DEPTH = 3;

function isFilterGroup(
  filter: BrightDataFilterRule,
): filter is { operator: "and" | "or"; filters: BrightDataFilterRule[] } {
  return "filters" in filter;
}

/**
 * Bright Data 对过滤器的两条硬约束：
 *   1) 每个 logical group（and/or）最多 4 条规则
 *   2) logical operators 最多嵌套 3 层（根也算 1 层）
 *
 * 本工具自底向上整理：
 *   - 先递归处理子过滤器，传递当前深度
 *   - 拍平相同 operator 的相邻嵌套（关联律）以释放容量
 *   - 按当前节点剩余深度预算迭代等量分组
 *   - 若剩余预算耗尽仍超标，最终截断到 maxPerGroup（优先保留前缀）
 *
 * 例：or[a..g] → or[or[a..d], or[e..g]]；超深度预算时仅保留前 4 条。
 */
export function chunkBrightDataFilter(
  filter: BrightDataFilterRule,
  maxPerGroup: number = BRIGHTDATA_MAX_RULES_PER_GROUP,
  maxDepth: number = BRIGHTDATA_MAX_GROUP_DEPTH,
): BrightDataFilterRule {
  if (maxPerGroup < 2) {
    throw new Error("chunkBrightDataFilter: maxPerGroup must be at least 2");
  }
  if (maxDepth < 1) {
    throw new Error("chunkBrightDataFilter: maxDepth must be at least 1");
  }
  return chunkAtDepth(filter, maxPerGroup, maxDepth, 1);
}

function chunkAtDepth(
  filter: BrightDataFilterRule,
  maxPerGroup: number,
  maxDepth: number,
  depth: number,
): BrightDataFilterRule {
  if (!isFilterGroup(filter)) return filter;

  const recursivelyChunked = filter.filters.map((child) =>
    chunkAtDepth(child, maxPerGroup, maxDepth, depth + 1),
  );

  const flattenedChildren: BrightDataFilterRule[] = [];
  for (const child of recursivelyChunked) {
    if (isFilterGroup(child) && child.operator === filter.operator) {
      flattenedChildren.push(...child.filters);
    } else {
      flattenedChildren.push(child);
    }
  }

  if (flattenedChildren.length === 0) {
    return { operator: filter.operator, filters: [] };
  }

  if (flattenedChildren.length <= maxPerGroup) {
    return { operator: filter.operator, filters: flattenedChildren };
  }

  const chunkingBudget = Math.max(0, maxDepth - depth);

  // Preferred packing: bucket leaves together into a single sub-group, keeping
  // existing sub-groups at the current level. This avoids pushing entire
  // sub-trees one level deeper (which often violates the depth limit when an
  // AND/OR root already contains deep OR/AND groups).
  const leaves = flattenedChildren.filter((child) => !isFilterGroup(child));
  const groups = flattenedChildren.filter(isFilterGroup);
  const canReservePreferredSlot =
    chunkingBudget >= 1 &&
    groups.length + 1 <= maxPerGroup &&
    leaves.length <= maxPerGroup;
  if (canReservePreferredSlot && leaves.length >= 2) {
    const leafBucket = chunkAtDepth(
      { operator: filter.operator, filters: leaves },
      maxPerGroup,
      maxDepth,
      depth + 1,
    );
    return { operator: filter.operator, filters: [...groups, leafBucket] };
  }

  // Fallback: iteratively bucket all children together, same operator, within
  // the remaining depth budget. Truncate if the budget still cannot fit them.
  let current: BrightDataFilterRule[] = flattenedChildren;
  let passes = 0;
  while (current.length > maxPerGroup && passes < chunkingBudget) {
    const next: BrightDataFilterRule[] = [];
    for (let i = 0; i < current.length; i += maxPerGroup) {
      const slice = current.slice(i, i + maxPerGroup);
      next.push(
        slice.length === 1
          ? slice[0]
          : { operator: filter.operator, filters: slice },
      );
    }
    current = next;
    passes++;
  }

  if (current.length > maxPerGroup) {
    current = current.slice(0, maxPerGroup);
  }

  if (
    current.length === 1 &&
    isFilterGroup(current[0]) &&
    current[0].operator === filter.operator
  ) {
    return current[0];
  }
  return { operator: filter.operator, filters: current };
}

export type BrightDataSnapshotMetadata = {
  id: string;
  status: "scheduled" | "building" | "ready" | "failed";
  dataset_id: string;
  dataset_size?: number;
  file_size?: number;
  cost?: number;
  error?: string;
  error_code?: string | number;
  warning?: string;
  warning_code?: string | number;
};

export function formatBrightDataSnapshotFailure(
  snapshotId: string,
  metadata: Pick<
    BrightDataSnapshotMetadata,
    "error" | "error_code" | "warning" | "warning_code"
  >,
) {
  const details = [
    metadata.warning ? `warning=${metadata.warning}` : null,
    metadata.warning_code ? `warning_code=${String(metadata.warning_code)}` : null,
    metadata.error ? `error=${metadata.error}` : null,
    metadata.error_code ? `error_code=${String(metadata.error_code)}` : null,
  ].filter(Boolean);
  return `Bright Data snapshot ${snapshotId} failed${details.length ? ` (${details.join(", ")})` : ""}`;
}

export class BrightDataSnapshotNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrightDataSnapshotNotReadyError";
  }
}

export class BrightDataSnapshotFailedError extends Error {
  metadata: BrightDataSnapshotMetadata;

  constructor(message: string, metadata: BrightDataSnapshotMetadata) {
    super(message);
    this.name = "BrightDataSnapshotFailedError";
    this.metadata = metadata;
  }
}

export class BrightDataRequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrightDataRequestTimeoutError";
  }
}

// ──────────────────── Types ────────────────────

export type BrightDataExperience = {
  title: string | null;
  company: string | null;
  company_id: string | null;
  location: string | null;
  duration: string | null;
  description: string | null;
};

export type BrightDataEducation = {
  title: string | null;
  subtitle: string | null;
  field_of_study: string | null;
  degree: string | null;
  start_year: string | null;
  end_year: string | null;
};

export type BrightDataProfile = {
  name: string;
  first_name: string | null;
  last_name: string | null;
  linkedin_id: string | null;
  headline: string | null;
  about: string | null;
  city: string | null;
  country_code: string | null;
  current_company: {
    name: string | null;
    company_id: string | null;
    title: string | null;
    location: string | null;
  } | null;
  experience: BrightDataExperience[];
  education: BrightDataEducation[];
  skills: string[];
  connections: number | null;
  followers: number | null;
  url: string | null;
  avatar: string | null;
  languages: string[];
  certifications: { name: string; authority: string | null }[];
  recommendations_count: number | null;
  public_links?: PublicProfileLinks;
  input: { url: string };
};

type BrightDataDatasetCompany = {
  name?: unknown;
  company_id?: unknown;
  title?: unknown;
  location?: unknown;
};

type BrightDataDatasetExperience = {
  title?: unknown;
  company?: unknown;
  company_id?: unknown;
  location?: unknown;
  duration?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  description?: unknown;
  positions?: unknown;
};

type BrightDataDatasetEducation = {
  title?: unknown;
  subtitle?: unknown;
  field?: unknown;
  field_of_study?: unknown;
  degree?: unknown;
  start_year?: unknown;
  end_year?: unknown;
};

type BrightDataInputPayload = {
  url?: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeAbortSignals(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  return timeoutSignal;
}

async function brightDataFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: mergeAbortSignals(init?.signal, BRIGHTDATA_REQUEST_TIMEOUT_MS),
  });
}

async function readResponseTextWithTimeout(
  response: Response,
  context: string,
  timeoutMs: number = BRIGHTDATA_REQUEST_TIMEOUT_MS,
) {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Best-effort cancel — fire-and-forget so reject fires immediately
      response.body?.cancel().catch(() => undefined);
      reject(
        new BrightDataRequestTimeoutError(
          `${context} timed out while reading response body after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    response.text().then(
      (text) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(text);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown, maxItems: number = 20) {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();

  for (const item of value) {
    const normalized =
      typeof item === "string"
        ? asString(item)
        : item && typeof item === "object"
          ? asString((item as Record<string, unknown>).title)
          : null;
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size >= maxItems) break;
  }

  return Array.from(deduped);
}

function buildDuration(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) return `${startDate} - ${endDate}`;
  if (startDate) return `${startDate} - Present`;
  if (endDate) return endDate;
  return null;
}

function splitTextList(value: string, maxItems: number) {
  const deduped = new Set<string>();
  for (const part of value
    .split(/[\n,;|•]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    deduped.add(part);
    if (deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

const INFERABLE_SKILLS = [
  "python",
  "node.js",
  "node",
  "next.js",
  "nextjs",
  "react",
  "typescript",
  "javascript",
  "golang",
  "go",
  "rust",
  "java",
  "c#",
  "kotlin",
  "swift",
  "aws",
  "gcp",
  "azure",
  "postgresql",
  "mongodb",
  "redis",
  "graphql",
  "rest",
  "docker",
  "kubernetes",
  "llm",
  "ai",
  "machine learning",
  "langchain",
];

function inferSkillsFromText(texts: Array<string | null | undefined>, maxItems = 12) {
  const merged = texts
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join(" ")
    .toLowerCase();
  if (!merged) return [];

  const deduped = new Set<string>();
  for (const token of INFERABLE_SKILLS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(merged)) {
      deduped.add(token);
      if (deduped.size >= maxItems) break;
    }
  }
  return Array.from(deduped);
}

function mapEducationFromDetails(value: unknown) {
  const details = asString(value);
  if (!details) return [];
  return splitTextList(details, 4).map((school) => ({
    title: null,
    subtitle: school,
    field_of_study: null,
    degree: null,
    start_year: null,
    end_year: null,
  }));
}

function mapDatasetExperienceEntry(value: unknown): BrightDataExperience[] {
  if (!value || typeof value !== "object") return [];
  const entry = value as BrightDataDatasetExperience;
  const nestedPositions = Array.isArray(entry.positions) ? entry.positions : [];

  if (nestedPositions.length > 0) {
    return nestedPositions
      .map((position) => {
        if (!position || typeof position !== "object") return null;
        const item = position as Record<string, unknown>;
        const startDate = asString(item.start_date);
        const endDate = asString(item.end_date);
        return {
          title: asString(item.title),
          company: asString(item.subtitle) || asString(entry.company),
          company_id: asString(entry.company_id),
          location: asString(item.location) || asString(entry.location),
          duration: asString(item.meta) || buildDuration(startDate, endDate),
          description: asString(item.description) || asString(item.description_html),
        };
      })
      .filter(
        (item): item is BrightDataExperience =>
          Boolean(item && (item.title || item.company || item.description)),
      );
  }

  const startDate = asString(entry.start_date);
  const endDate = asString(entry.end_date);
  const mapped = {
    title: asString(entry.title),
    company: asString(entry.company),
    company_id: asString(entry.company_id),
    location: asString(entry.location),
    duration: asString(entry.duration) || buildDuration(startDate, endDate),
    description: asString(entry.description),
  };

  if (!mapped.title && !mapped.company && !mapped.description) return [];
  return [mapped];
}

function mapDatasetEducationEntry(value: unknown): BrightDataEducation | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as BrightDataDatasetEducation;
  const mapped = {
    title: asString(entry.title),
    subtitle: asString(entry.subtitle),
    field_of_study: asString(entry.field_of_study) || asString(entry.field),
    degree: asString(entry.degree),
    start_year: asString(entry.start_year),
    end_year: asString(entry.end_year),
  };
  if (!mapped.title && !mapped.subtitle && !mapped.field_of_study) return null;
  return mapped;
}

function mapDatasetCompany(value: unknown): BrightDataProfile["current_company"] {
  if (!value || typeof value !== "object") return null;
  const company = value as BrightDataDatasetCompany;
  const mapped = {
    name: asString(company.name),
    company_id: asString(company.company_id),
    title: asString(company.title),
    location: asString(company.location),
  };
  if (!mapped.name && !mapped.title && !mapped.location) return null;
  return mapped;
}

function getInputUrl(record: Record<string, unknown>) {
  const nested =
    record.input && typeof record.input === "object"
      ? asString((record.input as BrightDataInputPayload).url)
      : null;
  return nested || asString(record.input_url) || asString(record.url);
}

function getCurrentCompanyFromFallbackFields(record: Record<string, unknown>) {
  return mapDatasetCompany({
    name: record.current_company_name,
    company_id: record.current_company_company_id,
    title: record.current_company_title,
    location: record.location,
  });
}

function hasMeaningfulProfileSignal(profile: BrightDataProfile) {
  return Boolean(
    profile.about ||
      (profile.current_company &&
        (profile.current_company.name || profile.current_company.title)) ||
      profile.experience.length > 0 ||
      profile.skills.length > 0 ||
      profile.education.length > 0,
  );
}

function buildFallbackExperienceFromCurrentCompany(
  currentCompany: BrightDataProfile["current_company"],
  headlineTitle: string | null = null,
): BrightDataExperience[] {
  if (!currentCompany) return [];
  if (!currentCompany.title && !currentCompany.name && !headlineTitle) return [];
  return [
    {
      title: currentCompany.title || headlineTitle,
      company: currentCompany.name,
      company_id: currentCompany.company_id,
      location: currentCompany.location,
      duration: null,
      description: null,
    },
  ];
}

function parseHeadlineParts(headline: string | null) {
  if (!headline) return { title: null, company: null };
  const atMatch = headline.match(/^\s*(.+?)\s+at\s+(.+?)\s*$/i);
  if (atMatch) {
    return {
      title: asString(atMatch[1]),
      company: asString(atMatch[2]),
    };
  }
  return { title: headline, company: null };
}

function chunkArray<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

async function runWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  fn: (item: TInput, index: number) => Promise<TOutput>,
) {
  const results: TOutput[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ──────────────────── Filter hash (for snapshot cache) ────────────────────

function sortDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj
      .map(sortDeep)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return obj;
}

/**
 * Compute a stable 32-char hex hash for a Bright Data filter request.
 * Same filter params → same hash → allows snapshot cache lookup.
 */
export function computeFilterHash(request: BrightDataDatasetFilterRequest): string {
  const stable = JSON.stringify({
    datasetId: request.datasetId,
    filter: sortDeep(request.filter),
    recordsLimit: request.recordsLimit,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

// ──────────────────── Dataset filter recall ────────────────────

export async function triggerDatasetFilter(
  apiToken: string,
  request: BrightDataDatasetFilterRequest,
): Promise<string> {
  const normalizedFilter = chunkBrightDataFilter(request.filter);
  const res = await brightDataFetch(`${BRIGHTDATA_FILTER_API_BASE}/filter`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dataset_id: request.datasetId,
      records_limit: request.recordsLimit,
      filter: normalizedFilter,
    }),
  });

  if (!res.ok) {
    const text = await readResponseTextWithTimeout(res, "Bright Data dataset filter");
    throw new Error(`Bright Data filter failed (${res.status}): ${text}`);
  }

  const rawText = await readResponseTextWithTimeout(res, "Bright Data dataset filter");
  const data = JSON.parse(rawText);
  return data.snapshot_id;
}

export async function getDatasetSnapshotMetadata(
  apiToken: string,
  snapshotId: string,
): Promise<BrightDataSnapshotMetadata> {
  const res = await brightDataFetch(
    `${BRIGHTDATA_FILTER_API_BASE}/snapshots/${snapshotId}`,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
    },
  );

  if (!res.ok) {
    const text = await readResponseTextWithTimeout(
      res,
      `Bright Data snapshot metadata ${snapshotId}`,
    );
    throw new Error(`Bright Data snapshot metadata failed (${res.status}): ${text}`);
  }

  const rawText = await readResponseTextWithTimeout(
    res,
    `Bright Data snapshot metadata ${snapshotId}`,
  );
  return JSON.parse(rawText) as BrightDataSnapshotMetadata;
}

export async function downloadDatasetSnapshot(
  apiToken: string,
  snapshotId: string,
): Promise<Record<string, unknown>[]> {
  const res = await brightDataFetch(
    `${BRIGHTDATA_FILTER_API_BASE}/snapshots/${snapshotId}/download?format=json`,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
    },
  );

  if (!res.ok) {
    const text = await readResponseTextWithTimeout(
      res,
      `Bright Data snapshot download ${snapshotId}`,
    );
    throw new Error(`Bright Data snapshot download failed (${res.status}): ${text}`);
  }

  const rawText = await readResponseTextWithTimeout(
    res,
    `Bright Data snapshot download ${snapshotId}`,
  );
  if (!rawText.trim()) {
    throw new BrightDataSnapshotNotReadyError(
      `Bright Data snapshot ${snapshotId} download returned an empty body`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    // Bright can briefly report metadata=status=ready while the JSON download endpoint
    // still serves a transient plain-text "Snapshot is ..." message. Keep polling instead
    // of failing the whole recall on that race.
    if (/snapshot\s+is/i.test(rawText) || /not\s+ready/i.test(rawText)) {
      throw new BrightDataSnapshotNotReadyError(
        `Bright Data snapshot ${snapshotId} download is not ready yet`,
      );
    }
    throw new Error(`Unexpected Bright Data dataset download format: ${rawText.slice(0, 200)}`);
  }

  if (!Array.isArray(data)) {
    throw new Error("Unexpected Bright Data dataset download format");
  }

  return data as Record<string, unknown>[];
}

export async function waitForDatasetSnapshot(
  apiToken: string,
  snapshotId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<{
  metadata: BrightDataSnapshotMetadata | null;
  profiles: BrightDataProfile[] | null;
}> {
  const timeoutMs = Math.max(1000, options.timeoutMs ?? 300000);
  const pollIntervalMs = Math.max(1000, options.pollIntervalMs ?? 5000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const metadata = await getDatasetSnapshotMetadata(apiToken, snapshotId);
    if (metadata.status === "ready") {
      let rows: Record<string, unknown>[];
      try {
        rows = await downloadDatasetSnapshot(apiToken, snapshotId);
      } catch (error) {
        if (error instanceof BrightDataSnapshotNotReadyError) {
          await sleep(pollIntervalMs);
          continue;
        }
        throw error;
      }
      return {
        metadata,
        profiles: rows.map(adaptDatasetRecordToBrightDataProfile),
      };
    }
    if (metadata.status === "failed") {
      throw new BrightDataSnapshotFailedError(
        formatBrightDataSnapshotFailure(snapshotId, metadata),
        metadata,
      );
    }
    await sleep(pollIntervalMs);
  }

  return {
    metadata: null,
    profiles: null,
  };
}

export async function filterDatasetProfiles(
  apiToken: string,
  request: BrightDataDatasetFilterRequest,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<{
  snapshotId: string;
  metadata: BrightDataSnapshotMetadata;
  profiles: BrightDataProfile[];
}> {
  const snapshotId = await triggerDatasetFilter(apiToken, request);
  const { metadata, profiles } = await waitForDatasetSnapshot(apiToken, snapshotId, options);
  if (!metadata || !profiles) {
    const timeoutMs = Math.max(1000, options.timeoutMs ?? 300000);
    throw new Error(`Bright Data dataset filtering did not complete after ${timeoutMs}ms`);
  }

  return {
    snapshotId,
    metadata,
    profiles,
  };
}

// ──────────────────── Trigger scraping job ────────────────────

export async function triggerScrape(
  apiToken: string,
  datasetId: string,
  linkedinUrls: string[],
): Promise<string> {
  const body = linkedinUrls.map((url) => ({ url }));

  const res = await brightDataFetch(
    `${BRIGHTDATA_API_BASE}/trigger?dataset_id=${datasetId}&include_errors=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await readResponseTextWithTimeout(res, "Bright Data trigger");
    throw new Error(`Bright Data trigger failed (${res.status}): ${text}`);
  }

  const rawText = await readResponseTextWithTimeout(res, "Bright Data trigger");
  const data = JSON.parse(rawText);
  return data.snapshot_id;
}

// ──────────────────── Poll for results ────────────────────

export async function pollSnapshot(
  apiToken: string,
  snapshotId: string,
  maxAttempts: number = 12,
  intervalMs: number = 20000,
): Promise<BrightDataProfile[]> {
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`[brightdata] Polling snapshot ${snapshotId} (attempt ${i + 1}/${maxAttempts})...`);
    await sleep(intervalMs);

    const res = await brightDataFetch(
      `${BRIGHTDATA_API_BASE}/snapshot/${snapshotId}?format=json`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );

    if (!res.ok) {
      const text = await readResponseTextWithTimeout(res, `Bright Data snapshot ${snapshotId}`);
      throw new Error(`Bright Data snapshot fetch failed (${res.status}): ${text}`);
    }

    const rawText = await readResponseTextWithTimeout(res, `Bright Data snapshot ${snapshotId}`);
    const data = JSON.parse(rawText);

    if (data.status === "running") {
      console.log(`[brightdata] Snapshot still running, waiting...`);
      continue;
    }

    // Data is ready
    if (Array.isArray(data)) {
      const records = data as Record<string, unknown>[];
      const profiles: BrightDataProfile[] = [];
      const errorCodes = new Map<string, number>();
      let droppedErrorRecords = 0;
      let droppedThinRecords = 0;

      for (const record of records) {
        const errorText = asString(record.error);
        if (errorText) {
          droppedErrorRecords += 1;
          const code = asString(record.error_code) || "unknown_error";
          errorCodes.set(code, (errorCodes.get(code) || 0) + 1);
          continue;
        }

        const profile = adaptDatasetRecordToBrightDataProfile(record);
        if (!hasMeaningfulProfileSignal(profile)) {
          droppedThinRecords += 1;
          continue;
        }

        profiles.push(profile);
      }

      if (droppedErrorRecords > 0 || droppedThinRecords > 0) {
        console.warn(
          `[brightdata] Filtered ${droppedErrorRecords} error record(s) and ${droppedThinRecords} thin record(s) from snapshot ${snapshotId}.`,
        );
      }
      if (errorCodes.size > 0) {
        console.warn(
          `[brightdata] Error code distribution: ${Array.from(errorCodes.entries())
            .map(([code, count]) => `${code}=${count}`)
            .join(", ")}`,
        );
      }
      console.log(`[brightdata] Got ${profiles.length} usable profile(s)`);
      return profiles;
    }

    // Unexpected format
    console.error("[brightdata] Unexpected response format:", JSON.stringify(data).slice(0, 200));
    throw new Error("Unexpected Bright Data response format");
  }

  throw new Error(`Bright Data scraping did not complete after ${maxAttempts} attempts`);
}

// ──────────────────── Convenience: scrape and wait ────────────────────

export async function* streamLinkedInProfiles(
  apiToken: string,
  datasetId: string,
  linkedinUrls: string[],
  options: BrightDataScrapeOptions = {},
): AsyncGenerator<BrightDataProfile[], void, unknown> {
  if (linkedinUrls.length === 0) return;

  const batchSize = Math.max(1, options.batchSize ?? linkedinUrls.length);
  const concurrency = Math.max(1, options.concurrency ?? batchSize);
  const maxAttempts = options.maxAttempts ?? 12;
  const intervalMs = options.intervalMs ?? 10000;
  const allowPartial = options.allowPartial ?? false;

  const batches = chunkArray(linkedinUrls, batchSize);
  console.log(
    `[brightdata:stream] Starting stream for ${linkedinUrls.length} profiles in ${batches.length} batches...`,
  );

  const snapshots = await runWithConcurrency(
    batches,
    Math.min(concurrency, batches.length),
    async (urls, batchIndex) => {
      const label = `batch ${batchIndex + 1}/${batches.length}`;
      try {
        console.log(`[brightdata:stream] Triggering ${label} for ${urls.length} profiles...`);
        const snapshotId = await triggerScrape(apiToken, datasetId, urls);
        console.log(`[brightdata:stream] ${label} snapshot ID: ${snapshotId}`);
        return { snapshotId, batchIndex, urls, label, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[brightdata:stream] ${label} trigger failed: ${message}`);
        if (!allowPartial) throw error;
        return { snapshotId: null, batchIndex, urls, label, error: message };
      }
    },
  );

  const pendingPolls = new Map<
    number,
    Promise<{
      batchIndex: number;
      label: string;
      profiles: BrightDataProfile[] | null;
      error: string | null;
    }>
  >();

  for (const snapshot of snapshots) {
    if (snapshot.error || !snapshot.snapshotId) {
      console.log(`[brightdata:stream] Skipping ${snapshot.label} due to trigger error`);
      continue;
    }

    const pollPromise = pollSnapshot(
      apiToken,
      snapshot.snapshotId,
      maxAttempts,
      intervalMs,
    )
      .then((profiles) => ({
        batchIndex: snapshot.batchIndex,
        label: snapshot.label,
        profiles,
        error: null,
      }))
      .catch((error) => ({
        batchIndex: snapshot.batchIndex,
        label: snapshot.label,
        profiles: null,
        error: error instanceof Error ? error.message : String(error),
      }));

    pendingPolls.set(snapshot.batchIndex, pollPromise);
  }

  while (pendingPolls.size > 0) {
    const settled = await Promise.race(Array.from(pendingPolls.values()));
    pendingPolls.delete(settled.batchIndex);

    if (settled.error || !settled.profiles) {
      console.error(`[brightdata:stream] ${settled.label} poll failed: ${settled.error}`);
      if (!allowPartial) {
        throw new Error(
          settled.error || `Bright Data poll failed for ${settled.label}`,
        );
      }
      continue;
    }

    console.log(
      `[brightdata:stream] ${settled.label} completed with ${settled.profiles.length} profiles`,
    );
    yield settled.profiles;
  }

  console.log(`[brightdata:stream] Stream completed`);
}

export async function scrapeLinkedInProfiles(
  apiToken: string,
  datasetId: string,
  linkedinUrls: string[],
  options: BrightDataScrapeOptions = {},
): Promise<BrightDataProfile[]> {
  if (linkedinUrls.length === 0) return [];

  const batchSize = Math.max(1, options.batchSize ?? linkedinUrls.length);
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const maxAttempts = options.maxAttempts ?? 12;
  const intervalMs = options.intervalMs ?? 10000;
  const allowPartial = options.allowPartial ?? false;

  if (batchSize >= linkedinUrls.length && concurrency === 1) {
    console.log(`[brightdata] Triggering scrape for ${linkedinUrls.length} profiles...`);
    const snapshotId = await triggerScrape(apiToken, datasetId, linkedinUrls);
    console.log(`[brightdata] Snapshot ID: ${snapshotId}`);
    return pollSnapshot(apiToken, snapshotId, maxAttempts, intervalMs);
  }

  const batches = chunkArray(linkedinUrls, batchSize);
  console.log(
    `[brightdata] Triggering ${batches.length} scrape batch(es) for ${linkedinUrls.length} profiles with concurrency ${Math.min(concurrency, batches.length)}...`,
  );

  const batchResults = await runWithConcurrency(
    batches,
    concurrency,
    async (urls, batchIndex) => {
      const label = `batch ${batchIndex + 1}/${batches.length}`;

      try {
        console.log(`[brightdata] Triggering ${label} for ${urls.length} profiles...`);
        const snapshotId = await triggerScrape(apiToken, datasetId, urls);
        console.log(`[brightdata] ${label} snapshot ID: ${snapshotId}`);

        const profiles = await pollSnapshot(
          apiToken,
          snapshotId,
          maxAttempts,
          intervalMs,
        );

        return {
          batchIndex,
          profiles,
          error: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[brightdata] ${label} failed: ${message}`);

        if (!allowPartial) {
          throw error;
        }

        return {
          batchIndex,
          profiles: [] as BrightDataProfile[],
          error: message,
        };
      }
    },
  );

  const failures = batchResults.filter((result) => result.error);
  const profiles = batchResults
    .sort((left, right) => left.batchIndex - right.batchIndex)
    .flatMap((result) => result.profiles);

  if (!profiles.length) {
    const reason =
      failures.length > 0
        ? failures.map((result) => result.error).join("; ")
        : "Bright Data returned no profiles";
    throw new Error(reason);
  }

  if (failures.length > 0) {
    console.warn(
      `[brightdata] Completed with ${failures.length} failed batch(es); returning ${profiles.length} profile(s).`,
    );
  }

  if (profiles.length < linkedinUrls.length) {
    console.warn(
      `[brightdata] Requested ${linkedinUrls.length} profiles but received ${profiles.length}.`,
    );
  }

  return profiles;
}

export function adaptDatasetRecordToBrightDataProfile(
  record: Record<string, unknown>,
): BrightDataProfile {
  const headline =
    asString(record.headline) ||
    asString(record.current_title) ||
    asString(record.position) ||
    asString(record.title);
  const headlineParts = parseHeadlineParts(headline);
  let currentCompany =
    mapDatasetCompany(record.current_company) ||
    getCurrentCompanyFromFallbackFields(record);
  if (!currentCompany && (headlineParts.title || headlineParts.company)) {
    currentCompany = {
      name: headlineParts.company,
      company_id: null,
      title: headlineParts.title,
      location: asString(record.location),
    };
  } else if (currentCompany) {
    currentCompany = {
      ...currentCompany,
      title: currentCompany.title || headlineParts.title,
      name: currentCompany.name || headlineParts.company,
    };
  }
  const mappedExperience = Array.isArray(record.experience)
    ? record.experience.flatMap((entry) => mapDatasetExperienceEntry(entry))
    : [];
  const experience =
    mappedExperience.length > 0
      ? mappedExperience
      : buildFallbackExperienceFromCurrentCompany(currentCompany, headlineParts.title);

  const mappedEducation = Array.isArray(record.education)
    ? record.education
      .map((entry) => mapDatasetEducationEntry(entry))
      .filter((entry): entry is BrightDataEducation => Boolean(entry))
    : [];
  const education =
    mappedEducation.length > 0
      ? mappedEducation
      : mapEducationFromDetails(record.educations_details);
  const about = asString(record.about);
  const explicitSkills = asStringArray(record.skills);
  const skills =
    explicitSkills.length > 0
      ? explicitSkills
      : inferSkillsFromText([
        about,
        asString(record.headline),
        currentCompany?.title || null,
        currentCompany?.name || null,
      ]);

  return {
    name: asString(record.name) || "Unknown",
    first_name: asString(record.first_name),
    last_name: asString(record.last_name),
    linkedin_id: asString(record.linkedin_id) || asString(record.id),
    headline,
    about,
    city: asString(record.city) || asString(record.location),
    country_code: asString(record.country_code),
    current_company: currentCompany,
    experience,
    education,
    skills,
    connections:
      typeof record.connections === "number" && Number.isFinite(record.connections)
        ? record.connections
        : null,
    followers:
      typeof record.followers === "number" && Number.isFinite(record.followers)
        ? record.followers
        : null,
    url: asString(record.url) || getInputUrl(record),
    avatar: asString(record.avatar),
    languages: asStringArray(record.languages, 10),
    certifications:
      Array.isArray(record.certifications)
        ? record.certifications
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const item = entry as Record<string, unknown>;
            const name = asString(item.title) || asString(item.name);
            if (!name) return null;
            return {
              name,
              authority: asString(item.subtitle) || asString(item.authority),
            };
          })
          .filter((entry): entry is { name: string; authority: string | null } => Boolean(entry))
        : [],
    recommendations_count:
      typeof record.recommendations_count === "number" && Number.isFinite(record.recommendations_count)
        ? record.recommendations_count
        : null,
    public_links: extractPublicProfileLinks(record),
    input: {
      url: getInputUrl(record) || "",
    },
  };
}

// ──────────────────── Convert to rich profile text for AI ────────────────────

export function brightDataProfileToRichText(profile: BrightDataProfile, index: number): string {
  const lines: string[] = [];
  lines.push(`[${index}] ${profile.name}`);
  if (profile.headline) {
    lines.push(`  Headline: ${profile.headline}`);
  }

  if (profile.current_company?.name) {
    lines.push(`  Current: ${profile.current_company.title || "N/A"} at ${profile.current_company.name}`);
  } else {
    lines.push(`  Current: not currently employed`);
  }
  if (profile.city || profile.country_code) {
    lines.push(`  Location: ${[profile.city, profile.country_code].filter(Boolean).join(", ")}`);
  }
  if (profile.about) {
    lines.push(`  About: ${profile.about}`);
  }

  const experience = profile.experience || [];
  if (experience.length > 0) {
    lines.push(`  Experience:`);
    for (const exp of experience) {
      lines.push(`    - ${exp.title || "N/A"} at ${exp.company || "N/A"} (${exp.duration || "N/A"})`);
      if (exp.description) {
        lines.push(`      ${exp.description}`);
      }
    }
  }

  const education = profile.education || [];
  if (education.length > 0) {
    lines.push(`  Education:`);
    for (const edu of education) {
      lines.push(`    - ${edu.title || edu.field_of_study || "N/A"} at ${edu.subtitle || "N/A"}`);
    }
  }

  const skills = profile.skills || [];
  if (skills.length > 0) {
    lines.push(`  Skills: ${skills.join(", ")}`);
  }

  if (profile.languages?.length) {
    lines.push(`  Languages: ${profile.languages.join(", ")}`);
  }

  if (profile.certifications?.length) {
    lines.push(`  Certifications: ${profile.certifications.map(c => c.authority ? `${c.name} (${c.authority})` : c.name).join(", ")}`);
  }

  const activitySignals: string[] = [];
  if (profile.connections != null) activitySignals.push(`${profile.connections} connections`);
  if (profile.followers != null) activitySignals.push(`${profile.followers} followers`);
  if (profile.recommendations_count != null) activitySignals.push(`${profile.recommendations_count} recommendations`);
  if (activitySignals.length > 0) {
    lines.push(`  Activity: ${activitySignals.join(", ")}`);
  }

  lines.push(`  LinkedIn: ${profile.url || profile.input?.url || "N/A"}`);

  return lines.join("\n");
}
