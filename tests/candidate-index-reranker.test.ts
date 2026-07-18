import assert from "node:assert/strict";
import test from "node:test";

import { rerankDocuments } from "@/lib/candidate-index/reranker";

test("reranker batches documents and merges scores into one stable ranking", async () => {
  const originalKey = process.env.SILICONFLOW_API_KEY;
  const originalBatchSize = process.env.SEARCH_RERANK_BATCH_SIZE;
  process.env.SILICONFLOW_API_KEY = "test-key";
  process.env.SEARCH_RERANK_BATCH_SIZE = "2";
  let calls = 0;
  try {
    const result = await rerankDocuments("agentic ML engineer", [
      { profileId: "accountant", text: "Accounting and audit", retrievalRank: 1 },
      { profileId: "agent", text: "Built production LangGraph agents", retrievalRank: 3 },
      { profileId: "ml", text: "Deployed production ML services", retrievalRank: 2 },
    ], {
      fetcher: async (_input, init) => {
        calls += 1;
        const payload = JSON.parse(String(init?.body)) as { documents: string[] };
        return new Response(JSON.stringify({
          results: payload.documents.map((document, index) => ({
            index,
            relevance_score: document.includes("LangGraph") ? 0.95 : document.includes("ML") ? 0.8 : 0.05,
          })),
          meta: { tokens: { input_tokens: 10 } },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.results.map((item) => item.profileId), ["agent", "ml", "accountant"]);
    assert.deepEqual(result.results.map((item) => item.rerankRank), [1, 2, 3]);
    assert.equal(result.inputTokens, 20);
  } finally {
    if (originalKey === undefined) delete process.env.SILICONFLOW_API_KEY;
    else process.env.SILICONFLOW_API_KEY = originalKey;
    if (originalBatchSize === undefined) delete process.env.SEARCH_RERANK_BATCH_SIZE;
    else process.env.SEARCH_RERANK_BATCH_SIZE = originalBatchSize;
  }
});
