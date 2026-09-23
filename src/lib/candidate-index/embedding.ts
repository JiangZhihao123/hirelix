import { requestIndexJson } from "./provider-request";
import { runWithConcurrency } from "@/lib/search/concurrency";

const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "Qwen/Qwen3-Embedding-8B";
const DEFAULT_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 32;

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

async function embedBatch(texts: string[]): Promise<EmbeddingBatchResult> {
  if (texts.length === 0 || texts.length > MAX_BATCH_SIZE) {
    throw new Error(`Embedding batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  const config = getEmbeddingConfig();

  const payload = await requestIndexJson<EmbeddingResponse>({
    url: `${config.baseUrl}/embeddings`, apiKey: config.apiKey, timeoutMs: 60_000,
    body: { model: config.model, input: texts, dimensions: config.dimensions, encoding_format: "float" },
  });
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

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingBatchResult> {
  const batches: string[][] = [];
  for (let index = 0; index < texts.length; index += MAX_BATCH_SIZE) {
    batches.push(texts.slice(index, index + MAX_BATCH_SIZE));
  }
  if (batches.length === 0) {
    return { embeddings: [], model: getEmbeddingConfig().model, dimensions: DEFAULT_DIMENSIONS, inputTokens: 0 };
  }
  const rawConcurrency = Number.parseInt(process.env.SEARCH_EMBEDDING_CONCURRENCY || "", 10);
  const concurrency = Number.isFinite(rawConcurrency)
    ? Math.max(1, Math.min(12, rawConcurrency))
    : 4;
  const results = await runWithConcurrency(batches, concurrency, embedBatch);
  return {
    embeddings: results.flatMap((result) => result.embeddings),
    model: results[0].model,
    dimensions: results[0].dimensions,
    inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
  };
}
