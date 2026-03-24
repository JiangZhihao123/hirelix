import {
  HTTPClient,
  OpenRouter,
} from "@openrouter/sdk";
import { fetch as undiciFetch, ProxyAgent } from "undici";

type OpenRouterJsonSchemaConfig = {
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
};

type OpenRouterTextResult = {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
  };
  rawResponse: Awaited<ReturnType<OpenRouter["chat"]["send"]>>;
};

let cachedClient: OpenRouter | null = null;
let cachedHttpClient: HTTPClient | null = null;

function getProxyUrl() {
  return (
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    null
  );
}

function createProxyFetcher() {
  if (process.env.NODE_ENV !== "development") return undefined;
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;

  const proxyAgent = new ProxyAgent(proxyUrl);

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestInit = (init ?? {}) as Record<string, unknown>;
    return undiciFetch(input as never, {
      ...requestInit,
      dispatcher: proxyAgent,
    } as never) as unknown as Promise<Response>;
  }) satisfies typeof fetch;
}

function getAppReferer() {
  return process.env.OPENROUTER_HTTP_REFERER || "https://hirelix.com";
}

function getAppTitle() {
  return process.env.OPENROUTER_X_TITLE || "Hirelix";
}

export function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }
  return apiKey;
}

export function getOpenRouterBaseUrl() {
  return (
    process.env.OPENROUTER_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://openrouter.ai/api/v1"
  );
}

export function getDefaultOpenRouterModel() {
  return (
    process.env.AI_MODEL ||
    process.env.SEARCH_JUDGE_MODEL ||
    "deepseek/deepseek-chat"
  );
}

function getOpenRouterHttpClient() {
  if (cachedHttpClient) return cachedHttpClient;

  cachedHttpClient = new HTTPClient({
    fetcher: createProxyFetcher(),
  });

  return cachedHttpClient;
}

export function getOpenRouterClient() {
  if (cachedClient) return cachedClient;

  cachedClient = new OpenRouter({
    apiKey: getOpenRouterApiKey(),
    serverURL: getOpenRouterBaseUrl(),
    httpReferer: getAppReferer(),
    xTitle: getAppTitle(),
    httpClient: getOpenRouterHttpClient(),
  });

  return cachedClient;
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
      },
    },
    {
      signal: options.abortSignal,
      timeoutMs: options.timeoutMs,
    },
  );

  const message = response.choices[0]?.message;
  return {
    text: normalizeMessageContent(message?.content),
    usage: {
      inputTokens: response.usage?.promptTokens ?? 0,
      outputTokens: response.usage?.completionTokens ?? 0,
      totalTokens: response.usage?.totalTokens ?? 0,
      cachedInputTokens:
        response.usage?.promptTokensDetails?.cachedTokens ?? 0,
    },
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
