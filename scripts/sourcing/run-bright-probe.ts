import fs from "node:fs";
import path from "node:path";

import {
  filterDatasetProfiles,
  pollSnapshot,
  triggerScrape,
  type BrightDataFilterRule,
} from "@/lib/brightdata";

import { loadLocalEnv } from "./env";
import { readEnv } from "./env";

type CliOptions = {
  brightPlanJsonPath: string;
  readinessJsonPath: string;
  providerReadinessJsonPath: string | null;
  outDir: string;
  outMdPath: string | null;
  outJsonPath: string | null;
  mode: "dry-run" | "live";
  allowPaid: boolean;
  maxBudgetUsd: number;
  includeDatasetFilter: boolean;
  includeUrlCompletion: boolean;
};

type BrightPlan = {
  totals?: {
    estimated_total_cost_usd?: number;
  };
  jd_plans?: Array<{
    jd_id: string;
    jd_title: string;
    selected_candidates?: Array<{
      candidate_id: string;
      name: string;
      linkedin_urls?: string[];
    }>;
    bright_dataset_filter_probe?: {
      enabled?: boolean;
      records_limit?: number;
      estimated_cost_usd?: number;
      lane_id?: string | null;
      query?: string | null;
      filter?: unknown;
    };
  }>;
};

type Readiness = {
  gates?: {
    bright_probe_allowed?: boolean;
    block_reasons?: string[];
  };
  bright_gate?: {
    approved_candidates?: Array<{
      jd_id: string;
      candidate_id: string;
      name?: string;
      linkedin_urls?: string[];
      in_bright_plan?: boolean;
    }>;
    approved_profile_completion_estimated_cost_usd?: number;
  };
};

type ProviderReadinessReport = {
  summary?: {
    required_failures?: number;
    bright_network_checked?: boolean;
  };
  readiness?: Array<{
    provider: string;
    usable: boolean;
    required: boolean;
    status: string;
    message: string;
  }>;
};

