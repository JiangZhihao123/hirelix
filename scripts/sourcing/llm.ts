import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readEnv } from "./env";
import type {
  CandidateCard,
  LaneDiagnosis,
  LightScreenDecision,
  ParsedSearchIntent,
  SourcingLane,
} from "./types";

export type LocalLlmUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  cacheMissInputTokens: number;
};

export type LocalLlmResult<T> = {
  data: T;
  rawText: string;
  usage: LocalLlmUsage;
  latencyMs: number;
  cacheHit: boolean;
};

export function getSourcingLlmModel() {
  return (
    readEnv("SEARCH_LIGHT_MODEL") ||
    readEnv("DEEPSEEK_LIGHT_MODEL") ||
    readEnv("AI_MODEL") ||
    readEnv("DEEPSEEK_MODEL") ||
    "deepseek-v4-flash"
  );
}

export async function generateLocalDeepSeekJson<T>(params: {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  cacheDir?: string | null;
  signal?: AbortSignal;
}): Promise<LocalLlmResult<T>> {
  const apiKey = readEnv("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is missing");

  const baseUrl = (readEnv("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/$/, "");
  const model = getSourcingLlmModel();
  const cacheKey = buildCacheKey({
    model,
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: params.maxOutputTokens ?? 1600,
    temperature: params.temperature ?? 0,
  });
  const cached = readCachedResult<T>(params.cacheDir, cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  const timeout = createTimeoutSignal(params.signal, 45000);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      stream: false,
      max_tokens: params.maxOutputTokens ?? 1600,
      response_format: { type: "json_object" },
      temperature: params.temperature ?? 0,
      thinking: { type: "disabled" },
    }),
    signal: timeout.signal,
  }).finally(timeout.cleanup);

  const raw = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, unknown>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(
      `DeepSeek API error ${response.status}: ${raw?.error?.message || response.statusText}`,
    );
  }

  const rawText = raw?.choices?.[0]?.message?.content?.trim() || "";
  if (!rawText) throw new Error("DeepSeek returned an empty response");
  const usage = normalizeUsage(raw?.usage);
  let parsedData: T;
  let finalRawText = rawText;
  let finalUsage = usage;
  try {
    parsedData = JSON.parse(extractJsonText(rawText)) as T;
  } catch (error) {
    const repaired = await repairJsonText({
      apiKey,
      baseUrl,
      model,
      rawText,
      errorMessage: error instanceof Error ? error.message : String(error),
      signal: params.signal,
    });
    finalRawText = repaired.rawText;
    finalUsage = addUsage(usage, repaired.usage);
    parsedData = JSON.parse(extractJsonText(repaired.rawText)) as T;
  }

  const result: LocalLlmResult<T> = {
    data: parsedData,
    rawText: finalRawText,
    usage: finalUsage,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
  };
  writeCachedResult(params.cacheDir, cacheKey, result);
  return result;
}

export async function parseJdWithLlm(jdText: string, options: { cacheDir?: string | null } = {}) {
  return generateLocalDeepSeekJson<ParsedSearchIntent>({
    system: [
      "You are a strict recruiting sourcing strategist.",
      "Extract only information that is useful for finding passive candidates.",
      "Return compact JSON. Do not include markdown.",
    ].join("\n"),
    prompt: [
      "Parse this job description into a sourcing intent.",
      "Use this exact JSON shape:",
      JSON.stringify({
        role_family: "backend | frontend | infra | ml | data | product | sales | other",
        target_title: "string",
        seniority: "string",
        must_have: ["string"],
        nice_to_have: ["string"],
        location: "string or null",
        target_companies: ["string"],
        adjacent_backgrounds: ["string"],
        avoid: ["string"],
        notes: ["string"],
      }),
      "",
      jdText,
    ].join("\n"),
    maxOutputTokens: 1200,
    cacheDir: options.cacheDir,
  });
}

