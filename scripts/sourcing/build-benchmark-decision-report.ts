import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  benchmarkDir: string | null;
  outPath: string;
  calibrationCsvPath: string | null;
  minJds: number;
  minContactWorthyRate: number;
  maxCostPerContactWorthyUsd: number;
  maxProviderErrorRate: number;
  manualReviewDone: boolean;
};

type BenchmarkSummary = {
  benchmark_id?: string;
  mode?: string;
  providers?: string[];
  run_count?: number;
  completed_count?: number;
  planned_count?: number;
  error_count?: number;
  totals?: {
    actual_cost_usd?: number;
    estimated_cost_usd?: number;
    raw_leads?: number;
    enriched_leads?: number;
    deduped_leads?: number;
    candidate_cards?: number;
    yes?: number;
    maybe?: number;
    no?: number;
    reviewable_candidates?: number;
    contact_worthy_candidates?: number;
  };
  runs?: Array<{
    jd_id: string;
    title?: string;
    status?: string;
    candidate_cards?: number;
    yes?: number;
    maybe?: number;
    no?: number;
    actual_cost_usd?: number;
    provider_stats?: Record<string, {
      success?: number;
      error?: number;
      blocked?: number;
      returned?: number;
      actual_cost_usd?: number;
      candidate_cards?: number;
      reviewable_candidates?: number;
      contact_worthy_candidates?: number;
    }>;
  }>;
};

type CalibrationSummary = {
  path: string;
  total_rows: number;
  reviewed_rows: number;
  confirmed_contact_worthy: number;
  confirmed_reviewable: number;
  rejected_rows: number;
  reviewed_yes_rows: number;
  confirmed_yes_rows: number;
  reviewed_contact_worthy_rate: number;
  reviewed_reviewable_rate: number;
  reviewed_yes_precision: number;
  projected_contact_worthy_count: number | null;
  projected_cost_per_contact_worthy_usd: number | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    benchmarkDir: null,
    outPath: "docs/architecture/jd-sourcing-benchmark-report.md",
    calibrationCsvPath: null,
    minJds: 10,
    minContactWorthyRate: 0.12,
    maxCostPerContactWorthyUsd: 5,
    maxProviderErrorRate: 0.2,
    manualReviewDone: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--benchmark-dir=")) {
      options.benchmarkDir = arg.slice("--benchmark-dir=".length);
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("--calibration-csv=")) {
      options.calibrationCsvPath = arg.slice("--calibration-csv=".length);
      continue;
    }
    if (arg.startsWith("--min-jds=")) {
      options.minJds = positiveInt(arg.split("=")[1], options.minJds);
      continue;
    }
    if (arg.startsWith("--min-contact-worthy-rate=")) {
      options.minContactWorthyRate = positiveNumber(arg.split("=")[1], options.minContactWorthyRate);
      continue;
    }
    if (arg.startsWith("--max-cost-per-contact-worthy-usd=")) {
      options.maxCostPerContactWorthyUsd = positiveNumber(
        arg.split("=")[1],
        options.maxCostPerContactWorthyUsd,
      );
      continue;
    }
    if (arg.startsWith("--max-provider-error-rate=")) {
      options.maxProviderErrorRate = positiveNumber(arg.split("=")[1], options.maxProviderErrorRate);
      continue;
    }
    if (arg === "--manual-review-done") {
      options.manualReviewDone = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.benchmarkDir) {
    throw new Error(
      "Usage: npx tsx scripts/sourcing/build-benchmark-decision-report.ts --benchmark-dir=<benchmark-dir> [--out=docs/architecture/jd-sourcing-benchmark-report.md]",
    );
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const benchmarkDir = path.resolve(options.benchmarkDir!);
  const summary = readJson(path.join(benchmarkDir, "benchmark-summary.json")) as BenchmarkSummary;
  const calibration = options.calibrationCsvPath
    ? summarizeCalibration(path.resolve(options.calibrationCsvPath), summary)
    : null;
  const report = buildReport({ benchmarkDir, summary, options, calibration });
  const outPath = path.resolve(options.outPath);
  writeText(outPath, report);
  console.log(`Benchmark decision report written: ${outPath}`);
}

