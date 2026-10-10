import assert from "node:assert/strict";
import test from "node:test";
import { IndexProviderError, requestIndexJson } from "../src/lib/candidate-index/provider-request";

const base = { url: "https://example.test/embeddings", apiKey: "test", body: {}, timeoutMs: 1000 };

test("retries transient transport failures with a fresh deadline", async () => {
  const signals: unknown[] = [];
  let calls = 0;
  const result = await requestIndexJson({ ...base, fetcher: (async (_url, init) => {
    signals.push(init?.signal);
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    if (calls === 2) {
      const response = Response.json({});
      response.json = async () => { throw new TypeError("connection closed"); };
      return response;
    }
    return Response.json({ ready: true });
  }) as typeof fetch });
  assert.deepEqual(result, { ready: true });
  assert.equal(new Set(signals).size, 3);
});

test("a full provider deadline ends the request with an actionable timeout", async () => {
  let calls = 0;
  await assert.rejects(requestIndexJson({ ...base, fetcher: (async () => {
    calls += 1;
    const response = Response.json({});
    response.json = async () => { throw new DOMException("private input", "TimeoutError"); };
    return response;
  }) as typeof fetch }), (error: unknown) => {
    assert.ok(error instanceof IndexProviderError);
    assert.equal(error.status, 504);
    assert.match(error.userMessage, /timed out/);
    assert.doesNotMatch(error.message + error.userMessage, /private input/);
    return true;
  });
  assert.equal(calls, 1);
});

test("does not retry authorization failures or expose provider response bodies", async () => {
  let calls = 0;
  await assert.rejects(requestIndexJson({ ...base, fetcher: (async () => {
    calls += 1;
    return new Response("private input", { status: 401 });
  }) as typeof fetch }), /failed \(401\)$/);
  assert.equal(calls, 1);
});

test("balance failures preserve a safe actionable status without retrying or echoing inputs", async () => {
  let calls = 0;
  await assert.rejects(requestIndexJson({ ...base, fetcher: (async () => {
    calls += 1;
    return new Response("secret and private source material", { status: 402 });
  }) as typeof fetch }), (error: unknown) => {
    assert.ok(error instanceof IndexProviderError);
    assert.equal(error.status, 402);
    assert.match(error.userMessage, /insufficient provider balance/);
    assert.doesNotMatch(error.message + error.userMessage, /secret|private source material/);
    return true;
  });
  assert.equal(calls, 1);
});