export async function generateSourcingLanesWithLlm(params: {
  jdText: string;
  intent: ParsedSearchIntent;
  cacheDir?: string | null;
}) {
  return generateLocalDeepSeekJson<{ lanes: SourcingLane[] }>({
    system: [
      "You design practical sourcing lanes for a recruiting product.",
      "The goal is to find passive candidates using web discovery, not to rank applicants.",
      "Prefer multiple narrow-but-not-empty lanes over one broad query.",
      "Return compact JSON only.",
    ].join("\n"),
    prompt: [
      "Create 4 to 8 sourcing lanes for this JD.",
      "Providers allowed: serper, exa, firecrawl, bright, github.",
      "Bright is only a tiny structured probe, not a semantic search engine.",
      "Each lane must include 1 to 3 provider-specific queries.",
      "For Serper LinkedIn X-ray, include site:linkedin.com/in when useful.",
      "Use this exact shape:",
      JSON.stringify({
        lanes: [
          {
            lane_id: "lane-1",
            type: "title_xray | company_target | skill_evidence | adjacent_background | public_evidence | bright_probe",
            goal: "string",
            provider_hints: ["serper"],
            queries: [{ provider: "serper", query: "string" }],
            must_keep: ["string"],
            relax_if_empty: ["string"],
            stop_conditions: ["string"],
            max_results: 10,
          },
        ],
      }),
      "",
      "Intent:",
      JSON.stringify(params.intent, null, 2),
      "",
      "JD:",
      params.jdText,
    ].join("\n"),
    maxOutputTokens: 2600,
    cacheDir: params.cacheDir,
  });
}

export async function lightScreenCandidatesWithLlm(params: {
  jdText: string;
  intent: ParsedSearchIntent;
  cards: CandidateCard[];
  cacheDir?: string | null;
}) {
  return generateLocalDeepSeekJson<{ decisions: LightScreenDecision[] }>({
    system: [
      "You are a strict recruiter-quality reviewer.",
      "Judge whether each lead is worth advancing for the given JD.",
      "Do not reward loose keyword overlap. Evidence must support the decision.",
      "If the card only contains a search snippet, be conservative.",
      "`yes` requires direct evidence for the core role, seniority, location/work authorization when required, and at least two must-have skills or domain signals.",
      "If core evidence is inferred with words like likely/probably/implies, choose `maybe`, not `yes`.",
      "Missing evidence can justify `research_more`, but not `contact`.",
      "Return JSON only.",
    ].join("\n"),
    prompt: [
      "Evaluate these candidate cards with one unified recruiting/headhunter standard.",
      "`yes` means a real recruiter would put this person into outreach or shortlist.",
      "`maybe` is reviewable but not contact-worthy.",
      "For snippet-only LinkedIn results, use `yes` only when the snippet directly proves a strong match.",
      "If location is a hard requirement and the card does not prove it, do not output `yes`.",
      "Do not treat generic senior backend, scalable APIs, AWS, or fintech as enough unless the JD's must-have stack and constraints are directly supported.",
      "Use this exact shape:",
      JSON.stringify({
        decisions: [
          {
            candidate_id: "string",
            would_advance: "yes | no | maybe",
            reason: "string",
            deal_breaker: "string or null",
            missing_evidence: ["string"],
            source_confidence: "high | medium | low",
            profile_completeness: "high | medium | low",
            outreach_angle: "string or null",
            suggested_next_action: "contact | research_more | reject | expand_similar",
          },
        ],
      }),
      "",
      "Intent:",
      JSON.stringify(params.intent, null, 2),
      "",
      "JD:",
      params.jdText,
      "",
      "Candidate cards:",
      JSON.stringify(params.cards, null, 2),
    ].join("\n"),
    maxOutputTokens: 6000,
    cacheDir: params.cacheDir,
  });
}