function buildReport(params: {
  benchmarkDir: string;
  summary: BenchmarkSummary;
  options: CliOptions;
  calibration: CalibrationSummary | null;
}) {
  const metrics = buildMetrics(params.summary);
  const providerRows = buildProviderRows(params.summary);
  const decision = decide(metrics, params.options, params.calibration);
  const dominantProvider = findDominantContactProvider(providerRows);
  const runRows = (params.summary.runs || []).map((run) => ({
    jd_id: run.jd_id,
    title: run.title || "",
    status: run.status || "",
    cards: numeric(run.candidate_cards),
    yes: numeric(run.yes),
    maybe: numeric(run.maybe),
    no: numeric(run.no),
    cost: money(run.actual_cost_usd),
  }));

  const lines = [
    "# JD Sourcing Benchmark Decision Report",
    "",
    "本报告由 benchmark 产物生成，用于判断 Hirelix 的 JD-to-candidate 数据源路线是否足够进入下一阶段。它不是人工背书；如果样本量不足或不是 live run，结论必须保持为不可决策。",
    "",
    "## 结论",
    "",
    `- 判断：**${decision.verdict}**`,
    `- 建议动作：**${decision.next_action}**`,
    "",
    "核心理由：",
    ...decision.reasons.map((reason) => `- ${reason}`),
    "",
    "## 风险标记",
    "",
    ...buildRiskNotes({ metrics, providerRows, dominantProvider, options: params.options, calibration: params.calibration }).map((note) => `- ${note}`),
    "",
    "## Benchmark 输入",
    "",
    `- Benchmark：\`${params.summary.benchmark_id || "unknown"}\``,
    `- 目录：\`${params.benchmarkDir}\``,
    `- 模式：\`${params.summary.mode || "unknown"}\``,
    `- Providers：\`${(params.summary.providers || []).join(",")}\``,
    `- JD 数量：${metrics.jd_count}`,
    `- 完成：${metrics.completed_count}，planned：${metrics.planned_count}，error：${metrics.error_count}`,
    "",
    "## 总体指标",
    "",
    "| 指标 | 数值 |",
    "| --- | ---: |",
    `| actual cost | $${metrics.actual_cost_usd.toFixed(4)} |`,
    `| estimated cost | $${metrics.estimated_cost_usd.toFixed(4)} |`,
    `| raw leads | ${metrics.raw_leads} |`,
    `| deduped leads | ${metrics.deduped_leads} |`,
    `| candidate cards | ${metrics.candidate_cards} |`,
    `| reviewable candidates | ${metrics.reviewable_candidates} |`,
    `| contact-worthy candidates | ${metrics.contact_worthy_candidates} |`,
    `| reviewable rate | ${pct(metrics.reviewable_rate)} |`,
    `| contact-worthy rate | ${pct(metrics.contact_worthy_rate)} |`,
    `| cost per contact-worthy | ${metrics.cost_per_contact_worthy_usd == null ? "N/A" : `$${metrics.cost_per_contact_worthy_usd.toFixed(4)}`} |`,
    `| provider error rate | ${pct(metrics.provider_error_rate)} |`,
    ...(params.calibration ? [
      `| reviewed calibration rows | ${params.calibration.reviewed_rows} / ${params.calibration.total_rows} |`,
      `| manually confirmed contact-worthy | ${params.calibration.confirmed_contact_worthy} |`,
      `| manual contact-worthy rate on reviewed rows | ${pct(params.calibration.reviewed_contact_worthy_rate)} |`,
      `| manual yes precision on reviewed yes | ${pct(params.calibration.reviewed_yes_precision)} |`,
      `| projected cost per manual contact-worthy | ${params.calibration.projected_cost_per_contact_worthy_usd == null ? "N/A" : `$${params.calibration.projected_cost_per_contact_worthy_usd.toFixed(4)}`} |`,
    ] : []),
    "",
    "## 单 JD 结果",
    "",
    "| JD | Status | Cards | Yes | Maybe | No | Actual cost |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of runRows) {
    lines.push(
      `| ${row.jd_id} ${escapePipe(row.title)} | ${row.status} | ${row.cards} | ${row.yes} | ${row.maybe} | ${row.no} | $${row.cost.toFixed(4)} |`,
    );
  }

  if (params.calibration) {
    lines.push(
      "",
      "## 人工校准",
      "",
      `- 校准文件：\`${params.calibration.path}\``,
      `- 已审样本：${params.calibration.reviewed_rows} / ${params.calibration.total_rows}`,
      `- 人工确认 contact-worthy：${params.calibration.confirmed_contact_worthy}`,
      `- 人工确认 reviewable：${params.calibration.confirmed_reviewable}`,
      `- 人工 reject：${params.calibration.rejected_rows}`,
      `- 已审样本 contact-worthy rate：${pct(params.calibration.reviewed_contact_worthy_rate)}`,
      `- 已审 LLM yes precision：${pct(params.calibration.reviewed_yes_precision)}`,
      `- 投影 contact-worthy 数：${params.calibration.projected_contact_worthy_count == null ? "N/A" : params.calibration.projected_contact_worthy_count}`,
      `- 投影 cost per contact-worthy：${params.calibration.projected_cost_per_contact_worthy_usd == null ? "N/A" : `$${params.calibration.projected_cost_per_contact_worthy_usd.toFixed(4)}`}`,
    );
  }

  lines.push(
    "",
    "## Provider 贡献",
    "",
    "| Provider | Calls | Returned | Errors | Blocked | Cards | Reviewable | Contact-worthy | Actual cost | Cost/contact-worthy |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const row of providerRows) {
    lines.push(
      `| ${row.provider} | ${row.calls} | ${row.returned} | ${row.errors} | ${row.blocked} | ${row.has_candidate_attribution ? row.cards : "N/A"} | ${row.has_candidate_attribution ? row.reviewable : "N/A"} | ${row.has_candidate_attribution ? row.contact_worthy : "N/A"} | $${row.cost.toFixed(4)} | ${row.cost_per_contact_worthy == null ? "N/A" : `$${row.cost_per_contact_worthy.toFixed(4)}`} |`,
    );
  }
  if (providerRows.some((row) => !row.has_candidate_attribution)) {
    lines.push(
      "",
      "说明：当前 benchmark 产物缺少 provider-level candidate attribution；需要用当前 runner 重新跑 live benchmark，才能填充 provider/lane 到 candidate quality 的贡献。",
    );
  }

  lines.push(
    "",
    "## 下一步",
    "",
    ...decision.tasks.map((task) => `- ${task}`),
    "",
    "## 判定阈值",
    "",
    `- 最小 live JD 数：${params.options.minJds}`,
    `- 最小 contact-worthy rate：${pct(params.options.minContactWorthyRate)}`,
    `- 最大 cost per contact-worthy：$${params.options.maxCostPerContactWorthyUsd.toFixed(2)}`,
    `- 最大 provider error rate：${pct(params.options.maxProviderErrorRate)}`,
    `- 人工校准完成：${params.options.manualReviewDone ? "yes" : "no"}`,
  );

  return `${lines.join("\n")}\n`;
}

