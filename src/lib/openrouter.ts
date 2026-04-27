import {
  HTTPClient,
  OpenRouter,
} from "@openrouter/sdk";

export type OpenRouterJsonSchemaConfig = {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  strict?: boolean | null;
};

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
};

type OpenRouterTextOptions = {
  model: string;
  system?: string;
  prompt?: string;
  messages?: OpenRouterMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  jsonMode?: boolean;
  jsonSchema?: OpenRouterJsonSchemaConfig;
  requireParameters?: boolean;
};

type OpenRouterTextResult = {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    cacheMissInputTokens: number;
  };
  rawResponse: unknown;
};

let cachedClient: OpenRouter | null = null;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_LLM_GLOBAL_CONCURRENCY = 12;
const DEFAULT_LLM_MAX_ATTEMPTS = 4;
const DEFAULT_LLM_RETRY_BASE_MS = 2000;
const DEFAULT_LLM_RETRY_MAX_MS = 30000;

type LlmLimiterState = {
  active: number;
  queue: Array<() => void>;
};

declare global {
  var __hirelixLlmLimiterState__: LlmLimiterState | undefined;
}

class DeepSeekApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DeepSeekApiError";
  }
}

function getConfiguredPositiveInt(
  envName: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(safeValue, min), max);
}

function getLlmLimiterState(): LlmLimiterState {
  if (!globalThis.__hirelixLlmLimiterState__) {
    globalThis.__hirelixLlmLimiterState__ = {
      active: 0,
      queue: [],
    };
  }
  return globalThis.__hirelixLlmLimiterState__;
}

function acquireLlmSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new Error("LLM request aborted"),
    );
  }

  const limit = getConfiguredPositiveInt(
    "SEARCH_LLM_GLOBAL_CONCURRENCY",
    DEFAULT_LLM_GLOBAL_CONCURRENCY,
    { max: 500 },
  );
  const state = getLlmLimiterState();

  return new Promise((resolve, reject) => {
    let settled = false;
    let start: (() => void) | null = null;

    const release = () => {
      state.active = Math.max(0, state.active - 1);
      state.queue.shift()?.();
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (start) {
        state.queue = state.queue.filter((queued) => queued !== start);
      }
      reject(signal?.reason instanceof Error ? signal.reason : new Error("LLM request aborted"));
    };

    start = () => {
      if (settled) return;
      if (signal?.aborted) {
        onAbort();
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      state.active += 1;
      resolve(release);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    if (state.active < limit) {
      start();
    } else {
      state.queue.push(start);
    }
  });
}

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new Error("LLM request aborted"),
    );
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("LLM request aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createRequestSignal(options: OpenRouterTextOptions): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  if (!options.timeoutMs) {
    return {
      signal: options.abortSignal,
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  const onAbort = () => {
    controller.abort(
      options.abortSignal?.reason instanceof Error
        ? options.abortSignal.reason
        : new Error("LLM request aborted"),
    );
  };
  const timeout = setTimeout(() => {
    controller.abort(new Error(`LLM request timed out after ${options.timeoutMs}ms`));
  }, options.timeoutMs);

  options.abortSignal?.addEventListener("abort", onAbort, { once: true });
  if (options.abortSignal?.aborted) {
    onAbort();
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      options.abortSignal?.removeEventListener("abort", onAbort);
    },
  };
}

function isRetriableLlmError(error: unknown) {
  if (error instanceof DeepSeekApiError) {
    return [408, 429, 500, 502, 503, 504, 524, 529].includes(error.status ?? 0);
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("econnreset")
    );
  }
  return false;
}

function getRetryDelayMs(attempt: number) {
  const baseMs = getConfiguredPositiveInt(
    "SEARCH_LLM_RETRY_BASE_MS",
    DEFAULT_LLM_RETRY_BASE_MS,
    { max: 60000 },
  );
  const maxMs = getConfiguredPositiveInt(
    "SEARCH_LLM_RETRY_MAX_MS",
    DEFAULT_LLM_RETRY_MAX_MS,
    { max: 120000 },
  );
  const exponentialMs = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitterMs = Math.floor(Math.random() * Math.min(1000, Math.max(100, baseMs)));
  return Math.min(maxMs, exponentialMs + jitterMs);
}

