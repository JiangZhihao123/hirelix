import type { CostLedgerEntry, ProviderName, SearchBudget } from "./types";

const PAID_PROVIDERS = new Set<ProviderName>(["serper", "exa", "firecrawl", "bright"]);

export function nowIso() {
  return new Date().toISOString();
}

export function createBudget(options: Partial<SearchBudget> = {}): SearchBudget {
  return {
    totalUsdCap: options.totalUsdCap ?? 50,
    brightUsdCap: options.brightUsdCap ?? 5,
    allowPaid: options.allowPaid ?? false,
  };
}

export function assertBudgetAllowsCall(params: {
  provider: ProviderName;
  estimatedCostUsd: number;
  budget: SearchBudget;
  spentUsd: number;
  brightSpentUsd: number;
}) {
  const estimated = Math.max(0, params.estimatedCostUsd);
  if (PAID_PROVIDERS.has(params.provider) && !params.budget.allowPaid && estimated > 0) {
    throw new Error(
      `Paid provider call blocked: ${params.provider} estimated $${estimated.toFixed(4)}. Pass --allow-paid with explicit budget to run it.`,
    );
  }
  if (params.spentUsd + estimated > params.budget.totalUsdCap) {
    throw new Error(
      `Total budget exceeded: spent $${params.spentUsd.toFixed(4)} + estimated $${estimated.toFixed(4)} > cap $${params.budget.totalUsdCap.toFixed(2)}`,
    );
  }
  if (
    params.provider === "bright" &&
    params.brightSpentUsd + estimated > params.budget.brightUsdCap
  ) {
    throw new Error(
      `Bright budget exceeded: spent $${params.brightSpentUsd.toFixed(4)} + estimated $${estimated.toFixed(4)} > cap $${params.budget.brightUsdCap.toFixed(2)}`,
    );
  }
}

export function plannedLedgerEntry(params: {
  runId: string;
  provider: ProviderName;
  operation: string;
  estimatedCostUsd: number;
  laneId?: string | null;
  query?: string | null;
  status?: CostLedgerEntry["status"];
  message?: string | null;
  metadata?: Record<string, unknown>;
}): CostLedgerEntry {
  return {
    ts: nowIso(),
    run_id: params.runId,
    provider: params.provider,
    operation: params.operation,
    lane_id: params.laneId ?? null,
    query: params.query ?? null,
    estimated_cost_usd: Math.max(0, params.estimatedCostUsd),
    actual_cost_usd: null,
    latency_ms: null,
    returned_count: null,
    status: params.status ?? "planned",
    message: params.message ?? null,
    metadata: params.metadata,
  };
}

export function completedLedgerEntry(
  planned: CostLedgerEntry,
  updates: Partial<Pick<CostLedgerEntry, "actual_cost_usd" | "latency_ms" | "returned_count" | "status" | "message" | "metadata">>,
): CostLedgerEntry {
  return {
    ...planned,
    ts: nowIso(),
    actual_cost_usd: updates.actual_cost_usd ?? planned.actual_cost_usd,
    latency_ms: updates.latency_ms ?? planned.latency_ms,
    returned_count: updates.returned_count ?? planned.returned_count,
    status: updates.status ?? planned.status,
    message: updates.message ?? planned.message,
    metadata: updates.metadata ?? planned.metadata,
  };
}
