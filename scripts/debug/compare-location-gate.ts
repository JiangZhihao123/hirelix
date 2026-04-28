/**
 * 对比脚本：规则引擎 vs LLM 地域筛选
 * 对同一批 200 个 Bright Data profile 同时跑两种方法，展示差异。
 *
 * Usage: npx tsx scripts/compare-location-gate.ts
 */
import * as fs from "node:fs";
const _envContent = fs.readFileSync(".env", "utf8");
_envContent.split("\n").forEach((line: string) => {
  const match = line.match(/^([^=:#]+)=(.*)/);
  if (match) { const k = match[1].trim(), v = match[2].trim(); if (!process.env[k]) process.env[k] = v; }
});

// 全局代理（让 ai-sdk / undici 的所有请求都走本地 proxy）
import { ProxyAgent, setGlobalDispatcher } from "undici";
const _proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
if (_proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(_proxyUrl));
}

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// ── 复制必要的类型和函数（不依赖完整 search-jobs 避免循环） ──

type LocationGateResult = {
  decision: "pass" | "review" | "block";
  location_fit: "local" | "nearby" | "non_local" | "unknown";
  reason: string;
  is_hard_block: boolean;
};

type LocationPolicy = {
  mode: "strict" | "moderate" | "flexible";
  strict_terms: string[];
  nearby_terms: string[];
  work_model: string;
  allows_relocation: boolean;
  requires_local_presence: boolean;
};

// Artisan Staff Backend job policy (NYC, onsite/hybrid, strict)
const POLICY: LocationPolicy = {
  mode: "strict",
  strict_terms: ["new york", "nyc", "new york city", "manhattan", "brooklyn", "queens", "bronx", "new york metropolitan area"],
  nearby_terms: ["new jersey", "connecticut", "tri-state", "hoboken", "jersey city"],
  work_model: "hybrid",
  allows_relocation: false,
  requires_local_presence: true,
};

// ── 规则引擎（原始逻辑）──

function normalizeText(t: string) { return t.toLowerCase().replace(/[^a-z0-9\s,/]/g, " ").replace(/\s+/g, " ").trim(); }

function ruleGate(city: string | null, country_code: string | null): LocationGateResult {
  if (!city || city.length <= 3) {
    return { decision: "review", location_fit: "unknown", reason: "No location info", is_hard_block: false };
  }
  const norm = normalizeText(city);
  const parts = norm.split(/[,/]/).map(p => p.trim()).filter(Boolean);
  const terms = [norm, ...parts];

  const isLocal = POLICY.strict_terms.some(t => terms.some(term => term.includes(t) || t.includes(term)));
  if (isLocal) return { decision: "pass", location_fit: "local", reason: "Matches strict terms", is_hard_block: false };

  const isNearby = POLICY.nearby_terms.some(t => terms.some(term => term.includes(t) || t.includes(term)));
  if (isNearby) return { decision: "review", location_fit: "nearby", reason: "Nearby metro", is_hard_block: false };

  return { decision: "block", location_fit: "non_local", reason: `Not in NYC area: "${city}"`, is_hard_block: true };
}

// ── LLM 地域筛选 ──

function extractJSON(text: string): string {
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];
  return text.trim();
}

function createAI() {
  const baseURL = process.env.DEEPSEEK_BASE_URL!;
  const apiKey = process.env.DEEPSEEK_API_KEY!;
  const client = createOpenAI({ baseURL, apiKey, compatibility: "compatible" });
  return (model: string) => client.chat(model);
}

async function llmGateBatch(
  aiClient: (model: string) => ReturnType<ReturnType<typeof createOpenAI>["chat"]>,
  model: string,
  profiles: Array<{ city: string | null; country_code: string | null; headline: string | null; company_location: string | null }>,
): Promise<LocationGateResult[]> {
  if (profiles.length === 0) return [];

  const candidateLines = profiles.map((p, i) => {
    const parts = [
      `city: ${p.city || "unknown"}`,
      `country: ${p.country_code || "unknown"}`,
      p.company_location ? `company_location: ${p.company_location}` : null,
      p.headline ? `headline: ${p.headline.slice(0, 100)}` : null,
    ].filter(Boolean).join(" | ");
    return `[${i + 1}] ${parts}`;
  }).join("\n");

  const prompt = `You are a location eligibility screener for a job opening.

Job location requirement: New York City / NYC / Manhattan / Brooklyn
Work model: hybrid (partial in-person required)
Location strictness: strict

For each candidate, decide if they qualify locationally. Return a JSON array with exactly ${profiles.length} objects in order:
[{"decision":"pass"|"review"|"block","location_fit":"local"|"nearby"|"non_local"|"unknown","reason":"<10 words max>"},...]

Rules:
- "pass" (local): clearly in NYC metro — includes "Greater New York City Area", "NY", "NYC", "New York, United States", "Manhattan", "Brooklyn", "Queens", "Bronx", "Tri-State Area", "New Jersey" (commutable), "Hoboken", "Jersey City", "Long Island"
- "review" (nearby/unclear): says "Remote", ambiguous, or could be NYC but unclear
- "block" (non_local): clearly NOT in NYC — e.g. San Francisco, Los Angeles, Austin, Seattle, London, Toronto, etc.
- If no location info at all → "review" / "unknown"

Candidates:
${candidateLines}

Return only the JSON array, no explanation.`;

  const { text } = await generateText({
    model: aiClient(model),
    prompt,
    maxOutputTokens: 70 * profiles.length + 50,
  });

  const parsed: Array<{ decision: string; location_fit: string; reason: string }> = JSON.parse(extractJSON(text));
  return parsed.map(item => {
    const decision = (["pass", "review", "block"].includes(item.decision) ? item.decision : "review") as LocationGateResult["decision"];
    const location_fit = (["local", "nearby", "non_local", "unknown"].includes(item.location_fit) ? item.location_fit : "unknown") as LocationGateResult["location_fit"];
    return {
      decision,
      location_fit,
      reason: item.reason || "LLM",
      is_hard_block: decision === "block",
    };
  });
}

// ── Fetch profiles from Bright Data snapshot ──

async function downloadSnapshot(snapshotId: string): Promise<Array<{
  name: string;
  city: string | null;
  country_code: string | null;
  headline: string | null;
  about: string | null;
  current_company: { location: string | null } | null;
}>> {
  const apiToken = process.env.BRIGHTDATA_API_TOKEN!;
  const url = `https://api.brightdata.com/datasets/snapshots/${snapshotId}/download?format=json`;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiToken}` };

  const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
  let dispatcher: unknown;
  if (proxyUrl) {
    const { ProxyAgent } = await import("undici");
    dispatcher = new ProxyAgent(proxyUrl);
  }

  const res = await fetch(url, { headers, ...(dispatcher ? { dispatcher } : {}) } as RequestInit);
  if (!res.ok) throw new Error(`Bright Data download failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as unknown[];
  return data as any[];
}