export async function diagnoseLanesWithLlm(params: {
  jdText: string;
  intent: ParsedSearchIntent;
  lanes: SourcingLane[];
  laneStats: Array<{
    lane_id: string;
    provider: string;
    planned_queries: number;
    success_count: number;
    error_count: number;
    returned_count: number;
    lead_count: number;
    sample_queries: string[];
    sample_errors: string[];
  }>;
  cacheDir?: string | null;
}) {
  return generateLocalDeepSeekJson<{ diagnoses: LaneDiagnosis[] }>({
    system: [
      "You diagnose recruiting sourcing lanes.",
      "Use provider stats and sample queries to decide whether each lane should expand, stop, revise query, or get more evidence.",
      "Be direct. Do not hide data-source failures behind generic advice.",
      "Return JSON only.",
    ].join("\n"),
    prompt: [
      "Diagnose each lane for this JD sourcing run.",
      "Use this exact shape:",
      JSON.stringify({
        diagnoses: [
          {
            lane_id: "string",
            status: "expand | stop | revise_query | needs_more_evidence",
            failure_reason: "none | query_too_narrow | query_too_broad | provider_coverage | budget_blocked | location_too_strict | jd_too_rare | provider_error | needs_enrichment",
            reason: "string",
            recommended_change: "string or null",
          },
        ],
      }),
      "",
      "Intent:",
      JSON.stringify(params.intent, null, 2),
      "",
      "Lanes:",
      JSON.stringify(params.lanes, null, 2),
      "",
      "Lane stats:",
      JSON.stringify(params.laneStats, null, 2),
      "",
      "JD:",
      params.jdText,
    ].join("\n"),
    maxOutputTokens: 2200,
    cacheDir: params.cacheDir,
  });
}

function extractJsonText(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]?.trim()) return fenced[1].trim();
  const firstCurly = text.indexOf("{");
  const firstSquare = text.indexOf("[");
  const starts = [firstCurly, firstSquare].filter((value) => value >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function normalizeUsage(usage: Record<string, unknown> | undefined): LocalLlmUsage {
  const inputTokens = numeric(usage?.prompt_tokens);
  const outputTokens = numeric(usage?.completion_tokens);
  const totalTokens = numeric(usage?.total_tokens) || inputTokens + outputTokens;
  const cachedInputTokens = numeric(usage?.prompt_cache_hit_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    cacheMissInputTokens: Math.max(0, inputTokens - cachedInputTokens),
  };
}

async function repairJsonText(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  rawText: string;
  errorMessage: string;
  signal?: AbortSignal;
}) {
  const timeout = createTimeoutSignal(params.signal, 45000);
  const response = await fetch(`${params.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: "system",
          content: [
            "You repair malformed JSON for a recruiting sourcing pipeline.",
            "Return valid JSON only. Do not include markdown.",
            "Preserve the original schema and substantive values as much as possible.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "The JSON below failed to parse.",
            `Parse error: ${params.errorMessage}`,
            "Repair it into valid JSON.",
            "",
            params.rawText,
          ].join("\n"),
        },
      ],
      stream: false,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      temperature: 0,
      thinking: { type: "disabled" },
    }),
    signal: timeout.signal,
  }).finally(timeout.cleanup);

  const raw = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, unknown>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(
      `DeepSeek JSON repair error ${response.status}: ${raw?.error?.message || response.statusText}`,
    );
  }

  const rawText = raw?.choices?.[0]?.message?.content?.trim() || "";
  if (!rawText) throw new Error("DeepSeek JSON repair returned an empty response");
  return {
    rawText,
    usage: normalizeUsage(raw?.usage),
  };
}

function addUsage(a: LocalLlmUsage, b: LocalLlmUsage): LocalLlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheMissInputTokens: a.cacheMissInputTokens + b.cacheMissInputTokens,
  };
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildCacheKey(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readCachedResult<T>(cacheDir: string | null | undefined, cacheKey: string) {
  if (!cacheDir) return null;
  const filePath = path.join(cacheDir, `${cacheKey}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as LocalLlmResult<T>;
    return {
      ...raw,
      latencyMs: 0,
      cacheHit: true,
    };
  } catch {
    return null;
  }
}

function writeCachedResult<T>(
  cacheDir: string | null | undefined,
  cacheKey: string,
  result: LocalLlmResult<T>,
) {
  if (!cacheDir) return;
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, `${cacheKey}.json`), `${JSON.stringify(result, null, 2)}\n`);
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