function buildMetrics(summary: BenchmarkSummary) {
  const totals = summary.totals || {};
  const yes = numeric(totals.yes);
  const maybe = numeric(totals.maybe);
  const contactWorthy = numeric(totals.contact_worthy_candidates) || yes;
  const reviewable = numeric(totals.reviewable_candidates) || yes + maybe;
  const cards = numeric(totals.candidate_cards);
  const provider = buildProviderErrorMetrics(summary);
  const actualCost = money(totals.actual_cost_usd);
  return {
    mode: summary.mode || "unknown",
    jd_count: numeric(summary.run_count) || (summary.runs || []).length,
    completed_count: numeric(summary.completed_count),
    planned_count: numeric(summary.planned_count),
    error_count: numeric(summary.error_count),
    actual_cost_usd: actualCost,
    estimated_cost_usd: money(totals.estimated_cost_usd),
    raw_leads: numeric(totals.raw_leads),
    deduped_leads: numeric(totals.deduped_leads),
    candidate_cards: cards,
    reviewable_candidates: reviewable,
    contact_worthy_candidates: contactWorthy,
    reviewable_rate: ratio(reviewable, cards),
    contact_worthy_rate: ratio(contactWorthy, cards),
    cost_per_contact_worthy_usd: contactWorthy > 0 ? money(actualCost / contactWorthy) : null,
    provider_error_rate: ratio(provider.errors, provider.calls),
  };
}

