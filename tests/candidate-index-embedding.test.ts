import assert from "node:assert/strict";
import test from "node:test";

import { generateEmbeddings } from "@/lib/candidate-index/embedding";

test("embedding client batches and preserves document order across concurrent requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SILICONFLOW_API_KEY;
  const originalConcurrency = process.env.SEARCH_EMBEDDING_CONCURRENCY;
  process.env.SILICONFLOW_API_KEY = "test-key";
  process.env.SEARCH_EMBEDDING_CONCURRENCY = "4";
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    const payload = JSON.parse(String(init?.body)) as { input: string[] };
    return new Response(JSON.stringify({
      data: payload.input.map((text, index) => ({
        index,
        embedding: [Number(text.split("-")[1]), ...Array.from({ length: 1535 }, () => 0)],
      })),
      usage: { total_tokens: payload.input.length },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const texts = Array.from({ length: 33 }, (_, index) => `document-${index}`);
    const result = await generateEmbeddings(texts);
    assert.equal(calls, 2);
    assert.equal(result.embeddings.length, 33);
    assert.deepEqual(result.embeddings.map((embedding) => embedding[0]), texts.map((_text, index) => index));
    assert.equal(result.inputTokens, 33);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SILICONFLOW_API_KEY;
    else process.env.SILICONFLOW_API_KEY = originalKey;
    if (originalConcurrency === undefined) delete process.env.SEARCH_EMBEDDING_CONCURRENCY;
    else process.env.SEARCH_EMBEDDING_CONCURRENCY = originalConcurrency;
  }
});
