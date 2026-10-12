import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNativeSearch, publicWebUrl, searchWeb } from "../src/lib/workspace/web-search";
import { turnSnapshot } from "../src/lib/workspace/turn-progress";

const usage = {input_tokens: 100, output_tokens: 20};
test("only native search blocks establish sources; excerpts remain tied to their URL", () => {
  const result = parseNativeSearch({stop_reason: "end_turn", usage, content: [
    {type: "thinking", text: "private reasoning"},
    {type: "web_search_tool_result", content: [
      {type: "web_search_result", title: "Official source", url: "https://example.com/news", encrypted_content: "private", page_age: null},
      {type: "web_search_result", title: "Duplicate", url: "https://example.com/news"},
      {type: "web_search_result", title: "Unsafe", url: "javascript:alert(1)"},
    ]},
    {type: "text", text: "A generated summary mentioning https://invented.example", citations: [{url: "https://example.com/news", cited_text: "Actual excerpt"}]},
  ]});
  assert.deepEqual(result.sources, [{title: "Official source", href: "https://example.com/news", snippet: "Actual excerpt"}]);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.ok(result.search_summary.includes("generated summary"));
});

test("missing search, provider errors and truncated responses are failures, not empty successes", () => {
  assert.throws(() => parseNativeSearch({stop_reason: "end_turn", usage, content: [{type: "text", text: "I searched"}]}), /did not perform/);
  assert.throws(() => parseNativeSearch({stop_reason: "end_turn", usage, content: [{type: "web_search_tool_result", content: {type: "web_search_tool_result_error", error_code: "too_many_requests"}}]}), /search failed/);
  assert.throws(() => parseNativeSearch({stop_reason: "end_turn", usage, content: [{type: "web_search_tool_result", content: [{type: "web_search_tool_result_error", error_code: "unavailable"}]}]}), /search failed \(unavailable\)/);
  assert.throws(() => parseNativeSearch({stop_reason: "max_tokens", usage, content: [{type: "web_search_tool_result", content: []}]}), /did not finish/);
  assert.deepEqual(parseNativeSearch({stop_reason: "end_turn", usage, content: [{type: "web_search_tool_result", content: []}]}).sources, []);
});

test("search activity and source URLs survive terminal snapshots", () => {
  const parts = [{type: "tool", id: "search", label: "Searching the web", status: "done", query: "public company news", sources: [{title: "Official source", href: "https://example.com/news"}]}];
  const snapshot = turnSnapshot({id: "turn", status: "done", progress: "Complete", error: null, updated_at: "2026-10-12T10:00:00Z", result: {parts}});
  assert.deepEqual(snapshot.result.parts, parts);
  assert.equal(publicWebUrl("https://user:password@example.com"), null);
  assert.equal(publicWebUrl("data:text/html,hello"), null);
});

test("cancellation exits before dispatching a native search", async () => {
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "unused-local-test-value";
  try {
    await assert.rejects(() => searchWeb("public news", AbortSignal.abort(new Error("cancelled before dispatch"))), /cancelled before dispatch/);
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  }
});