function buildSdkCompatibleFetcher() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      const requestInit: RequestInit = {
        method: input.method,
        headers: input.headers,
        body: input.body,
        cache: input.cache,
        credentials: input.credentials,
        integrity: input.integrity,
        keepalive: input.keepalive,
        mode: input.mode,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        signal: init?.signal ?? input.signal,
        ...(input.body ? { duplex: "half" as const } : {}),
        ...(init ?? {}),
      };
      return fetch(input.url, requestInit);
    }

    return fetch(input, init);
  };
}

function getAppReferer() {
  return process.env.OPENROUTER_HTTP_REFERER || "https://hirelix.com";
}

function getAppTitle() {
  return process.env.OPENROUTER_X_TITLE || "Hirelix";
}

export function getOpenRouterApiKey() {
  const baseUrl = getOpenRouterBaseUrl();
  const apiKey = isOfficialDeepSeekBaseUrl(baseUrl)
    ? process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY
    : process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      isOfficialDeepSeekBaseUrl(baseUrl)
        ? "DEEPSEEK_API_KEY is missing"
        : "OPENROUTER_API_KEY is missing",
    );
  }
  return apiKey;
}

export function getOpenRouterBaseUrl() {
  if (process.env.OPENROUTER_BASE_URL) return process.env.OPENROUTER_BASE_URL;
  if (process.env.DEEPSEEK_BASE_URL) return process.env.DEEPSEEK_BASE_URL;
  if (
    process.env.AI_PROVIDER?.trim().toLowerCase() === "deepseek" ||
    (process.env.DEEPSEEK_API_KEY && !process.env.OPENROUTER_API_KEY)
  ) {
    return DEEPSEEK_BASE_URL;
  }
  return OPENROUTER_BASE_URL;
}

export function getDefaultOpenRouterModel() {
  if (isUsingOfficialDeepSeek()) {
    return (
      process.env.AI_MODEL ||
      process.env.SEARCH_JUDGE_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      "deepseek-v4-flash"
    );
  }

  return (
    process.env.AI_MODEL ||
    process.env.SEARCH_JUDGE_MODEL ||
    "deepseek/deepseek-v4-flash"
  );
}

export function getLightweightOpenRouterModel() {
  if (isUsingOfficialDeepSeek()) {
    return (
      process.env.SEARCH_LIGHT_MODEL ||
      process.env.DEEPSEEK_LIGHT_MODEL ||
      process.env.AI_MODEL ||
      process.env.SEARCH_JUDGE_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      "deepseek-v4-flash"
    );
  }

  return (
    process.env.SEARCH_LIGHT_MODEL ||
    process.env.OPENROUTER_LIGHT_MODEL ||
    process.env.DEEPSEEK_LIGHT_MODEL ||
    process.env.AI_MODEL ||
    process.env.SEARCH_JUDGE_MODEL ||
    "deepseek/deepseek-v4-flash"
  );
}

export function getOpenRouterClient() {
  if (cachedClient) return cachedClient;

  cachedClient = new OpenRouter({
    apiKey: getOpenRouterApiKey(),
    serverURL: getOpenRouterBaseUrl(),
    httpReferer: getAppReferer(),
    xTitle: getAppTitle(),
    httpClient: new HTTPClient({
      fetcher: buildSdkCompatibleFetcher(),
    }),
  });

  return cachedClient;
}

function isOfficialDeepSeekBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname === "api.deepseek.com";
  } catch {
    return baseUrl.includes("api.deepseek.com");
  }
}

function isUsingOfficialDeepSeek() {
  return isOfficialDeepSeekBaseUrl(getOpenRouterBaseUrl());
}

