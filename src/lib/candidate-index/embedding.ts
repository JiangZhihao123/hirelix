import { getLogger } from "@/lib/logger";

const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "Qwen/Qwen3-Embedding-8B";
const DEFAULT_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 32;
const MAX_ATTEMPTS = 3;
const embeddingLogger = getLogger({ component: "candidate_index_embedding" });

type EmbeddingResponse = {
  data?: Array<{ index?: number; embedding?: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

export type EmbeddingBatchResult = {
  embeddings: number[][];
  model: string;
  dimensions: number;
  inputTokens: number;
};

export function getEmbeddingConfig() {
  const dimensionsRaw = Number.parseInt(process.env.SEARCH_EMBEDDING_DIMENSIONS || "", 10);
  const dimensions = Number.isFinite(dimensionsRaw) ? dimensionsRaw : DEFAULT_DIMENSIONS;
  if (dimensions !== DEFAULT_DIMENSIONS) {
    throw new Error(`SEARCH_EMBEDDING_DIMENSIONS must be ${DEFAULT_DIMENSIONS}`);
  }
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("SILICONFLOW_API_KEY is missing");
  return {
    apiKey,
    baseUrl: (process.env.SILICONFLOW_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.SEARCH_EMBEDDING_MODEL || DEFAULT_MODEL,
    dimensions,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function embedBatch(texts: string[]): Promise<EmbeddingBatchResult> {
  if (texts.length === 0 || texts.length > MAX_BATCH_SIZE) {
    throw new Error(`Embedding batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  const config = getEmbeddingConfig();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: texts,
        dimensions: config.dimensions,
        encoding_format: "float",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const message = (await response.text()).slice(0, 500);
      if (attempt < MAX_ATTEMPTS && shouldRetry(response.status)) {
        embeddingLogger.warn({ status: response.status, attempt }, "embedding request retrying");
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`SiliconFlow embeddings failed (${response.status}): ${message}`);
    }

    const payload = (await response.json()) as EmbeddingResponse;
    const rows = [...(payload.data || [])].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    const embeddings = rows.map((row) => row.embedding || []);
    if (embeddings.length !== texts.length) {
      throw new Error(`SiliconFlow returned ${embeddings.length} embeddings for ${texts.length} inputs`);
    }
    for (const embedding of embeddings) {
      if (embedding.length !== config.dimensions || embedding.some((value) => !Number.isFinite(value))) {
        throw new Error(`SiliconFlow returned an invalid embedding dimension; expected ${config.dimensions}`);
      }
    }
    return {
      embeddings,
      model: config.model,
      dimensions: config.dimensions,
      inputTokens: payload.usage?.total_tokens ?? payload.usage?.prompt_tokens ?? 0,
    };
  }

  throw new Error("SiliconFlow embeddings exhausted retries");
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingBatchResult> {
  const embeddings: number[][] = [];
  let inputTokens = 0;
  let model = "";
  let dimensions = DEFAULT_DIMENSIONS;

  for (let index = 0; index < texts.length; index += MAX_BATCH_SIZE) {
    const result = await embedBatch(texts.slice(index, index + MAX_BATCH_SIZE));
    embeddings.push(...result.embeddings);
    inputTokens += result.inputTokens;
    model = result.model;
    dimensions = result.dimensions;
  }
  return { embeddings, model, dimensions, inputTokens };
}

