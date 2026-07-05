import { getBrightDataAccountBalance } from "@/lib/brightdata";

import { readEnv } from "./env";
import type { CandidateLead, ProviderName, ProviderReadiness } from "./types";

export async function checkProviderReadiness(options: {
  checkNetwork: boolean;
}): Promise<ProviderReadiness[]> {
  const results: ProviderReadiness[] = [];

  const deepSeekKey = readEnv("DEEPSEEK_API_KEY");
  results.push({
    provider: "deepseek",
    required: true,
    configured: Boolean(deepSeekKey),
    usable: Boolean(deepSeekKey),
    status: deepSeekKey ? "ready" : "missing",
    message: deepSeekKey ? "DEEPSEEK_API_KEY is configured" : "DEEPSEEK_API_KEY is missing",
  });

  const serperKey = readEnv("SERPER_API_KEY");
  results.push({
    provider: "serper",
    required: true,
    configured: Boolean(serperKey),
    usable: Boolean(serperKey),
    status: serperKey ? "ready" : "missing",
    message: serperKey ? "SERPER_API_KEY is configured" : "SERPER_API_KEY is missing",
  });

  const exaKey = readEnv("EXA_API_KEY");
  results.push({
    provider: "exa",
    required: false,
    configured: Boolean(exaKey),
    usable: Boolean(exaKey),
    status: exaKey ? "ready" : "warning",
    message: exaKey ? "EXA_API_KEY is configured" : "EXA_API_KEY is missing; semantic web discovery will be skipped",
  });

  const firecrawlKey = readEnv("FIRECRAWL_API_KEY");
  results.push({
    provider: "firecrawl",
    required: false,
    configured: Boolean(firecrawlKey),
    usable: Boolean(firecrawlKey),
    status: firecrawlKey ? "ready" : "warning",
    message: firecrawlKey ? "FIRECRAWL_API_KEY is configured" : "FIRECRAWL_API_KEY is missing; URL extraction will be skipped",
  });

  const githubToken = readEnv("GITHUB_TOKEN");
  results.push({
    provider: "github",
    required: false,
    configured: Boolean(githubToken),
    usable: Boolean(githubToken),
    status: githubToken ? "ready" : "warning",
    message: githubToken ? "GITHUB_TOKEN is configured" : "GITHUB_TOKEN is missing; GitHub evidence will be limited",
  });

  const brightToken = readEnv("BRIGHTDATA_API_TOKEN");
  const brightDatasetId = readEnv("BRIGHTDATA_DATASET_ID");
  if (!brightToken || !brightDatasetId) {
    results.push({
      provider: "bright",
      required: false,
      configured: Boolean(brightToken && brightDatasetId),
      usable: false,
      status: "warning",
      message: "Bright token or dataset id is missing; Bright probe will be skipped",
      details: {
        hasToken: Boolean(brightToken),
        hasDatasetId: Boolean(brightDatasetId),
      },
    });
  } else if (!options.checkNetwork) {
    results.push({
      provider: "bright",
      required: false,
      configured: true,
      usable: true,
      status: "ready",
      message: "Bright env is configured; balance not checked because --network was not passed",
      details: { balanceChecked: false },
    });
  } else {
    try {
      const balance = await getBrightDataAccountBalance(brightToken);
      results.push({
        provider: "bright",
        required: false,
        configured: true,
        usable: typeof balance === "number" ? balance > 0 : true,
        status: typeof balance === "number" && balance <= 5 ? "warning" : "ready",
        message: typeof balance === "number"
          ? `Bright balance is $${balance.toFixed(2)}`
          : "Bright balance endpoint succeeded but did not expose a numeric balance",
        details: {
          balance,
          brightBudgetRecommendedCapUsd: 5,
        },
      });
    } catch (error) {
      results.push({
        provider: "bright",
        required: false,
        configured: true,
        usable: false,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export type SerperSearchResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

export async function serperSearch(params: {
  query: string;
  num?: number;
  signal?: AbortSignal;
}) {
  const key = readEnv("SERPER_API_KEY");
  if (!key) throw new Error("SERPER_API_KEY is missing");

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({
      q: params.query,
      num: params.num ?? 10,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper search failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = await response.json() as {
    organic?: SerperSearchResult[];
  };
  return payload.organic ?? [];
}

export function mapSerperResultsToLeads(params: {
  laneId: string;
  results: SerperSearchResult[];
}): CandidateLead[] {
  return params.results
    .filter((result) => result.link)
    .map((result, index) => {
      const url = result.link!;
      return {
        lead_id: `serper:${params.laneId}:${index}:${stableId(url)}`,
        provider: "serper",
        lane_id: params.laneId,
        url,
        title: result.title ?? null,
        snippet: result.snippet ?? null,
        source_type: classifyUrl(url),
        source_confidence: url.includes("linkedin.com/in/") ? "high" : "medium",
        raw: { ...result },
      };
    });
}

export async function firecrawlExtractUrl(params: {
  url: string;
  formats?: string[];
  signal?: AbortSignal;
}) {
  const key = readEnv("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY is missing");

  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      url: params.url,
      formats: params.formats ?? ["markdown"],
      onlyMainContent: true,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firecrawl scrape failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return await response.json();
}

export async function exaSearch(params: {
  query: string;
  numResults?: number;
  signal?: AbortSignal;
}) {
  const key = readEnv("EXA_API_KEY");
  if (!key) throw new Error("EXA_API_KEY is missing");

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      query: params.query,
      numResults: params.numResults ?? 10,
      useAutoprompt: true,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exa search failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return await response.json();
}

function classifyUrl(url: string): CandidateLead["source_type"] {
  const lower = url.toLowerCase();
  if (lower.includes("linkedin.com/in/")) return "linkedin";
  if (lower.includes("github.com/")) return "github";
  if (lower.includes("/team") || lower.includes("/people") || lower.includes("/about")) return "company_page";
  if (lower.includes("medium.com") || lower.includes("substack.com") || lower.includes("/blog")) return "article";
  if (lower.includes("linkedin.com/company/")) return "company_page";
  return "other";
}

function stableId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function isProviderName(value: string): value is ProviderName {
  return ["deepseek", "serper", "exa", "firecrawl", "bright", "github"].includes(value);
}