function getDeepSeekThinkingType(): "enabled" | "disabled" {
  const raw = process.env.DEEPSEEK_THINKING?.trim().toLowerCase();
  if (["0", "false", "off", "no", "disabled"].includes(raw ?? "")) {
    return "disabled";
  }
  return "enabled";
}

function getDeepSeekReasoningEffort(): "high" | "max" {
  const raw = (
    process.env.DEEPSEEK_REASONING_EFFORT ||
    process.env.REASONING_EFFORT ||
    "max"
  ).trim().toLowerCase();
  return raw === "max" || raw === "xhigh" ? "max" : "high";
}

function buildMessages(options: OpenRouterTextOptions): OpenRouterMessage[] {
  if (options.messages && options.messages.length > 0) return options.messages;

  const messages: OpenRouterMessage[] = [];
  if (options.system?.trim()) {
    messages.push({
      role: "system",
      content: options.system.trim(),
    });
  }
  if (options.prompt?.trim()) {
    messages.push({
      role: "user",
      content: options.prompt.trim(),
    });
  }
  return messages;
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        const value = (part as { text?: unknown }).text;
        return typeof value === "string" ? value : "";
      }
      return "";
    })
    .join("");
}

function readNumericField(
  value: unknown,
  keys: string[],
): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const field = record[key];
    if (typeof field === "number" && Number.isFinite(field)) return field;
  }
  return null;
}

function buildUsage(usage: unknown) {
  const promptDetails =
    usage && typeof usage === "object"
      ? (usage as Record<string, unknown>).promptTokensDetails ??
        (usage as Record<string, unknown>).prompt_tokens_details
      : null;
  const inputTokens = readNumericField(usage, ["promptTokens", "prompt_tokens"]) ?? 0;
  const outputTokens =
    readNumericField(usage, ["completionTokens", "completion_tokens"]) ?? 0;
  const totalTokens = readNumericField(usage, ["totalTokens", "total_tokens"]) ?? 0;
  const cachedInputTokens =
    readNumericField(usage, ["prompt_cache_hit_tokens"]) ??
    readNumericField(promptDetails, ["cachedTokens", "cached_tokens"]) ??
    0;
  const cacheMissInputTokens =
    readNumericField(usage, ["prompt_cache_miss_tokens"]) ??
    Math.max(0, inputTokens - cachedInputTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    cacheMissInputTokens,
  };
}

async function generateOfficialDeepSeekText(
  options: OpenRouterTextOptions,
): Promise<OpenRouterTextResult> {
  const maxAttempts = getConfiguredPositiveInt(
    "SEARCH_LLM_MAX_ATTEMPTS",
    DEFAULT_LLM_MAX_ATTEMPTS,
    { max: 8 },
  );

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await sendOfficialDeepSeekRequest(options);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      lastError = normalizedError;
      if (options.abortSignal?.aborted || attempt >= maxAttempts || !isRetriableLlmError(error)) {
        throw normalizedError;
      }
      await sleep(getRetryDelayMs(attempt), options.abortSignal);
    }
  }

  throw lastError || new Error("DeepSeek request failed");
}