type ProbeReport = {
  generated_at: string;
  mode: "dry-run" | "live";
  status: "blocked" | "planned" | "completed" | "error";
  guardrails: {
    readiness_allowed: boolean;
    provider_readiness_checked: boolean;
    provider_readiness_ok: boolean;
    bright_network_checked: boolean;
    allow_paid: boolean;
    max_budget_usd: number;
    estimated_total_cost_usd: number;
    within_budget: boolean;
    include_url_completion: boolean;
    include_dataset_filter: boolean;
  };
  block_reasons: string[];
  planned: {
    url_completion_count: number;
    dataset_filter_count: number;
    linkedin_urls: string[];
    dataset_filters: Array<{
      jd_id: string;
      jd_title: string;
      lane_id: string | null;
      records_limit: number;
      estimated_cost_usd: number;
      query: string | null;
      filter: unknown;
    }>;
  };
  live_result?: {
    url_completion_snapshot_id?: string | null;
    dataset_filter_results?: Array<{
      jd_id: string;
      snapshot_id: string;
      returned_profiles: number;
    }>;
  };
  error?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    brightPlanJsonPath: "docs/architecture/jd-sourcing-bright-probe-plan.json",
    readinessJsonPath: "docs/architecture/jd-sourcing-human-review-readiness.json",
    providerReadinessJsonPath: "docs/architecture/jd-sourcing-provider-readiness.json",
    outDir: "runs/sourcing-bright-probe",
    outMdPath: null,
    outJsonPath: null,
    mode: "dry-run",
    allowPaid: false,
    maxBudgetUsd: 1,
    includeDatasetFilter: true,
    includeUrlCompletion: true,
  };

  for (const arg of argv) {
    if (arg === "--live") {
      options.mode = "live";
      continue;
    }
    if (arg === "--dry-run") {
      options.mode = "dry-run";
      continue;
    }
    if (arg === "--allow-paid") {
      options.allowPaid = true;
      continue;
    }
    if (arg.startsWith("--bright-plan-json=")) {
      options.brightPlanJsonPath = arg.slice("--bright-plan-json=".length);
      continue;
    }
    if (arg.startsWith("--readiness-json=")) {
      options.readinessJsonPath = arg.slice("--readiness-json=".length);
      continue;
    }
    if (arg.startsWith("--provider-readiness-json=")) {
      options.providerReadinessJsonPath = arg.slice("--provider-readiness-json=".length);
      continue;
    }
    if (arg === "--no-provider-readiness") {
      options.providerReadinessJsonPath = null;
      continue;
    }
    if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length);
      continue;
    }
    if (arg.startsWith("--out-md=")) {
      options.outMdPath = arg.slice("--out-md=".length);
      continue;
    }
    if (arg.startsWith("--out-json=")) {
      options.outJsonPath = arg.slice("--out-json=".length);
      continue;
    }
    if (arg.startsWith("--max-budget-usd=")) {
      options.maxBudgetUsd = positiveNumber(arg.split("=")[1], options.maxBudgetUsd);
      continue;
    }
    if (arg === "--skip-dataset-filter") {
      options.includeDatasetFilter = false;
      continue;
    }
    if (arg === "--skip-url-completion") {
      options.includeUrlCompletion = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  loadLocalEnv(path.resolve(process.cwd()));
  const options = parseArgs(process.argv.slice(2));
  const plan = readJson<BrightPlan>(path.resolve(options.brightPlanJsonPath));
  const readiness = readJson<Readiness>(path.resolve(options.readinessJsonPath));
  const providerReadiness = options.providerReadinessJsonPath && fs.existsSync(path.resolve(options.providerReadinessJsonPath))
    ? readJson<ProviderReadinessReport>(path.resolve(options.providerReadinessJsonPath))
    : null;
  const report = await buildAndMaybeRunProbe(plan, readiness, providerReadiness, options);
  const runDir = createRunDir(options.outDir);
  const jsonPath = path.resolve(options.outJsonPath || path.join(runDir, "bright-probe-report.json"));
  const mdPath = path.resolve(options.outMdPath || path.join(runDir, "bright-probe-report.md"));
  writeJson(jsonPath, report);
  writeText(mdPath, renderMarkdown(report));
  console.log(`Bright probe ${report.status}: ${runDir}`);
  console.log(`Report: ${mdPath}`);
  if (report.block_reasons.length > 0) {
    console.log(`Block reasons: ${report.block_reasons.join("; ")}`);
  }
}

