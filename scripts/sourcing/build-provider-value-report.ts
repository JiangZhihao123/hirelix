import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  benchmarkDir: string | null;
  calibrationCsvPath: string | null;
  outPath: string;
  jsonOutPath: string;
};

type BenchmarkSummary = {
  benchmark_id?: string;
  mode?: string;
  providers?: string[];
  run_count?: number;
  completed_count?: number;
  error_count?: number;
  totals?: {
    actual_cost_usd?: number;
    candidate_cards?: number;
    reviewable_candidates?: number;
    contact_worthy_candidates?: number;
  };
};

type ProviderRow = {
  provider: string;
  planned: number;
  success: number;
  error: number;
  blocked: number;
  returned: number;
  actual_cost_usd: number;
  avg_latency_ms: number;
  candidate_cards: number;
  reviewable_candidates: number;
  contact_worthy_candidates: number;
  rejected_candidates: number;
  reviewable_rate: number;
  contact_worthy_rate: number;
  cost_per_reviewable_usd: number | null;
  cost_per_contact_worthy_usd: number | null;
};

type ProviderLaneRow = ProviderRow & {
  jd_id: string;
  title: string;
  category: string;
  lane_id: string;
  failure_modes: string[];
};

type CalibrationSummary = {
  path: string;
  total_rows: number;
  reviewed_rows: number;
  review_mode: "assistant_strict" | "manual" | "mixed" | "unreviewed";
  confirmed_contact_worthy: number;
  research_more: number;
  rejected: number;
  reviewed_yes_rows: number;
  confirmed_yes_rows: number;
  yes_precision: number;
  snippet_only_research_more: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    benchmarkDir: null,
    calibrationCsvPath: "docs/architecture/jd-sourcing-calibration-assistant-strict.csv",
    outPath: "docs/architecture/jd-sourcing-provider-value-report.md",
    jsonOutPath: "docs/architecture/jd-sourcing-provider-value-report.json",
  };

  for (const arg of argv) {
    if (arg.startsWith("--benchmark-dir=")) {
      options.benchmarkDir = arg.slice("--benchmark-dir=".length);
      continue;
    }
    if (arg.startsWith("--calibration-csv=")) {
      options.calibrationCsvPath = arg.slice("--calibration-csv=".length);
      continue;
    }
    if (arg === "--no-calibration") {
      options.calibrationCsvPath = null;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("--json-out=")) {
      options.jsonOutPath = arg.slice("--json-out=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.benchmarkDir) {
    throw new Error(
      "Usage: npx tsx scripts/sourcing/build-provider-value-report.ts --benchmark-dir=<benchmark-dir>",
    );
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const benchmarkDir = path.resolve(options.benchmarkDir!);
  const summary = readJson<BenchmarkSummary>(path.join(benchmarkDir, "benchmark-summary.json"));
  const providerRows = parseProviderRows(fs.readFileSync(path.join(benchmarkDir, "provider-value-table.csv"), "utf8"));
  const laneRows = parseProviderLaneRows(fs.readFileSync(path.join(benchmarkDir, "provider-lane-value-table.csv"), "utf8"));
  const calibration = options.calibrationCsvPath
    ? summarizeCalibration(path.resolve(options.calibrationCsvPath))
    : null;
  const report = buildReport({ benchmarkDir, summary, providerRows, laneRows, calibration });
  writeJson(path.resolve(options.jsonOutPath), report);
  writeText(path.resolve(options.outPath), renderMarkdown(report));
  console.log(`Provider value report written: ${path.resolve(options.outPath)}`);
}

function buildReport(params: {
  benchmarkDir: string;
  summary: BenchmarkSummary;
  providerRows: ProviderRow[];
  laneRows: ProviderLaneRow[];
  calibration: CalibrationSummary | null;
}) {
  const providerRanking = [...params.providerRows]
    .filter((row) => row.candidate_cards > 0)
    .sort((a, b) => b.contact_worthy_candidates - a.contact_worthy_candidates);
  const topLanes = [...params.laneRows]
    .filter((row) => row.candidate_cards > 0)
    .sort((a, b) => {
      const contactDiff = b.contact_worthy_candidates - a.contact_worthy_candidates;
      if (contactDiff !== 0) return contactDiff;
      return a.actual_cost_usd - b.actual_cost_usd;
    })
    .slice(0, 12);
  const zeroYieldPaidLanes = [...params.laneRows]
    .filter((row) => row.actual_cost_usd > 0 && row.candidate_cards > 0 && row.contact_worthy_candidates === 0)
    .sort((a, b) => b.actual_cost_usd - a.actual_cost_usd)
    .slice(0, 12);
  const notes = buildNotes(params.providerRows, params.laneRows, params.calibration);

  return {
    generated_at: new Date().toISOString(),
    benchmark: {
      benchmark_id: params.summary.benchmark_id || "unknown",
      dir: params.benchmarkDir,
      mode: params.summary.mode || "unknown",
      providers: params.summary.providers || [],
      run_count: numeric(params.summary.run_count),
      completed_count: numeric(params.summary.completed_count),
      error_count: numeric(params.summary.error_count),
      totals: {
        actual_cost_usd: money(params.summary.totals?.actual_cost_usd),
        candidate_cards: numeric(params.summary.totals?.candidate_cards),
        reviewable_candidates: numeric(params.summary.totals?.reviewable_candidates),
        contact_worthy_candidates: numeric(params.summary.totals?.contact_worthy_candidates),
      },
    },
    calibration: params.calibration,
    provider_rows: params.providerRows,
    top_provider_ranking: providerRanking,
    top_lanes: topLanes,
    zero_yield_paid_lanes: zeroYieldPaidLanes,
    conclusions: notes,
  };
}

function buildNotes(providerRows: ProviderRow[], laneRows: ProviderLaneRow[], calibration: CalibrationSummary | null) {
  const notes: string[] = [];
  const totalContact = sum(providerRows.map((row) => row.contact_worthy_candidates));
  const serper = providerRows.find((row) => row.provider === "serper");
  const exa = providerRows.find((row) => row.provider === "exa");
  const firecrawl = providerRows.find((row) => row.provider === "firecrawl");
  const github = providerRows.find((row) => row.provider === "github");

  if (serper && totalContact > 0) {
    notes.push(
      `Serper produced ${serper.contact_worthy_candidates}/${totalContact} raw LLM contact-worthy candidates (${pct(serper.contact_worthy_candidates / totalContact)} share), so current discovery is highly Google/X-ray dependent.`,
    );
  }
  if (calibration && calibration.review_mode === "assistant_strict") {
    notes.push(
      `assistant_strict yes precision is ${pct(calibration.yes_precision)}; provider raw yield must not be treated as true outreach yield before manual/headhunter review.`,
    );
  }
  if (exa && exa.candidate_cards > 0 && exa.contact_worthy_rate < 0.08) {
    notes.push(
      `Exa returned ${exa.candidate_cards} candidate cards but only ${exa.contact_worthy_candidates} raw contact-worthy (${pct(exa.contact_worthy_rate)}), so it is currently a supplementary discovery source, not the main lane.`,
    );
  }
  if (firecrawl) {
    notes.push(
      `Firecrawl spent $${firecrawl.actual_cost_usd.toFixed(4)} as extraction/evidence layer; candidate attribution is ${firecrawl.candidate_cards}, so its value should be measured by whether it upgrades research_more rows, not by standalone contact-worthy count.`,
    );
  }
  if (github && github.error > 0) {
    notes.push(
      `GitHub had ${github.error} provider errors and no direct candidate attribution; keep it as technical evidence enrichment, not initial candidate delivery.`,
    );
  }
  const strongLanes = laneRows.filter((row) => row.contact_worthy_candidates >= 3);
  if (strongLanes.length > 0) {
    notes.push(
      `Top raw-yield lanes are mostly high-intent title/location X-ray lanes; broad semantic lanes should be capped until manual calibration proves incremental value.`,
    );
  }
  return notes;
}

function renderMarkdown(report: ReturnType<typeof buildReport>) {
  const lines = [
    "# JD Sourcing Provider Value Report",
    "",
    "本报告把 10 JD live benchmark 的 provider/lane 贡献整理成可执行结论。注意：contact-worthy 仍是 LLM light screen 口径，除非校准完成，否则不能当作真实猎头确认。",
    "",
    "## Benchmark",
    "",
    `- Benchmark：\`${report.benchmark.benchmark_id}\``,
    `- 目录：\`${report.benchmark.dir}\``,
    `- 模式：\`${report.benchmark.mode}\``,
    `- Providers：\`${report.benchmark.providers.join(",")}\``,
    `- JD：${report.benchmark.completed_count}/${report.benchmark.run_count} completed，errors ${report.benchmark.error_count}`,
    `- Actual cost：$${report.benchmark.totals.actual_cost_usd.toFixed(4)}`,
    `- Candidate cards：${report.benchmark.totals.candidate_cards}`,
    `- Raw LLM contact-worthy：${report.benchmark.totals.contact_worthy_candidates}`,
    "",
    "## Provider Summary",
    "",
    "| Provider | Returned | Cards | Reviewable | Raw contact-worthy | Raw contact rate | Cost | Cost/raw contact |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of report.provider_rows) {
    lines.push(
      `| ${row.provider} | ${row.returned} | ${row.candidate_cards} | ${row.reviewable_candidates} | ${row.contact_worthy_candidates} | ${pct(row.contact_worthy_rate)} | $${row.actual_cost_usd.toFixed(4)} | ${row.cost_per_contact_worthy_usd == null ? "N/A" : `$${row.cost_per_contact_worthy_usd.toFixed(4)}`} |`,
    );
  }

  lines.push(
    "",
    "## Conclusions",
    "",
    ...report.conclusions.map((note) => `- ${note}`),
    "",
  );

  if (report.calibration) {
    lines.push(
      "## Calibration Overlay",
      "",
      `- 校准文件：\`${report.calibration.path}\``,
      `- 校准方式：${report.calibration.review_mode}`,
      `- 已审样本：${report.calibration.reviewed_rows}/${report.calibration.total_rows}`,
      `- contact_worthy：${report.calibration.confirmed_contact_worthy}`,
      `- research_more：${report.calibration.research_more}`,
      `- reject：${report.calibration.rejected}`,
      `- LLM yes precision：${pct(report.calibration.yes_precision)}`,
      `- snippet-only research_more：${report.calibration.snippet_only_research_more}`,
      "",
    );
  }

  lines.push(
    "## Top Raw-Yield Lanes",
    "",
    "| JD | Provider | Lane | Cards | Reviewable | Raw contact-worthy | Cost | Cost/raw contact |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const row of report.top_lanes) {
    lines.push(
      `| ${row.jd_id} ${escapePipe(row.title)} | ${row.provider} | ${row.lane_id} | ${row.candidate_cards} | ${row.reviewable_candidates} | ${row.contact_worthy_candidates} | $${row.actual_cost_usd.toFixed(4)} | ${row.cost_per_contact_worthy_usd == null ? "N/A" : `$${row.cost_per_contact_worthy_usd.toFixed(4)}`} |`,
    );
  }

  lines.push(
    "",
    "## Paid Lanes With Zero Raw Contact",
    "",
    "| JD | Provider | Lane | Cards | Cost | Failure modes |",
    "| --- | --- | --- | ---: | ---: | --- |",
  );
  for (const row of report.zero_yield_paid_lanes) {
    lines.push(
      `| ${row.jd_id} ${escapePipe(row.title)} | ${row.provider} | ${row.lane_id} | ${row.candidate_cards} | $${row.actual_cost_usd.toFixed(4)} | ${escapePipe(row.failure_modes.join("; ")) || ""} |`,
    );
  }

  lines.push(
    "",
    "## Product Implication",
    "",
    "- 下一步不应该扩更多 broad provider，而是先做人审校准和 profile 补全对照。",
    "- Serper/X-ray 可以继续作为冷启动发现层，但必须用补全和严格 rerank 过滤 snippet-only 误判。",
    "- Exa、GitHub、Firecrawl 暂时放在补充发现和证据层，不应承诺为主召回来源。",
    "- Bright 的真实测试应按 `jd-sourcing-bright-probe-plan.md` 做 URL/Profile completion，而不是放大 Dataset Filter 召回。",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function parseProviderRows(csv: string): ProviderRow[] {
  return parseCsv(csv).map((row) => ({
    provider: row.provider || "",
    planned: integer(row.planned),
    success: integer(row.success),
    error: integer(row.error),
    blocked: integer(row.blocked),
    returned: integer(row.returned),
    actual_cost_usd: money(row.actual_cost_usd),
    avg_latency_ms: integer(row.avg_latency_ms),
    candidate_cards: integer(row.candidate_cards),
    reviewable_candidates: integer(row.reviewable_candidates),
    contact_worthy_candidates: integer(row.contact_worthy_candidates),
    rejected_candidates: integer(row.rejected_candidates),
    reviewable_rate: percent(row.reviewable_rate),
    contact_worthy_rate: percent(row.contact_worthy_rate),
    cost_per_reviewable_usd: nullableMoney(row.cost_per_reviewable_usd),
    cost_per_contact_worthy_usd: nullableMoney(row.cost_per_contact_worthy_usd),
  }));
}

function parseProviderLaneRows(csv: string): ProviderLaneRow[] {
  return parseCsv(csv).map((row) => ({
    provider: row.provider || "",
    jd_id: row.jd_id || "",
    title: row.title || "",
    category: row.category || "",
    lane_id: row.lane_id || "",
    planned: integer(row.planned),
    success: integer(row.success),
    error: integer(row.error),
    blocked: integer(row.blocked),
    returned: integer(row.returned),
    actual_cost_usd: money(row.actual_cost_usd),
    avg_latency_ms: integer(row.avg_latency_ms),
    candidate_cards: integer(row.candidate_cards),
    reviewable_candidates: integer(row.reviewable_candidates),
    contact_worthy_candidates: integer(row.contact_worthy_candidates),
    rejected_candidates: integer(row.rejected_candidates),
    reviewable_rate: percent(row.reviewable_rate),
    contact_worthy_rate: percent(row.contact_worthy_rate),
    cost_per_reviewable_usd: nullableMoney(row.cost_per_reviewable_usd),
    cost_per_contact_worthy_usd: nullableMoney(row.cost_per_contact_worthy_usd),
    failure_modes: splitFailureModes(row.failure_modes),
  }));
}

function summarizeCalibration(filePath: string): CalibrationSummary {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const reviewed = rows.filter((row) => row.reviewer_decision);
  const assistantRows = reviewed.filter((row) => (row.reviewer_notes || "").toLowerCase().includes("assistant_strict"));
  const reviewMode = reviewed.length === 0
    ? "unreviewed"
    : assistantRows.length === reviewed.length
      ? "assistant_strict"
      : assistantRows.length > 0
        ? "mixed"
        : "manual";
  const reviewedYes = reviewed.filter((row) => row.llm_decision === "yes");
  const confirmedYes = reviewedYes.filter((row) => normalizeDecision(row.reviewer_decision) === "contact_worthy");
  return {
    path: filePath,
    total_rows: rows.length,
    reviewed_rows: reviewed.length,
    review_mode: reviewMode,
    confirmed_contact_worthy: reviewed.filter((row) => normalizeDecision(row.reviewer_decision) === "contact_worthy").length,
    research_more: reviewed.filter((row) => normalizeDecision(row.reviewer_decision) === "research_more").length,
    rejected: reviewed.filter((row) => normalizeDecision(row.reviewer_decision) === "reject").length,
    reviewed_yes_rows: reviewedYes.length,
    confirmed_yes_rows: confirmedYes.length,
    yes_precision: reviewedYes.length > 0 ? confirmedYes.length / reviewedYes.length : 0,
    snippet_only_research_more: reviewed.filter((row) =>
      normalizeDecision(row.reviewer_decision) === "research_more" &&
      (row.snippet_only_risk || "").toLowerCase() === "yes"
    ).length,
  };
}

function parseCsv(value: string) {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      if (row.some((item) => item.length > 0)) matrix.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.length > 0)) matrix.push(row);

  const [headers, ...rows] = matrix;
  if (!headers) return [];
  return rows.map((items) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = items[index] || "";
    });
    return record;
  });
}

function normalizeDecision(value: string | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (["contact_worthy", "contact-worthy", "contact", "yes"].includes(normalized)) return "contact_worthy";
  if (["research_more", "research-more", "reviewable", "maybe"].includes(normalized)) return "research_more";
  if (["reject", "no"].includes(normalized)) return "reject";
  return null;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function integer(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function money(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : numeric(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10000) / 10000 : 0;
}

function nullableMoney(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? money(parsed) : null;
}

function percent(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function splitFailureModes(value: string | undefined) {
  return (value || "").split("|").map((item) => item.trim()).filter(Boolean);
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

main();
