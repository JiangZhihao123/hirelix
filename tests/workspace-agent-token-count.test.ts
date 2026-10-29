import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateDeepSeekInputTokens } from "../src/lib/workspace/agent-token-count";

test("DeepSeek reservation counts the complete prompt and tool schemas using the official tokenizer", async () => {
  const prompt = [{role: "user", content: [{type: "text", text: "PostgreSQL internals query optimization. 中文事实与来源。 ".repeat(1000)}]}];
  const tools = [{type: "function", name: "read_file", inputSchema: {type: "object", properties: {file_id: {type: "string"}}}}];
  const estimate = await estimateDeepSeekInputTokens(prompt, tools);
  const withoutTools = await estimateDeepSeekInputTokens(prompt, []);
  assert.ok(estimate.tokenized > withoutTools.tokenized, "Tool definitions are part of the input budget");
  assert.ok(estimate.reserved > estimate.tokenized, "Protocol headroom remains reserved");
  assert.ok(estimate.reserved < Buffer.byteLength(JSON.stringify({prompt, tools})) / 2, "UTF-8 byte count is not treated as the token count");
  const more = await estimateDeepSeekInputTokens([...prompt, {role: "tool", content: [{type: "text", text: "original evidence"}]}], tools);
  assert.ok(more.tokenized > estimate.tokenized, "Earlier tool evidence remains included");
});
