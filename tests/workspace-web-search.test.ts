import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchWeb, parseFetchedPage, parseSearchResults, publicWebUrl, searchWeb, webSearchInput } from "../src/lib/workspace/web-search";
import { DEEPSEEK_WEB_REQUEST_COST_USD } from "../src/lib/agent-credit-pricing";
import { turnSnapshot } from "../src/lib/workspace/turn-progress";

const source = {title: "Official", url: "https://example.com/news", snippet: "Short summary", summary: "Provider summary", content: "Original text", rerank_score: 2.5, authority: 3, date: null, site_name: "Example"};
test("structured results preserve source provenance and separate summaries from original content", () => {
  const result = parseSearchResults({results: [source, source, {...source, url: "javascript:alert(1)"}]});
  assert.equal(result.billable, true);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].summary, "Provider summary");
  assert.equal(result.sources[0].content, "Original text");
  assert.equal(result.sources[0].relevance, 2.5);
  assert.deepEqual(parseSearchResults({results: []}), {sources: [], billable: false});
  assert.throws(() => parseSearchResults({results: [{title: "I searched"}]}), /invalid response/);
});
test("retrieved content is bounded with explicit truncation", () => {
  const result = parseSearchResults({results: Array.from({length: 10}, (_, i) => ({...source, url: `https://example.com/${i}`, content: "a".repeat(20000)}))});
  assert.equal(result.sources.reduce((sum, s) => sum + s.content.length, 0), 60000);
  assert.ok(result.sources.every(s => s.truncated));
  assert.equal(parseFetchedPage({title: "Page", content: "a".repeat(40001)}).truncated, true);
  assert.equal(parseFetchedPage({title: "Page", content: ""}).content, "");
  assert.throws(() => parseFetchedPage({content: 123}), /invalid response/);
});
test("search input follows Unicode and result limits; URLs cannot contain credentials", () => {
  assert.equal(webSearchInput.parse({query: "😀".repeat(128)}).count, 10);
  assert.equal(webSearchInput.safeParse({query: "😀".repeat(129)}).success, false);
  assert.equal(webSearchInput.safeParse({query: " "}).success, false);
  assert.equal(webSearchInput.safeParse({query: "news", count: 51}).success, false);
  assert.equal(publicWebUrl("https://user:password@example.com"), null);
  assert.equal(publicWebUrl("data:text/html,hello"), null);
  assert.equal(DEEPSEEK_WEB_REQUEST_COST_USD, 0.00075);
});
test("search and fetch activity sources survive terminal snapshots", () => {
  for (const tool of ["web_search", "web_fetch"]) {
    const parts = [{type: "tool", id: "search", tool, label: "Reading sources", status: "done", query: "public company news", sources: [{title: "Official source", href: "https://example.com/news"}]}];
    const snapshot = turnSnapshot({id: "turn", status: "done", progress: "Complete", error: null, updated_at: "2026-10-20T10:00:00Z", result: {parts}});
    assert.deepEqual(snapshot.result.parts, parts);
  }
});
test("direct API contracts, cancellation and transient errors", async () => {
  const originalFetch = globalThis.fetch, key = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "unused-local-test-value";
  try {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, "https://api.deepseek.com/v1/tools/search");
      assert.deepEqual(JSON.parse(String(init?.body)), {query: "news site:example.com", count: 3, need_content: true});
      return new Response(JSON.stringify({results: [source]}));
    };
    const result = await searchWeb("news site:example.com", new AbortController().signal, {count: 3, need_content: true});
    assert.equal(result.sources.length, 1);
    await assert.rejects(() => searchWeb("news", AbortSignal.abort(new Error("cancelled before dispatch"))), /cancelled before dispatch/);
    assert.equal(calls, 1);
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.deepseek.com/v1/tools/fetch");
      assert.deepEqual(JSON.parse(String(init?.body)), {url: source.url});
      return new Response(JSON.stringify({title: "Official", content: "# Original page"}));
    };
    assert.equal((await fetchWeb(source.url, new AbortController().signal)).sources[0].href, source.url);
    await assert.rejects(() => fetchWeb("https://user:secret@example.com", new AbortController().signal));
    calls = 0;
    globalThis.fetch = async () => { calls++; return calls === 1 ? new Response("", {status: 429}) : new Response(JSON.stringify({results: []})); };
    assert.deepEqual((await searchWeb("news", new AbortController().signal)).sources, []);
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("", {status: 401}); };
    await assert.rejects(() => searchWeb("news", new AbortController().signal), /HTTP 401/);
    assert.equal(calls, 1);
    calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("network"); };
    await assert.rejects(() => fetchWeb(source.url, new AbortController().signal), /Could not connect/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = key;
  }
});
