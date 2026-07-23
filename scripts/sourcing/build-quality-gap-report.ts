import fs from "node:fs";
import path from "node:path";

type CliOptions = {
  benchmarkDir: string;
  calibrationCsvPath: string;
  assistantStrictCsvPath: string;
  reviewQueueCsvPath: string;
  outMdPath: string;
  outJsonPath: string;
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
    yes?: number;
    maybe?: number;
    no?: number;
  };
  runs?: Array<{
    jd_id: string;
    title?: string;
    category?: string;
    candidate_cards?: number;
    yes?: number;
    maybe?: number;
    no?: number;
    actual_cost_usd?: number;
  }>;
};

type ProviderLaneRow = {
  jd_id: string;
  title: string;
  category: string;
  provider: string;
  lane_id: string;
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
  failure_modes: string[];
};

type CalibrationRow = Record<string, string>;
type ReviewQueueRow = Record<string, string>;

type GapSeverity = "P0" | "P1" | "P2";

type QualityGap = {
  id: string;
  severity: GapSeverity;
  area: "G3" | "G4" | "G5" | "G6" | "G7" | "G8" | "G9";
  title: string;
  evidence: string[];
  impact: string;
  recommended_change: string;
  next_validation: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    benchmarkDir: "runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc",
    calibrationCsvPath: "docs/architecture/jd-sourcing-calibration-human-reviewed.csv",
    assistantStrictCsvPath: "docs/architecture/jd-sourcing-calibration-assistant-strict.csv",
    reviewQueueCsvPath: "docs/architecture/jd-sourcing-human-review-queue.csv",
    outMdPath: "docs/architecture/jd-sourcing-quality-gap-report.md",
    outJsonPath: "docs/architecture/jd-sourcing-quality-gap-report.json",
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
    if (arg.startsWith("--assistant-strict-csv=")) {
      options.assistantStrictCsvPath = arg.slice("--assistant-strict-csv=".length);
      continue;
    }
    if (arg.startsWith("--review-queue-csv=")) {
      options.reviewQueueCsvPath = arg.slice("--review-queue-csv=".length);
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
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const benchmarkDir = path.resolve(options.benchmarkDir);
  const summary = readJson<BenchmarkSummary>(path.join(benchmarkDir, "benchmark-summary.json"));
  const laneRows = parseProviderLaneRows(readText(path.join(benchmarkDir, "provider-lane-value-table.csv")));
  const providerRows = parseCsv(readText(path.join(benchmarkDir, "provider-value-table.csv")));
  const calibrationRows = parseCsv(readText(path.resolve(options.calibrationCsvPath)));
  const assistantStrictRows = parseCsv(readText(path.resolve(options.assistantStrictCsvPath)));
  const reviewQueueRows = parseCsv(readText(path.resolve(options.reviewQueueCsvPath)));

  const report = buildReport({
    benchmarkDir,
    summary,
    laneRows,
    providerRows,
    calibrationRows,
    assistantStrictRows,
    reviewQueueRows,
    options,
  });

  writeJson(path.resolve(options.outJsonPath), report);
  writeText(path.resolve(options.outMdPath), renderMarkdown(report));
  console.log(`Quality gap report written: ${path.resolve(options.outMdPath)}`);
}

function buildReport(params: {
  benchmarkDir: string;
  summary: BenchmarkSummary;
  laneRows: ProviderLaneRow[];
  providerRows: CalibrationRow[];
  calibrationRows: CalibrationRow[];
  assistantStrictRows: CalibrationRow[];
  reviewQueueRows: ReviewQueueRow[];
  options: CliOptions;
}) {
  const calibration = summarizeCalibration(params.calibrationRows);
  const assistantStrict = summarizeCalibration(params.assistantStrictRows);
  const reviewQueue = summarizeReviewQueue(params.reviewQueueRows);
  const provider = summarizeProviders(params.providerRows);
  const lanes = summarizeLanes(params.laneRows);
  const gaps = buildGaps({ calibration, assistantStrict, reviewQueue, provider, lanes });
  const recommendedExecution = buildRecommendedExecution(gaps);

  return {
    generated_at: new Date().toISOString(),
    sources: {
      benchmark_dir: params.benchmarkDir,
      benchmark_id: params.summary.benchmark_id || "unknown",
      calibration_csv: path.resolve(params.options.calibrationCsvPath),
      assistant_strict_csv: path.resolve(params.options.assistantStrictCsvPath),
      review_queue_csv: path.resolve(params.options.reviewQueueCsvPath),
    },
    benchmark: {
      mode: params.summary.mode || "unknown",
      providers: params.summary.providers || [],
      run_count: numeric(params.summary.run_count),
      completed_count: numeric(params.summary.completed_count),
      error_count: numeric(params.summary.error_count),
      actual_cost_usd: money(params.summary.totals?.actual_cost_usd),
      candidate_cards: numeric(params.summary.totals?.candidate_cards),
      raw_llm_yes: numeric(params.summary.totals?.yes),
      raw_llm_maybe: numeric(params.summary.totals?.maybe),
      raw_llm_no: numeric(params.summary.totals?.no),
      raw_llm_contact_worthy: numeric(params.summary.totals?.contact_worthy_candidates),
    },
    calibration,
    assistant_strict: assistantStrict,
    review_queue: reviewQueue,
    provider,
    lanes,
    gaps,
    recommended_execution: recommendedExecution,
  };
}

function buildGaps(params: {
  calibration: ReturnType<typeof summarizeCalibration>;
  assistantStrict: ReturnType<typeof summarizeCalibration>;
  reviewQueue: ReturnType<typeof summarizeReviewQueue>;
  provider: ReturnType<typeof summarizeProviders>;
  lanes: ReturnType<typeof summarizeLanes>;
}): QualityGap[] {
  const gaps: QualityGap[] = [];

  if (params.calibration.reviewed_yes_precision < 0.5 || params.assistantStrict.reviewed_yes_precision < 0.5) {
    gaps.push({
      id: "QG-01",
      severity: "P0",
      area: "G7",
      title: "LLM yes 过于乐观，不能直接当作 contact-worthy",
      evidence: [
        `Codex 猎头视角已复核 yes precision：${pct(params.calibration.reviewed_yes_precision)}。`,
        `Codex 猎头视角样本：${params.calibration.reviewed_rows}/${params.calibration.total_rows}，复核来源：${formatCounts(params.calibration.reviewer_types)}。`,
        `assistant_strict yes precision：${pct(params.assistantStrict.reviewed_yes_precision)}。`,
      ],
      impact: "如果直接用 raw yes 进入二轮 benchmark 或产品化，会高估 provider 质量和真实可联系人数。",
      recommended_change: "提高 light screen 的 yes 门槛：snippet-only 候选默认最多 research_more；yes 必须有 JD 核心职责、资历、技能或领域的直接证据。",
      next_validation: "重新生成 calibration samples，比较 yes precision 和 research_more 数量变化。",
    });
  }

  if (params.calibration.snippet_only_research_more > 0 || params.reviewQueue.snippet_only_contact_worthy > 0) {
    gaps.push({
      id: "QG-02",
      severity: "P0",
      area: "G6",
      title: "Serper/LinkedIn snippet-only 是最大证据缺口",
      evidence: [
        `snippet-only research_more：${params.calibration.snippet_only_research_more}。`,
        `review queue 中 snippet-only contact_worthy warning：${params.reviewQueue.snippet_only_contact_worthy}。`,
        `Bright gate approved：${params.reviewQueue.bright_gate_approved}/${params.reviewQueue.bright_gate_rows}。`,
      ],
      impact: "Google 摘要能发现人，但不足以稳定判断是否值得联系；如果不补证据，会把搜索摘要误判成 profile 质量。",
      recommended_change: "candidate card 增加更硬的 evidence completeness 标记；LinkedIn snippet-only 候选默认进入 needs evidence，不直接进入 ready to review。",
      next_validation: "用不付费方式先重算 snippet-only 风险；Bright URL completion 只有在用户授权后做极小 probe。",
    });
  }

  if (params.provider.exa && params.provider.exa.cards > 0 && params.provider.exa.raw_contact_rate < 0.08) {
    gaps.push({
      id: "QG-03",
      severity: "P1",
      area: "G4",
      title: "Exa 当前更像补充发现源，不像主召回来源",
      evidence: [
        `Exa cards：${params.provider.exa.cards}。`,
        `Exa raw contact-worthy：${params.provider.exa.raw_contact_worthy}，raw rate：${pct(params.provider.exa.raw_contact_rate)}。`,
        `Exa zero-yield paid lanes：${params.lanes.exa_zero_yield_paid.length}。`,
      ],
      impact: "如果二轮继续给 Exa 同等预算，会把钱花在低产语义网页结果上，拉低 time/cost per useful candidate。",
      recommended_change: "Exa 不做主候选枚举；只保留 public evidence / hidden-gem lanes，并降低默认结果数，优先用于补证据。",
      next_validation: "二轮 benchmark 单独对比 Exa evidence-only query 是否提升 research_more -> contact/reject 的判断率。",
    });
  }

  if (params.provider.github && (params.provider.github.errors > 0 || params.provider.github.cards === 0)) {
    gaps.push({
      id: "QG-04",
      severity: "P1",
      area: "G4",
      title: "GitHub 不能作为初始候选交付来源",
      evidence: [
        `GitHub returned：${params.provider.github.returned}。`,
        `GitHub cards：${params.provider.github.cards}。`,
        `GitHub errors：${params.provider.github.errors}。`,
      ],
      impact: "当前 GitHub 结果无法稳定映射到职业 profile；作为主召回会制造 404、身份不确定和无候选卡片。",
      recommended_change: "GitHub 降级为技术证据 enrichment；只有已存在候选人身份时再拉 repo/user 证据。",
      next_validation: "二轮 benchmark 不把 GitHub 计入初始候选交付，只统计它是否提升 top candidates 的证据强度。",
    });
  }

  if (params.provider.firecrawl && params.provider.firecrawl.cards === 0 && params.provider.firecrawl.cost > 0) {
    gaps.push({
      id: "QG-05",
      severity: "P1",
      area: "G4",
      title: "Firecrawl 当前只有抽取成本，没有直接候选归因",
      evidence: [
        `Firecrawl cost：$${params.provider.firecrawl.cost.toFixed(4)}。`,
        `Firecrawl cards：${params.provider.firecrawl.cards}。`,
      ],
      impact: "Firecrawl 的价值不能按 direct candidate count 评估；它应服务证据补强，而不是主召回。",
      recommended_change: "Firecrawl 只抓 top non-LinkedIn URLs，并把输出写入 evidence pack；二轮报告统计 evidence upgrade，而非 direct contact-worthy。",
      next_validation: "用 candidate card completeness 对比抓取前后 needs evidence 是否下降。",
    });
  }

  if (params.lanes.zero_yield_paid.length > 0) {
    gaps.push({
      id: "QG-06",
      severity: "P1",
      area: "G3",
      title: "部分付费 lane 有结果但没有 raw contact-worthy",
      evidence: [
        `zero-yield paid lanes：${params.lanes.zero_yield_paid.length}。`,
        `代表 lane：${params.lanes.zero_yield_paid.slice(0, 5).map(formatLaneBrief).join("; ") || "N/A"}。`,
      ],
      impact: "这些 lane 可能太宽、语义漂移或 query 目标不清；继续扩量会增加成本但不提升候选质量。",
      recommended_change: "对 zero-yield paid lanes 默认 stop 或 revise_query；只有能说明具体证据增益时才保留。",
      next_validation: "二轮 benchmark 对每条保留 lane 输出 stop/revise/expand 诊断和原因。",
    });
  }

  if (params.provider.serper && params.provider.total_raw_contact > 0 && params.provider.serper.raw_contact_worthy / params.provider.total_raw_contact > 0.8) {
    gaps.push({
      id: "QG-07",
      severity: "P2",
      area: "G9",
      title: "当前路线高度依赖 Serper/X-ray",
      evidence: [
        `Serper raw contact-worthy：${params.provider.serper.raw_contact_worthy}/${params.provider.total_raw_contact}。`,
        `Serper cards：${params.provider.serper.cards}。`,
      ],
      impact: "短期可继续用 Serper 证明冷启动，但这不是长期数据壁垒；需要补全层和 profile index 把一次性搜索资产沉淀下来。",
      recommended_change: "二轮仍可保留 Serper 为默认 discovery，但报告必须区分 discovery success 和 profile quality success。",
      next_validation: "二轮 benchmark 分别统计 Serper raw lead、补全后 profile、最终 contact-worthy 三层转化。",
    });
  }

  return gaps.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function buildRecommendedExecution(gaps: QualityGap[]) {
  return {
    immediate_slice: "非付费质量诊断后，先修 G3/G6/G7，再跑 no-Bright 二轮 benchmark。",
    do_now: [
      "收紧 light screen yes 门槛，snippet-only 默认 needs evidence/research_more。",
      "把 candidate card 的 evidence completeness 和 snippet-only risk 作为显式字段参与排序。",
      "对 zero-yield paid lanes 默认 stop/revise_query，减少 Exa broad semantic lane 默认预算。",
      "GitHub/Firecrawl 只作为 evidence enrichment，不作为初始候选交付来源。",
    ],
    do_not_do_yet: [
      "不执行 Bright live probe，除非用户明确授权并接受 $1 cap。",
      "不做 profile index、ATS 导入、正式 UI 或生产调度。",
      "不通过 hard-code 具体人名、公司名、title 关键词修质量。",
    ],
    next_report: gaps.some((gap) => gap.severity === "P0")
      ? "先产出 G3/G6/G7 修正 diff 和二轮 no-Bright benchmark plan。"
      : "可以进入二轮 no-Bright benchmark。"
  };
}

function summarizeCalibration(rows: CalibrationRow[]) {
  const reviewed = rows.filter((row) => normalizeDecision(row.reviewer_decision));
  const reviewerTypes = countBy(reviewed, (row) => reviewerType(row.reviewer_notes));
  const reviewedYes = reviewed.filter((row) => row.llm_decision === "yes");
  const confirmedYes = reviewedYes.filter((row) => normalizeDecision(row.reviewer_decision) === "contact_worthy");
  const snippetOnly = rows.filter((row) => normalize(row.snippet_only_risk) === "yes");
  const snippetOnlyReviewed = reviewed.filter((row) => normalize(row.snippet_only_risk) === "yes");
  const snippetOnlyResearchMore = snippetOnlyReviewed.filter((row) =>
    normalizeDecision(row.reviewer_decision) === "research_more"
  );
  return {
    total_rows: rows.length,
    reviewed_rows: reviewed.length,
    reviewer_types: reviewerTypes,
    reviewed_yes_rows: reviewedYes.length,
    confirmed_yes_rows: confirmedYes.length,
    reviewed_yes_precision: reviewedYes.length > 0 ? confirmedYes.length / reviewedYes.length : 0,
    contact_worthy: reviewed.filter((row) => normalizeDecision(row.reviewer_decision) === "contact_worthy").length,
    research_more: reviewed.filter((row) => normalizeDecision(row.reviewer_decision) === "research_more").length,
    reject: reviewed.filter((row) => normalizeDecision(row.reviewer_decision) === "reject").length,
    snippet_only_rows: snippetOnly.length,
    snippet_only_reviewed: snippetOnlyReviewed.length,
    snippet_only_research_more: snippetOnlyResearchMore.length,
  };
}

function summarizeReviewQueue(rows: ReviewQueueRow[]) {
  const reviewed = rows.filter((row) => normalizeDecision(row.human_decision));
  const brightGate = rows.filter((row) => row.bucket === "bright_probe_gate");
  return {
    total_rows: rows.length,
    reviewed_rows: reviewed.length,
    p0_rows: rows.filter((row) => row.priority === "P0").length,
    p0_reviewed: reviewed.filter((row) => row.priority === "P0").length,
    bright_gate_rows: brightGate.length,
    bright_gate_reviewed: brightGate.filter((row) => normalizeDecision(row.human_decision)).length,
    bright_gate_approved: brightGate.filter((row) =>
      ["contact_worthy", "research_more"].includes(normalizeDecision(row.human_decision) || "")
    ).length,
    snippet_only_contact_worthy: reviewed.filter((row) =>
      normalize(row.snippet_only_risk) === "yes" &&
      normalizeDecision(row.human_decision) === "contact_worthy"
    ).length,
    reviewer_types: countBy(reviewed, (row) => normalize(row.reviewer_type) || "unknown"),
  };
}

function summarizeProviders(rows: CalibrationRow[]) {
  const providerRows = rows.map((row) => ({
    provider: row.provider,
    returned: integer(row.returned),
    cards: integer(row.candidate_cards),
    raw_contact_worthy: integer(row.contact_worthy_candidates),
    cost: money(row.actual_cost_usd),
    errors: integer(row.error),
    raw_contact_rate: percent(row.contact_worthy_rate),
  }));
  const byProvider = new Map(providerRows.map((row) => [row.provider, row]));
  const totalRawContact = providerRows.reduce((total, row) => total + row.raw_contact_worthy, 0);
  return {
    total_raw_contact: totalRawContact,
    providers: providerRows,
    serper: byProvider.get("serper") || null,
    exa: byProvider.get("exa") || null,
    firecrawl: byProvider.get("firecrawl") || null,
    github: byProvider.get("github") || null,
  };
}

function summarizeLanes(rows: ProviderLaneRow[]) {
  const zeroYieldPaid = rows
    .filter((row) => row.actual_cost_usd > 0 && row.candidate_cards > 0 && row.contact_worthy_candidates === 0)
    .sort((a, b) => b.actual_cost_usd - a.actual_cost_usd);
  const exaZeroYieldPaid = zeroYieldPaid.filter((row) => row.provider === "exa");
  const githubErrors = rows.filter((row) => row.provider === "github" && row.error > 0);
  const highYield = rows
    .filter((row) => row.contact_worthy_candidates >= 3)
    .sort((a, b) => b.contact_worthy_candidates - a.contact_worthy_candidates);
  return {
    total_rows: rows.length,
    zero_yield_paid: zeroYieldPaid,
    exa_zero_yield_paid: exaZeroYieldPaid,
    github_errors: githubErrors,
    high_yield: highYield,
  };
}

function renderMarkdown(report: ReturnType<typeof buildReport>) {
  const lines = [
    "# JD Sourcing Quality Gap Report",
    "",
    "本报告用于执行 `jd-sourcing-task-breakdown.md` 的当前推荐切片：先做非付费质量诊断，再决定是否修 G3/G6/G7、进入二轮 no-Bright benchmark，或申请 Bright 极小 live probe。",
    "",
    "## 总判断",
    "",
    "- 当前不是产品化阶段，仍是数据源路线和候选人质量验证阶段。",
    "- 主要问题不是 LLM 成本，也不是 UI/schema，而是低成本 discovery 结果能否通过补证和 JD-aware 判断变成 contact-worthy candidates。",
    "- 本报告不调用任何外部服务，不消耗 Bright。",
    "",
    "## 输入证据",
    "",
    `- Benchmark：\`${report.sources.benchmark_id}\``,
    `- Benchmark dir：\`${report.sources.benchmark_dir}\``,
    `- Calibration：\`${report.sources.calibration_csv}\``,
    `- Review queue：\`${report.sources.review_queue_csv}\``,
    `- Providers：\`${report.benchmark.providers.join(",")}\``,
    `- Actual external cost：$${report.benchmark.actual_cost_usd.toFixed(4)}`,
    `- Candidate cards：${report.benchmark.candidate_cards}`,
    `- Raw LLM yes / maybe / no：${report.benchmark.raw_llm_yes} / ${report.benchmark.raw_llm_maybe} / ${report.benchmark.raw_llm_no}`,
    "",
    "## 校准状态",
    "",
    `- 已复核样本：${report.calibration.reviewed_rows}/${report.calibration.total_rows}`,
    `- 复核来源：${formatCounts(report.calibration.reviewer_types)}`,
    `- 已复核 yes precision：${pct(report.calibration.reviewed_yes_precision)}`,
    `- contact_worthy / research_more / reject：${report.calibration.contact_worthy} / ${report.calibration.research_more} / ${report.calibration.reject}`,
    `- snippet-only reviewed / research_more：${report.calibration.snippet_only_reviewed} / ${report.calibration.snippet_only_research_more}`,
    `- review queue P0：${report.review_queue.p0_reviewed}/${report.review_queue.p0_rows}`,
    `- Bright gate：${report.review_queue.bright_gate_reviewed}/${report.review_queue.bright_gate_rows} reviewed，approved ${report.review_queue.bright_gate_approved}`,
    "",
    "## Provider 诊断",
    "",
    "| Provider | Returned | Cards | Raw contact-worthy | Raw rate | Cost | Errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of report.provider.providers) {
    lines.push(
      `| ${row.provider} | ${row.returned} | ${row.cards} | ${row.raw_contact_worthy} | ${pct(row.raw_contact_rate)} | $${row.cost.toFixed(4)} | ${row.errors} |`,
    );
  }

  lines.push(
    "",
    "## Quality Gaps",
    "",
  );

  for (const gap of report.gaps) {
    lines.push(
      `### ${gap.id} ${gap.severity} ${gap.title}`,
      "",
      `- Area：${gap.area}`,
      `- Impact：${gap.impact}`,
      "- Evidence：",
      ...gap.evidence.map((item) => `  - ${item}`),
      `- Recommended change：${gap.recommended_change}`,
      `- Next validation：${gap.next_validation}`,
      "",
    );
  }

  lines.push(
    "## Recommended Execution",
    "",
    `- Immediate slice：${report.recommended_execution.immediate_slice}`,
    "",
    "Do now：",
    ...report.recommended_execution.do_now.map((item) => `- ${item}`),
    "",
    "Do not do yet：",
    ...report.recommended_execution.do_not_do_yet.map((item) => `- ${item}`),
    "",
    `Next report：${report.recommended_execution.next_report}`,
    "",
    "## No-Bright 二轮 Benchmark 前置修正",
    "",
    "| 对应任务组 | 修正方向 | 验证方式 |",
    "| --- | --- | --- |",
    "| G3 JD 理解和 sourcing strategy | 对 zero-yield paid lanes 默认 stop/revise_query，保留高意图 X-ray lane | lane diagnosis 中输出 stop/revise/expand 和原因 |",
    "| G6 标准化、去重和候选人卡片 | snippet-only 显式标记 needs evidence，不直接作为 ready to review | candidate card completeness 和 snippet-only risk 进入排序/报告 |",
    "| G7 JD-aware scoring | 收紧 yes 门槛，缺核心证据时输出 research_more | 新 calibration yes precision 必须高于当前 26.9% |",
    "| G4 数据源发现层 | Exa/GitHub/Firecrawl 先作为 evidence/enrichment，不作为主交付来源 | 二轮 provider value 分开统计 discovery 和 evidence value |",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function parseProviderLaneRows(csv: string): ProviderLaneRow[] {
  return parseCsv(csv).map((row) => ({
    jd_id: row.jd_id || "",
    title: row.title || "",
    category: row.category || "",
    provider: row.provider || "",
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
    failure_modes: splitFailureModes(row.failure_modes),
  }));
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
  const normalized = normalize(value);
  if (["contact_worthy", "contact-worthy", "contact", "yes"].includes(normalized)) return "contact_worthy";
  if (["research_more", "research-more", "reviewable", "maybe"].includes(normalized)) return "research_more";
  if (["reject", "no"].includes(normalized)) return "reject";
  if (normalized === "uncertain") return "uncertain";
  return null;
}

function reviewerType(notes: string | undefined) {
  const value = normalize(notes);
  if (value.includes("reviewer_type=codex_headhunter")) return "codex_headhunter";
  if (value.includes("assistant_strict")) return "assistant_strict";
  if (value.includes("human_headhunter")) return "human_headhunter";
  if (value.includes("human_recruiter")) return "human_recruiter";
  if (value.includes("human_hiring_manager")) return "human_hiring_manager";
  return "unknown";
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "none";
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readText(filePath)) as T;
}

function readText(filePath: string) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
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
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function money(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : numeric(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10000) / 10000 : 0;
}

function percent(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function normalize(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function splitFailureModes(value: string | undefined) {
  return (value || "").split("|").map((item) => item.trim()).filter(Boolean);
}

function severityRank(severity: GapSeverity) {
  if (severity === "P0") return 0;
  if (severity === "P1") return 1;
  return 2;
}

function formatLaneBrief(row: ProviderLaneRow) {
  return `${row.jd_id}/${row.provider}/${row.lane_id} cards=${row.candidate_cards} cost=$${row.actual_cost_usd.toFixed(4)}`;
}

main();
