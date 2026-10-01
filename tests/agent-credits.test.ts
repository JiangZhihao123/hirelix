import assert from "node:assert/strict";
import test from "node:test";
import { costToCreditUnits, deepSeekPeak, deepSeekRates, llmServiceCost, embeddingServiceCost } from "../src/lib/agent-credit-pricing";
import { CREDIT_UNITS } from "../src/lib/agent-plan";

test("credits follow service cost times markup; no flat per-task or per-token rate", () => {
  assert.equal(costToCreditUnits(0.01,3)/CREDIT_UNITS,3);
  assert.equal(costToCreditUnits(0.01,5)/CREDIT_UNITS,5);
  assert.equal(costToCreditUnits(0,3),0);
  assert.throws(() => costToCreditUnits(-1));
  const date = new Date("2026-10-01T02:00:00Z");
  const regular = llmServiceCost("deepseek-flash",date,{ inputTokens:1000000,outputTokens:1000000,cachedInputTokens:0 });
  const cached = llmServiceCost("deepseek-flash",date,{ inputTokens:1000000,outputTokens:1000000,cachedInputTokens:1000000 });
  assert.equal(regular,0.75);
  assert.equal(cached,0.603);
  assert(llmServiceCost("deepseek-v4-pro",date,{ inputTokens:1000000,outputTokens:1000000,cachedInputTokens:0 }) > regular);
  assert.throws(() => llmServiceCost("unknown-model",date,{ inputTokens:1,outputTokens:1,cachedInputTokens:0 }));
  assert.throws(() => llmServiceCost("deepseek-flash",date,{ inputTokens:0,outputTokens:0,cachedInputTokens:0 }));
});
test("provider tariffs honor UTC boundaries, weekends, and Chinese holidays", () => {
  assert.equal(deepSeekPeak(new Date("2026-10-08T01:00:00Z")),true);
  assert.equal(deepSeekPeak(new Date("2026-10-08T04:00:00Z")),false);
  assert.equal(deepSeekPeak(new Date("2026-10-08T06:00:00Z")),true);
  assert.equal(deepSeekPeak(new Date("2026-10-08T10:00:00Z")),false);
  assert.equal(deepSeekPeak(new Date("2026-10-10T02:00:00Z")),false);
  assert.equal(deepSeekPeak(new Date("2026-10-01T02:00:00Z")),false);
  assert.equal(deepSeekRates("deepseek-flash",new Date("2026-10-01T02:00:00Z"),true).output,1.2);
  assert.throws(() => deepSeekPeak(new Date("2027-01-04T02:00:00Z")),/calendar/);
});
test("CNY services use the explicit funding FX rate and reject missing usage", () => {
  const original = process.env.AGENT_CREDIT_CNY_PER_USD;
  try {
    process.env.AGENT_CREDIT_CNY_PER_USD="7";
    assert.equal(embeddingServiceCost("Qwen/Qwen3-Embedding-8B",1000000),0.04);
    assert.throws(() => embeddingServiceCost("Qwen/Qwen3-Embedding-8B",0));
    assert.throws(() => embeddingServiceCost("unknown",1));
  } finally {
    if (original === undefined) delete process.env.AGENT_CREDIT_CNY_PER_USD;
    else process.env.AGENT_CREDIT_CNY_PER_USD=original;
  }
});
