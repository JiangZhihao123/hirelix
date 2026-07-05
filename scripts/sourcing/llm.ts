import { readEnv } from "./env";
import type {
  CandidateCard,
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
  signal?: AbortSignal;
}): Promise<LocalLlmResult<T>> {
  const apiKey = readEnv("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is missing");

  const baseUrl = (readEnv("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/$/, "");
  const model = getSourcingLlmModel();
  const startedAt = Date.now();
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
    signal: params.signal,
  });

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

  return {
    data: JSON.parse(extractJsonText(rawText)) as T,
    rawText,
    usage: normalizeUsage(raw?.usage),
    latencyMs: Date.now() - startedAt,
  };
}

export async function parseJdWithLlm(jdText: string) {
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
  });
}

export async function generateSourcingLanesWithLlm(params: {
  jdText: string;
  intent: ParsedSearchIntent;
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
  });
}

export async function lightScreenCandidatesWithLlm(params: {
  jdText: string;
  intent: ParsedSearchIntent;
  cards: CandidateCard[];
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
    maxOutputTokens: 3200,
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

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
