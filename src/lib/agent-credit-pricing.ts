import { CREDIT_RETAIL_USD, CREDIT_UNITS } from "./agent-plan";

// Reviewed 2026-10-01 against provider pricing. These are our direct costs;
// the subscription price buys the workspace, not a token resale contract.
// https://api-docs.deepseek.com/quick_start/pricing/
// https://siliconflow.cn/pricing (Qwen3-Embedding-8B: CNY 0.28 / 1M)
export const CREDIT_PRICING_VERSION = "2026-10-01";
export function creditMarkup() {
  const value = Number(process.env.AGENT_CREDIT_COST_MULTIPLIER ?? 3);
  if (!Number.isFinite(value) || value < 1 || value > 100) throw new Error("Invalid AI credit cost multiplier");
  return value;
}
export function costToCreditUnits(costUsd: number, multiplier = creditMarkup()) {
  if (!Number.isFinite(costUsd) || costUsd < 0 || !Number.isFinite(multiplier) || multiplier < 1)
    throw new Error("Invalid AI service cost");
  return Math.max(0,Math.ceil(costUsd * multiplier / CREDIT_RETAIL_USD * CREDIT_UNITS - 1e-9));
}

// Annual official holiday calendar; unknown years require an explicit update
// rather than silently charging the wrong time-of-day tariff.
const holidays2026 = [["01-01","01-03"],["02-15","02-23"],["04-04","04-06"],["05-01","05-05"],["06-19","06-21"],["09-25","09-27"],["10-01","10-07"]];
export function deepSeekPeak(date: Date) {
  const weekday = date.getUTCDay(), hour = date.getUTCHours();
  if (weekday === 0 || weekday === 6 || !((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10))) return false;
  const chinaDay = new Date(date.getTime()+8*3600000).toISOString().slice(0,10);
  if (!chinaDay.startsWith("2026-")) throw new Error("Update the DeepSeek holiday pricing calendar");
  return !holidays2026.some(([start,end]) => chinaDay.slice(5) >= start && chinaDay.slice(5) <= end);
}
export function deepSeekRates(model: string, date: Date, peakOverride?: boolean) {
  const rates = ["deepseek-flash","deepseek-v4-flash"].includes(model)
    ? { input: 0.3, cached: 0.006, output: 1.2 }
    : model === "deepseek-v4-pro" ? { input: 1.32, cached: 0.044, output: 3.96 } : null;
  if (!rates) throw new Error("AI model has no verified cost price");
  const factor = (peakOverride ?? deepSeekPeak(date)) ? 1 : 0.5;
  return { input: rates.input*factor, cached: rates.cached*factor, output: rates.output*factor };
}
export function llmServiceCost(model: string, date: Date, usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number }) {
  for (const value of Object.values(usage)) if (!Number.isSafeInteger(value) || value < 0) throw new Error("AI provider usage is missing or invalid");
  if (!usage.inputTokens && !usage.outputTokens) throw new Error("AI provider returned no usage");
  const rates = deepSeekRates(model, date);
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens);
  return ((usage.inputTokens-cached)*rates.input+cached*rates.cached+usage.outputTokens*rates.output)/1_000_000;
}
export function embeddingServiceCost(model: string, inputTokens: number) {
  if (model !== "Qwen/Qwen3-Embedding-8B") throw new Error("Embedding model has no verified cost price");
  if (!Number.isSafeInteger(inputTokens) || inputTokens <= 0) throw new Error("Embedding provider returned no usage");
  // An explicit settlement FX rate, adjustable to the actual funding rate;
  // native CNY price and rate are preserved in the per-job cost snapshot.
  const cnyPerUsd = Number(process.env.AGENT_CREDIT_CNY_PER_USD ?? 7);
  if (!Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) throw new Error("Invalid AI credit FX rate");
  return inputTokens * 0.28 / 1_000_000 / cnyPerUsd;
}