function buildProviderRows(summary: BenchmarkSummary) {
  const merged = new Map<string, {
    provider: string;
    calls: number;
    returned: number;
    errors: number;
    blocked: number;
    cards: number;
    reviewable: number;
    contact_worthy: number;
    cost: number;
    has_candidate_attribution: boolean;
  }>();
  for (const run of summary.runs || []) {
    for (const [provider, stats] of Object.entries(run.provider_stats || {})) {
      const item = merged.get(provider) || {
        provider,
        calls: 0,
        returned: 0,
        errors: 0,
        blocked: 0,
        cards: 0,
        reviewable: 0,
        contact_worthy: 0,
        cost: 0,
        has_candidate_attribution: false,
      };
      item.calls += numeric(stats.success) + numeric(stats.error) + numeric(stats.blocked);
      item.returned += numeric(stats.returned);
      item.errors += numeric(stats.error);
      item.blocked += numeric(stats.blocked);
      if (typeof stats.candidate_cards === "number") {
        item.has_candidate_attribution = true;
        item.cards += numeric(stats.candidate_cards);
        item.reviewable += numeric(stats.reviewable_candidates);
        item.contact_worthy += numeric(stats.contact_worthy_candidates);
      }
      item.cost += money(stats.actual_cost_usd);
      merged.set(provider, item);
    }
  }
  return Array.from(merged.values())
    .map((row) => ({
      ...row,
      cost: money(row.cost),
      cost_per_contact_worthy: row.has_candidate_attribution && row.contact_worthy > 0
        ? money(row.cost / row.contact_worthy)
        : null,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

function buildProviderErrorMetrics(summary: BenchmarkSummary) {
  const rows = buildProviderRows(summary);
  return {
    calls: rows.reduce((sum, row) => sum + row.calls, 0),
    errors: rows.reduce((sum, row) => sum + row.errors + row.blocked, 0),
  };
}

function summarizeCalibration(filePath: string, summary: BenchmarkSummary): CalibrationSummary {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const totalRows = rows.length;
  const reviewed = rows.filter((row) => normalizeReviewerDecision(row.reviewer_decision));
  const confirmedContact = reviewed.filter((row) => normalizeReviewerDecision(row.reviewer_decision) === "contact_worthy").length;
  const confirmedReviewable = reviewed.filter((row) => {
    const decision = normalizeReviewerDecision(row.reviewer_decision);
    return decision === "contact_worthy" || decision === "research_more";
  }).length;
  const rejected = reviewed.filter((row) => normalizeReviewerDecision(row.reviewer_decision) === "reject").length;
  const reviewedYes = reviewed.filter((row) => row.llm_decision === "yes");
  const confirmedYes = reviewedYes.filter((row) => normalizeReviewerDecision(row.reviewer_decision) === "contact_worthy").length;
  const reviewedMaybe = reviewed.filter((row) => row.llm_decision === "maybe");
  const confirmedMaybe = reviewedMaybe.filter((row) => normalizeReviewerDecision(row.reviewer_decision) === "contact_worthy").length;
  const totals = summary.totals || {};
  const yesRate = reviewedYes.length > 0 ? confirmedYes / reviewedYes.length : null;
  const maybeRate = reviewedMaybe.length > 0 ? confirmedMaybe / reviewedMaybe.length : null;
  const projectedContact = yesRate == null && maybeRate == null
    ? null
    : Math.round(
        numeric(totals.yes) * (yesRate ?? 0) +
        numeric(totals.maybe) * (maybeRate ?? 0),
      );
  return {
    path: filePath,
    total_rows: totalRows,
    reviewed_rows: reviewed.length,
    confirmed_contact_worthy: confirmedContact,
    confirmed_reviewable: confirmedReviewable,
    rejected_rows: rejected,
    reviewed_yes_rows: reviewedYes.length,
    confirmed_yes_rows: confirmedYes,
    reviewed_contact_worthy_rate: ratio(confirmedContact, reviewed.length),
    reviewed_reviewable_rate: ratio(confirmedReviewable, reviewed.length),
    reviewed_yes_precision: ratio(confirmedYes, reviewedYes.length),
    projected_contact_worthy_count: projectedContact,
    projected_cost_per_contact_worthy_usd:
      projectedContact && projectedContact > 0
        ? money(numeric(totals.actual_cost_usd) / projectedContact)
        : null,
  };
}

function normalizeReviewerDecision(value: string | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (["contact_worthy", "contact-worthy", "contact", "yes"].includes(normalized)) return "contact_worthy";
  if (["research_more", "research-more", "reviewable", "maybe"].includes(normalized)) return "research_more";
  if (["reject", "no"].includes(normalized)) return "reject";
  if (["uncertain", "unknown"].includes(normalized)) return "uncertain";
  return null;
}

function decide(
  metrics: ReturnType<typeof buildMetrics>,
  options: CliOptions,
  calibration: CalibrationSummary | null,
) {
  const reasons: string[] = [];
  const tasks: string[] = [];

  if (metrics.mode !== "live") {
    reasons.push("当前不是 live benchmark，不能回答真实 provider 返回质量和真实成本。");
  }
  if (metrics.jd_count < options.minJds) {
    reasons.push(`当前只有 ${metrics.jd_count} 个 JD，低于 ${options.minJds} 个 JD 的最小决策样本。`);
  }
  if (metrics.error_count > 0) {
    reasons.push(`benchmark run 有 ${metrics.error_count} 个错误，质量和成本统计会失真。`);
  }
  if (metrics.contact_worthy_candidates === 0) {
    reasons.push("contact-worthy candidate 为 0，无法计算真实单个可联系人成本。");
  }

  const enoughToDecide =
    metrics.mode === "live" &&
    metrics.jd_count >= options.minJds &&
    metrics.error_count === 0 &&
    metrics.contact_worthy_candidates > 0;

  if (!enoughToDecide) {
    tasks.push("先跑完整 10 JD live benchmark，默认不启用 Bright，保持单 JD 和总预算上限。");
    tasks.push("抽查 yes/maybe 样本，确认 LLM light screen 没有把搜索摘要误判成可联系候选人。");
    tasks.push("用 provider-lane-value-table.csv 找到高产 lane，再决定是否做 Bright 极小 probe。");
    return {
      verdict: "不能决策",
      next_action: "进入完整 10 JD live benchmark 前，不改变产品方向",
      reasons,
      tasks,
    };
  }

  if (!options.manualReviewDone || !calibration || calibration.reviewed_rows === 0) {
    return {
      verdict: "需要人工校准",
      next_action: "先抽查 yes/maybe，再决定是否进入 UI 原型",
      reasons: [
        "10 JD live benchmark 已跑通，但 contact-worthy 仍是 LLM light screen 结果，不是人工确认结果。",
        `LLM contact-worthy rate 为 ${pct(metrics.contact_worthy_rate)}，足够支持继续验证，但不能直接当作 PMF 证据。`,
        calibration && calibration.reviewed_rows === 0
          ? "已提供校准 CSV，但 reviewer_decision 尚未填写，不能计算人工确认率。"
          : `cost per LLM-contact-worthy 为 $${metrics.cost_per_contact_worthy_usd?.toFixed(4) || "N/A"}，说明成本压力暂时不是主瓶颈。`,
      ],
      tasks: [
        "填写 docs/architecture/jd-sourcing-calibration-samples.csv 的 reviewer_decision。",
        "重点检查 LinkedIn/Google snippet-only 候选是否被过度判 yes。",
        "用人工确认后的 contact-worthy rate 重新生成报告，传入 --calibration-csv 和 --manual-review-done。",
      ],
    };
  }

  if (
    calibration.reviewed_contact_worthy_rate >= options.minContactWorthyRate &&
    calibration.projected_cost_per_contact_worthy_usd != null &&
    calibration.projected_cost_per_contact_worthy_usd <= options.maxCostPerContactWorthyUsd &&
    metrics.provider_error_rate <= options.maxProviderErrorRate
  ) {
    return {
      verdict: "可以继续外部 sourcing",
      next_action: "把有效 provider/lane 固化进冷启动原型，并开始小规模 UI 验证",
      reasons: [
        `人工校准样本 contact-worthy rate 达到 ${pct(calibration.reviewed_contact_worthy_rate)}。`,
        `投影 cost per contact-worthy 为 $${calibration.projected_cost_per_contact_worthy_usd.toFixed(4)}，低于阈值。`,
        `provider error rate 为 ${pct(metrics.provider_error_rate)}，没有明显可用性阻塞。`,
      ],
      tasks: [
        "保留高产 provider/lane，砍掉低产且高成本 lane。",
        "加入候选人解释和证据不足提示，进入小范围产品化原型。",
        "再做 Bright 极小 probe，对比结构化 profile 是否能显著提升 contact-worthy rate。",
      ],
    };
  }

  if (
    calibration.reviewed_reviewable_rate >= options.minContactWorthyRate &&
    calibration.reviewed_contact_worthy_rate < options.minContactWorthyRate
  ) {
    return {
      verdict: "需要重大修改",
      next_action: "优先改补全和 rerank，不直接扩 provider",
      reasons: [
        `人工校准样本 reviewable rate 为 ${pct(calibration.reviewed_reviewable_rate)}，说明 discovery 有信号。`,
        `人工校准样本 contact-worthy rate 只有 ${pct(calibration.reviewed_contact_worthy_rate)}，说明证据补全或判断口径不足。`,
      ],
      tasks: [
        "把 yes 的证据门槛调严，避免 snippet-only 误判。",
        "对 maybe 样本做补全实验，确认是数据不足还是候选本身不合格。",
        "按 lane 分析低质量来源，砍掉 broad SERP query。",
      ],
    };
  }

  return {
    verdict: "方向仍未证明",
    next_action: "先调 provider/lane 或砍 sourcing 范围",
    reasons: [
      `人工校准样本 contact-worthy rate 为 ${pct(calibration.reviewed_contact_worthy_rate)}，低于阈值。`,
      `投影 cost per contact-worthy 为 ${calibration.projected_cost_per_contact_worthy_usd == null ? "N/A" : `$${calibration.projected_cost_per_contact_worthy_usd.toFixed(4)}`}。`,
      `provider error rate 为 ${pct(metrics.provider_error_rate)}。`,
    ],
    tasks: [
      "回到 provider-lane-value-table.csv，保留每个 JD 至少一条高意图 lane。",
      "把太宽泛的 query 改成目标公司、技能证据、公开作品组合。",
      "如果 2 轮后仍没有稳定 contact-worthy 产出，停止做泛 sourcing，转窄场景或混合定位。",
    ],
  };
}

function findDominantContactProvider(providerRows: ReturnType<typeof buildProviderRows>) {
  const total = providerRows.reduce((sum, row) => sum + row.contact_worthy, 0);
  if (total <= 0) return null;
  const sorted = [...providerRows].sort((a, b) => b.contact_worthy - a.contact_worthy);
  const top = sorted[0];
  if (!top) return null;
  return {
    provider: top.provider,
    contact_worthy: top.contact_worthy,
    share: top.contact_worthy / total,
  };
}

function buildRiskNotes(params: {
  metrics: ReturnType<typeof buildMetrics>;
  providerRows: ReturnType<typeof buildProviderRows>;
  dominantProvider: ReturnType<typeof findDominantContactProvider>;
  options: CliOptions;
  calibration: CalibrationSummary | null;
}) {
  const notes: string[] = [];
  if (!params.options.manualReviewDone || !params.calibration || params.calibration.reviewed_rows === 0) {
    notes.push("人工校准尚未完成；当前 yes/maybe 只能代表 LLM 评审，不代表真实猎头愿意联系。");
  }
  if (params.calibration && params.calibration.reviewed_rows > 0 && params.calibration.reviewed_yes_precision < 0.5) {
    notes.push(`已审 LLM yes precision 只有 ${pct(params.calibration.reviewed_yes_precision)}，说明 LLM 对 contact-worthy 的判断偏乐观。`);
  }
  if (params.dominantProvider && params.dominantProvider.share >= 0.7) {
    notes.push(
      `${params.dominantProvider.provider} 贡献了 ${pct(params.dominantProvider.share)} 的 contact-worthy；数据源路线高度依赖单一 discovery 来源，需要人工确认它不是搜索摘要误判。`,
    );
  }
  const exa = params.providerRows.find((row) => row.provider === "exa");
  if (exa && exa.cards > 0 && exa.contact_worthy / exa.cards < 0.08) {
    notes.push(`Exa contact-worthy rate 只有 ${pct(exa.contact_worthy / exa.cards)}，当前更像补充发现源，不像主数据源。`);
  }
  const firecrawl = params.providerRows.find((row) => row.provider === "firecrawl");
  if (firecrawl && firecrawl.cost > 0 && firecrawl.contact_worthy === 0) {
    notes.push("Firecrawl 当前只做补全文本，不直接归因 candidate；后续要判断它是否提升人工确认率，而不是只看 provider 表里的 0。");
  }
  if (params.metrics.contact_worthy_candidates === 0) {
    notes.push("没有 contact-worthy 候选，当前路线不能进入产品化。");
  }
  if (notes.length === 0) {
    notes.push("未发现硬性阻塞，但仍需保留按 JD/provider/lane 的复盘。");
  }
  return notes;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
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

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function money(value: unknown) {
  return Math.round(numeric(value) * 10000) / 10000;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|");
}

main();