async function buildAndMaybeRunProbe(
  plan: BrightPlan,
  readiness: Readiness,
  providerReadiness: ProviderReadinessReport | null,
  options: CliOptions,
): Promise<ProbeReport> {
  const planned = buildPlannedProbe(plan, readiness, options);
  const estimatedTotal = estimateTotalCost(planned);
  const blockReasons = buildBlockReasons({ readiness, providerReadiness, options, estimatedTotal, planned });
  const providerStatus = providerReadinessStatus(providerReadiness);
  const base: ProbeReport = {
    generated_at: new Date().toISOString(),
    mode: options.mode,
    status: blockReasons.length > 0 ? "blocked" : "planned",
    guardrails: {
      readiness_allowed: Boolean(readiness.gates?.bright_probe_allowed),
      provider_readiness_checked: Boolean(providerReadiness),
      provider_readiness_ok: providerStatus.ok,
      bright_network_checked: Boolean(providerReadiness?.summary?.bright_network_checked),
      allow_paid: options.allowPaid,
      max_budget_usd: options.maxBudgetUsd,
      estimated_total_cost_usd: estimatedTotal,
      within_budget: estimatedTotal <= options.maxBudgetUsd,
      include_url_completion: options.includeUrlCompletion,
      include_dataset_filter: options.includeDatasetFilter,
    },
    block_reasons: blockReasons,
    planned,
  };

  if (blockReasons.length > 0 || options.mode === "dry-run") {
    return base;
  }

  try {
    const apiToken = readEnv("BRIGHTDATA_API_TOKEN");
    const datasetId = readEnv("BRIGHTDATA_DATASET_ID");
    if (!apiToken) throw new Error("BRIGHTDATA_API_TOKEN is missing");
    if (!datasetId) throw new Error("BRIGHTDATA_DATASET_ID is missing");

    const urlSnapshotId = options.includeUrlCompletion && planned.linkedin_urls.length > 0
      ? await triggerScrape(apiToken, datasetId, planned.linkedin_urls)
      : null;
    const datasetResults = [];
    if (options.includeDatasetFilter) {
      for (const item of planned.dataset_filters) {
        const result = await filterDatasetProfiles(
          apiToken,
          {
            datasetId,
            filter: item.filter as BrightDataFilterRule,
            recordsLimit: item.records_limit,
          },
          {
            timeoutMs: 90000,
            pollIntervalMs: 5000,
          },
        );
        datasetResults.push({
          jd_id: item.jd_id,
          snapshot_id: result.snapshotId,
          returned_profiles: result.profiles.length,
        });
      }
    }

    if (urlSnapshotId) {
      // Fetch once so a successful live run records at least a first result count.
      await pollSnapshot(apiToken, urlSnapshotId, 1, 1000).catch(() => []);
    }

    return {
      ...base,
      status: "completed",
      live_result: {
        url_completion_snapshot_id: urlSnapshotId,
        dataset_filter_results: datasetResults,
      },
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPlannedProbe(plan: BrightPlan, readiness: Readiness, options: CliOptions): ProbeReport["planned"] {
  const approvedKeys = new Set((readiness.bright_gate?.approved_candidates || []).map((candidate) =>
    `${candidate.jd_id}:${candidate.candidate_id}`
  ));
  const linkedinUrls: string[] = [];
  for (const jdPlan of plan.jd_plans || []) {
    for (const candidate of jdPlan.selected_candidates || []) {
      const key = `${jdPlan.jd_id}:${candidate.candidate_id}`;
      if (!approvedKeys.has(key)) continue;
      for (const url of candidate.linkedin_urls || []) {
        if (url && !linkedinUrls.includes(url)) linkedinUrls.push(url);
      }
    }
  }

  const datasetFilters = (plan.jd_plans || [])
    .map((jdPlan) => {
      const probe = jdPlan.bright_dataset_filter_probe;
      if (!probe?.enabled || !probe.filter) return null;
      return {
        jd_id: jdPlan.jd_id,
        jd_title: jdPlan.jd_title,
        lane_id: probe.lane_id || null,
        records_limit: Math.max(0, Math.round(probe.records_limit || 0)),
        estimated_cost_usd: roundMoney(probe.estimated_cost_usd),
        query: probe.query || null,
        filter: probe.filter,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    url_completion_count: options.includeUrlCompletion ? linkedinUrls.length : 0,
    dataset_filter_count: options.includeDatasetFilter ? datasetFilters.length : 0,
    linkedin_urls: options.includeUrlCompletion ? linkedinUrls : [],
    dataset_filters: options.includeDatasetFilter ? datasetFilters : [],
  };
}

function buildBlockReasons(params: {
  readiness: Readiness;
  providerReadiness: ProviderReadinessReport | null;
  options: CliOptions;
  estimatedTotal: number;
  planned: ProbeReport["planned"];
}) {
  const reasons = [...(params.readiness.gates?.block_reasons || [])];
  const providerStatus = providerReadinessStatus(params.providerReadiness);
  if (!params.readiness.gates?.bright_probe_allowed) {
    reasons.push("Human review readiness does not allow Bright probe");
  }
  if (!providerStatus.ok) {
    reasons.push(...providerStatus.reasons);
  }
  if (params.options.mode === "live" && !params.providerReadiness) {
    reasons.push("Live mode requires provider readiness report");
  }
  if (params.options.mode === "live" && !params.options.allowPaid) {
    reasons.push("Live mode requires --allow-paid");
  }
  if (params.estimatedTotal > params.options.maxBudgetUsd) {
    reasons.push(`Estimated cost $${params.estimatedTotal.toFixed(4)} exceeds cap $${params.options.maxBudgetUsd.toFixed(2)}`);
  }
  if (params.options.includeUrlCompletion && params.planned.url_completion_count === 0) {
    reasons.push("No approved LinkedIn URLs for Bright completion");
  }
  if (!params.options.includeUrlCompletion && !params.options.includeDatasetFilter) {
    reasons.push("Both URL completion and dataset filter probes are disabled");
  }
  return Array.from(new Set(reasons));
}

function providerReadinessStatus(report: ProviderReadinessReport | null) {
  if (!report) return { ok: true, reasons: [] as string[] };
  const reasons: string[] = [];
  const requiredFailures = report.summary?.required_failures || 0;
  if (requiredFailures > 0) {
    reasons.push(`Provider readiness has ${requiredFailures} required failure(s)`);
  }
  const bright = report.readiness?.find((item) => item.provider === "bright");
  if (bright && !bright.usable) {
    reasons.push(`Bright provider is not usable: ${bright.message}`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function estimateTotalCost(planned: ProbeReport["planned"]) {
  const urlCost = planned.url_completion_count * 0.0025;
  const filterCost = planned.dataset_filters.reduce((sum, item) => sum + item.estimated_cost_usd, 0);
  return roundMoney(urlCost + filterCost);
}

function renderMarkdown(report: ProbeReport) {
  const lines = [
    "# Bright Probe Guarded Run Report",
    "",
    "本报告来自 guarded Bright probe runner。除非 mode=live、readiness 通过、显式 --allow-paid 且预算未超限，否则不会调用 Bright。",
    "",
    "## Summary",
    "",
    `- Mode：${report.mode}`,
    `- Status：${report.status}`,
    `- Readiness allowed：${report.guardrails.readiness_allowed ? "yes" : "no"}`,
    `- Provider readiness checked：${report.guardrails.provider_readiness_checked ? "yes" : "no"}`,
    `- Provider readiness OK：${report.guardrails.provider_readiness_ok ? "yes" : "no"}`,
    `- Bright network checked：${report.guardrails.bright_network_checked ? "yes" : "no"}`,
    `- Allow paid：${report.guardrails.allow_paid ? "yes" : "no"}`,
    `- Estimated total cost：$${report.guardrails.estimated_total_cost_usd.toFixed(4)}`,
    `- Max budget：$${report.guardrails.max_budget_usd.toFixed(2)}`,
    `- Within budget：${report.guardrails.within_budget ? "yes" : "no"}`,
    `- URL completion count：${report.planned.url_completion_count}`,
    `- Dataset filter count：${report.planned.dataset_filter_count}`,
    "",
  ];

  if (report.block_reasons.length > 0) {
    lines.push("## Block Reasons", "", ...report.block_reasons.map((reason) => `- ${reason}`), "");
  }

  lines.push(
    "## Planned URL Completion",
    "",
    ...report.planned.linkedin_urls.map((url) => `- ${url}`),
    "",
    "## Planned Dataset Filters",
    "",
    "| JD | Lane | Records | Estimated cost |",
    "| --- | --- | ---: | ---: |",
  );
  for (const item of report.planned.dataset_filters) {
    lines.push(`| ${item.jd_id} ${escapePipe(item.jd_title)} | ${item.lane_id || "N/A"} | ${item.records_limit} | $${item.estimated_cost_usd.toFixed(4)} |`);
  }

  if (report.live_result) {
    lines.push(
      "",
      "## Live Result",
      "",
      `- URL completion snapshot：${report.live_result.url_completion_snapshot_id || "N/A"}`,
      `- Dataset filters：${report.live_result.dataset_filter_results?.length || 0}`,
    );
  }
  if (report.error) {
    lines.push("", "## Error", "", report.error, "");
  }
  return `${lines.join("\n")}\n`;
}

function createRunDir(baseDir: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.resolve(baseDir, `bright-probe-${stamp}`);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function roundMoney(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(parsed * 10000) / 10000;
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
