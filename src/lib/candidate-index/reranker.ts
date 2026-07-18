import { getLogger } from "@/lib/logger";
import type { CandidateBundle } from "@/lib/candidate-index/judgment";
import { runWithConcurrency } from "@/lib/search/concurrency";

const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "Qwen/Qwen3-Reranker-8B";
const DEFAULT_BATCH_SIZE = 32;
const MAX_BATCH_SIZE = 64;
const MAX_ATTEMPTS = 3;
const rerankerLogger = getLogger({ component: "candidate_index_reranker" });

type RerankApiResult = {
  index?: number;
  relevance_score?: number;
};

type RerankApiResponse = {
  results?: RerankApiResult[];
  meta?: { tokens?: { input_tokens?: number } };
};

export type RerankDocument = {
  profileId: string;
  text: string;
  retrievalRank: number;
};

export type RerankResult = RerankDocument & {
  rerankScore: number;
  rerankRank: number;
};

export function getRerankerConfig() {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("SILICONFLOW_API_KEY is missing");
  const rawBatchSize = Number.parseInt(process.env.SEARCH_RERANK_BATCH_SIZE || "", 10);
  const batchSize = Number.isFinite(rawBatchSize)
    ? Math.max(1, Math.min(MAX_BATCH_SIZE, rawBatchSize))
    : DEFAULT_BATCH_SIZE;
  const rawConcurrency = Number.parseInt(process.env.SEARCH_RERANK_CONCURRENCY || "", 10);
  const concurrency = Number.isFinite(rawConcurrency)
    ? Math.max(1, Math.min(12, rawConcurrency))
    : 4;
  return {
    apiKey,
    baseUrl: (process.env.SILICONFLOW_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.SEARCH_RERANK_MODEL || DEFAULT_MODEL,
    batchSize,
    concurrency,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function matchedExperienceIds(bundle: CandidateBundle) {
  const channelEvidence = bundle.retrievalEvidence.channel_evidence;
  if (!channelEvidence || typeof channelEvidence !== "object") return new Set<string>();
  const evidence = channelEvidence as Record<string, unknown>;
  const ids = [
    (evidence.experienceFts as { experienceId?: unknown } | undefined)?.experienceId,
    (evidence.experienceVector as { experienceId?: unknown } | undefined)?.experienceId,
  ];
  return new Set(ids.filter((value): value is string => typeof value === "string"));
}

export function buildRerankDocument(bundle: CandidateBundle) {
  const matchedIds = matchedExperienceIds(bundle);
  const experiences = [...bundle.experiences].sort((left, right) => {
    const leftMatched = matchedIds.has(left.id) ? 1 : 0;
    const rightMatched = matchedIds.has(right.id) ? 1 : 0;
    return rightMatched - leftMatched || left.source_ordinal - right.source_ordinal;
  });
  return [
    `Candidate: ${bundle.profile.name}`,
    `Current role: ${bundle.profile.current_title || "Unknown"} at ${bundle.profile.current_company || "Unknown"}`,
    `Location: ${[bundle.profile.city, bundle.profile.state_or_region, bundle.profile.country_code].filter(Boolean).join(", ") || "Unknown"}`,
    `Experience: ${bundle.profile.years_experience ?? "unknown"} years`,
    `Skills: ${(bundle.profile.skills || []).join("; ") || "Unknown"}`,
    `Education: ${[bundle.profile.highest_degree, ...(bundle.profile.schools || []), ...(bundle.profile.fields_of_study || [])].filter(Boolean).join("; ") || "Unknown"}`,
    `Summary: ${(bundle.profile.profile_summary || "Unknown").slice(0, 1800)}`,
    ...experiences.slice(0, 5).map((experience) => [
      `Role: ${experience.title || "Unknown"} at ${experience.company || "Unknown"}`,
      `Period: ${experience.start_date || "Unknown"} - ${experience.is_current ? "Present" : experience.end_date || "Unknown"}`,
      `Work: ${(experience.description || "Unknown").slice(0, 1200)}`,
    ].join("; ")),
  ].join("\n").slice(0, 8000);
}

async function rerankBatch(
  query: string,
  documents: RerankDocument[],
  fetcher: typeof fetch,
) {
  const config = getRerankerConfig();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetcher(`${config.baseUrl}/rerank`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        query: query.slice(0, 12000),
        documents: documents.map((document) => document.text),
        top_n: documents.length,
        return_documents: false,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      const message = (await response.text()).slice(0, 500);
      if (attempt < MAX_ATTEMPTS && shouldRetry(response.status)) {
        rerankerLogger.warn({ status: response.status, attempt }, "reranker request retrying");
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`SiliconFlow reranker failed (${response.status}): ${message}`);
    }
    const payload = await response.json() as RerankApiResponse;
    const scoreByIndex = new Map<number, number>();
    for (const result of payload.results || []) {
      if (
        typeof result.index === "number" &&
        typeof result.relevance_score === "number" &&
        Number.isFinite(result.relevance_score)
      ) {
        scoreByIndex.set(result.index, result.relevance_score);
      }
    }
    if (scoreByIndex.size !== documents.length) {
      throw new Error(`SiliconFlow reranker returned ${scoreByIndex.size} scores for ${documents.length} documents`);
    }
    return {
      rows: documents.map((document, index) => ({
        ...document,
        rerankScore: scoreByIndex.get(index)!,
      })),
      inputTokens: payload.meta?.tokens?.input_tokens ?? 0,
      model: config.model,
    };
  }
  throw new Error("SiliconFlow reranker exhausted retries");
}

export async function rerankDocuments(
  query: string,
  documents: RerankDocument[],
  options: { fetcher?: typeof fetch } = {},
) {
  if (documents.length === 0) {
    return { results: [] as RerankResult[], model: getRerankerConfig().model, inputTokens: 0 };
  }
  const config = getRerankerConfig();
  const batches: RerankDocument[][] = [];
  for (let index = 0; index < documents.length; index += config.batchSize) {
    batches.push(documents.slice(index, index + config.batchSize));
  }
  const batchResults = await runWithConcurrency(batches, config.concurrency, (batch) =>
    rerankBatch(query, batch, options.fetcher || fetch),
  );
  const ranked = batchResults.flatMap((result) => result.rows).sort((left, right) =>
    right.rerankScore - left.rerankScore ||
    left.retrievalRank - right.retrievalRank ||
    left.profileId.localeCompare(right.profileId),
  );
  return {
    results: ranked.map((item, index) => ({ ...item, rerankRank: index + 1 })),
    model: config.model,
    inputTokens: batchResults.reduce((sum, result) => sum + result.inputTokens, 0),
  };
}