async function sendOfficialDeepSeekRequest(
  options: OpenRouterTextOptions,
): Promise<OpenRouterTextResult> {
  const baseUrl = getOpenRouterBaseUrl().replace(/\/$/, "");
  const thinkingType = getDeepSeekThinkingType();
  const body: Record<string, unknown> = {
    model: options.model,
    messages: buildMessages(options),
    stream: false,
    ...(typeof options.maxOutputTokens === "number"
      ? { max_tokens: options.maxOutputTokens }
      : {}),
    ...(options.jsonSchema || options.jsonMode
      ? { response_format: { type: "json_object" } }
      : {}),
    thinking: { type: thinkingType },
    ...(thinkingType === "enabled"
      ? { reasoning_effort: getDeepSeekReasoningEffort() }
      : typeof options.temperature === "number"
        ? { temperature: options.temperature }
        : {}),
  };

  const { signal, cleanup } = createRequestSignal(options);
  let release: (() => void) | null = null;
  let response: Response;
  try {
    release = await acquireLlmSlot(signal);
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenRouterApiKey()}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } finally {
    release?.();
    cleanup();
  }

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>).error
        : null;
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : response.statusText;
    throw new DeepSeekApiError(`DeepSeek API error ${response.status}: ${message}`, response.status);
  }

  const apiError = raw && typeof raw === "object"
    ? (raw as Record<string, unknown>).error
    : null;
  if (apiError && typeof apiError === "object") {
    const { code, message: msg } = apiError as { code?: unknown; message?: unknown };
    throw new DeepSeekApiError(
      `DeepSeek API error ${String(code ?? "unknown")}: ${String(msg ?? "unknown error")}`,
      typeof code === "number" ? code : undefined,
    );
  }

  const choices =
    raw && typeof raw === "object"
      ? (raw as { choices?: Array<{ message?: { content?: unknown } }> }).choices
      : null;
  const message = choices?.[0]?.message;
  if (!message) {
    throw new Error("DeepSeek returned an empty response (no choices)");
  }

  return {
    text: normalizeMessageContent(message.content),
    usage: buildUsage(
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>).usage
        : null,
    ),
    rawResponse: raw,
  };
}

export function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]?.trim()) {
    return fenced[1].trim();
  }

  const firstCurly = text.indexOf("{");
  const firstSquare = text.indexOf("[");
  const candidates = [firstCurly, firstSquare].filter((value) => value >= 0);
  const start = candidates.length > 0 ? Math.min(...candidates) : -1;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));

  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

export async function generateOpenRouterText(
  options: OpenRouterTextOptions,
): Promise<OpenRouterTextResult> {
  if (isUsingOfficialDeepSeek()) {
    return generateOfficialDeepSeekText(options);
  }

  const client = getOpenRouterClient();
  const response = await client.chat.send(
    {
      chatGenerationParams: {
        model: options.model,
        messages: buildMessages(options),
        stream: false,
        temperature: options.temperature ?? 0,
        ...(typeof options.maxOutputTokens === "number"
          ? { maxTokens: options.maxOutputTokens }
          : {}),
        ...(options.jsonSchema
          ? {
              responseFormat: {
                type: "json_schema",
                jsonSchema: options.jsonSchema,
              } as const,
            }
          : options.jsonMode
            ? {
                responseFormat: {
                  type: "json_object",
                } as const,
              }
            : {}),
        ...(options.requireParameters
          ? { provider: { requireParameters: true } }
          : {}),
      },
    },
    {
      signal: options.abortSignal,
      timeoutMs: options.timeoutMs,
    },
  );

  // 检查 API 层错误（如 402 余额不足、401 鉴权失败等）
  // OpenRouter 在出错时仍返回 200，但 choices 为空并附带 error 字段
  const apiError = (response as unknown as Record<string, unknown>).error;
  if (apiError && typeof apiError === "object") {
    const { code, message: msg } = apiError as { code?: unknown; message?: unknown };
    throw new Error(`OpenRouter API error ${String(code ?? "unknown")}: ${String(msg ?? "unknown error")}`);
  }

  const message = response.choices[0]?.message;
  if (!message) {
    throw new Error("OpenRouter returned an empty response (no choices)");
  }
  return {
    text: normalizeMessageContent(message?.content),
    usage: buildUsage(response.usage as unknown),
    rawResponse: response,
  };
}

export async function generateOpenRouterJson<T>(
  options: OpenRouterTextOptions,
): Promise<OpenRouterTextResult & { data: T }> {
  const result = await generateOpenRouterText({
    ...options,
    jsonMode: !options.jsonSchema,
  });

  try {
    return {
      ...result,
      data: JSON.parse(extractJsonText(result.text)) as T,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const parseError = new Error(
      `OpenRouter returned invalid JSON: ${message}`,
    );
    (parseError as Error & { rawText?: string }).rawText = result.text;
    throw parseError;
  }
}