// ── Main ──

async function main() {
  const SNAPSHOT_ID = "snap_mmze7kb8kay4yywfg";
  console.log(`\n下载 snapshot ${SNAPSHOT_ID}...`);

  let profiles: Array<{
    name: string;
    city: string | null;
    country_code: string | null;
    headline: string | null;
    about: string | null;
    current_company: { location: string | null } | null;
  }>;

  try {
    profiles = await downloadSnapshot(SNAPSHOT_ID) as typeof profiles;
  } catch (e) {
    console.error("下载失败:", e);
    process.exit(1);
  }

  if (!profiles.length) {
    console.error("snapshot 返回了空数据");
    process.exit(1);
  }

  console.log(`\n共 ${profiles.length} 个 profiles，开始对比...\n`);

  // 规则引擎（同步，瞬间完成）
  const ruleResults = profiles.map(p => ruleGate(p.city, p.country_code));

  // LLM 筛选（批量，15 个一批）
  const BATCH_SIZE = 15;
  const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const aiClient = createAI();
  const llmResults: LocationGateResult[] = [];

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE).map(p => ({
      city: p.city,
      country_code: p.country_code,
      headline: p.headline,
      company_location: p.current_company?.location ?? null,
    }));
    process.stdout.write(`  LLM batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(profiles.length / BATCH_SIZE)}...`);
    const results = await llmGateBatch(aiClient, MODEL, batch);
    llmResults.push(...results);
    console.log(" done");
  }

  // ── 对比输出 ──

  console.log("\n" + "=".repeat(80));
  console.log("地域筛选对比：规则引擎 vs LLM");
  console.log("=".repeat(80));

  let agree = 0, ruleHardBlock = 0, llmHardBlock = 0;
  const disagreements: Array<{
    i: number; name: string; city: string | null;
    rule: LocationGateResult; llm: LocationGateResult;
  }> = [];

  for (let i = 0; i < profiles.length; i++) {
    const rule = ruleResults[i]!;
    const llm = llmResults[i]!;
    if (rule.decision === llm.decision) {
      agree++;
    } else {
      disagreements.push({ i, name: profiles[i]!.name, city: profiles[i]!.city, rule, llm });
    }
    if (rule.is_hard_block) ruleHardBlock++;
    if (llm.is_hard_block) llmHardBlock++;
  }

  // 汇总
  const rulePass = ruleResults.filter(r => r.decision === "pass").length;
  const ruleReview = ruleResults.filter(r => r.decision === "review").length;
  const ruleBlock = ruleResults.filter(r => r.decision === "block").length;
  const llmPass = llmResults.filter(r => r.decision === "pass").length;
  const llmReview = llmResults.filter(r => r.decision === "review").length;
  const llmBlock = llmResults.filter(r => r.decision === "block").length;

  console.log("\n📊 汇总（共 " + profiles.length + " 人）:");
  console.log(`${"".padEnd(20)} ${"规则引擎".padEnd(15)} ${"LLM"}`);
  console.log(`${"pass (通过)".padEnd(20)} ${String(rulePass).padEnd(15)} ${llmPass}`);
  console.log(`${"review (待审)".padEnd(20)} ${String(ruleReview).padEnd(15)} ${llmReview}`);
  console.log(`${"block (拦截)".padEnd(20)} ${String(ruleBlock).padEnd(15)} ${llmBlock}`);
  console.log(`${"hard_block".padEnd(20)} ${String(ruleHardBlock).padEnd(15)} ${llmHardBlock}`);
  console.log(`\n一致率: ${agree}/${profiles.length} (${(agree / profiles.length * 100).toFixed(1)}%)`);

  // 关键差异：规则 block 但 LLM pass 的（可能是被规则误杀的）
  const ruleBlockLlmPass = disagreements.filter(d => d.rule.is_hard_block && d.llm.decision === "pass");
  const ruleBlockLlmReview = disagreements.filter(d => d.rule.is_hard_block && d.llm.decision === "review");
  const llmBlockRulePass = disagreements.filter(d => d.llm.is_hard_block && d.rule.decision === "pass");

  if (ruleBlockLlmPass.length > 0) {
    console.log(`\n🔴→🟢 规则 hard_block 但 LLM 认为 pass（被规则误杀，共 ${ruleBlockLlmPass.length} 人）:`);
    for (const d of ruleBlockLlmPass) {
      console.log(`  [${d.i + 1}] ${d.name} | city: "${d.city}" | LLM: ${d.llm.reason}`);
    }
  }

  if (ruleBlockLlmReview.length > 0) {
    console.log(`\n🔴→🟡 规则 hard_block 但 LLM 认为 review（共 ${ruleBlockLlmReview.length} 人）:`);
    for (const d of ruleBlockLlmReview) {
      console.log(`  [${d.i + 1}] ${d.name} | city: "${d.city}" | LLM: ${d.llm.reason}`);
    }
  }

  if (llmBlockRulePass.length > 0) {
    console.log(`\n🟢→🔴 规则 pass 但 LLM 认为 block（共 ${llmBlockRulePass.length} 人）:`);
    for (const d of llmBlockRulePass) {
      console.log(`  [${d.i + 1}] ${d.name} | city: "${d.city}" | LLM: ${d.llm.reason}`);
    }
  }

  // 其他分歧
  const otherDiff = disagreements.filter(d =>
    !ruleBlockLlmPass.includes(d) && !ruleBlockLlmReview.includes(d) && !llmBlockRulePass.includes(d),
  );
  if (otherDiff.length > 0) {
    console.log(`\n⚪ 其他分歧（共 ${otherDiff.length} 人）:`);
    for (const d of otherDiff) {
      console.log(`  [${d.i + 1}] ${d.name} | city: "${d.city}"`);
      console.log(`      规则: ${d.rule.decision} (${d.rule.reason})`);
      console.log(`      LLM:  ${d.llm.decision} (${d.llm.reason})`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("结论：如果「规则误杀 + 规则→review」人数较多，说明 LLM gate 能显著提升召回率");
  console.log("=".repeat(80) + "\n");
}

main().catch(console.error);
