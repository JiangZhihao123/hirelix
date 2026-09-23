import { generateLlmJson, getDefaultLlmModel, resolveDeepSeekThinkingMode } from "@/lib/llm-client";
import type { SearchDecisionContract, SearchOutcome } from "@/lib/search/decision-contract";

export type SearchAgentAction = { action: "source_more" | "finish"; reason: string; evidenceGap: string };

const ACTION_SCHEMA = {
  name: "search_next_action", strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["action", "reason", "evidence_gap"],
    properties: {
      action: { type: "string", enum: ["source_more", "finish"] },
      reason: { type: "string" }, evidence_gap: { type: "string" },
    },
  },
} as const;

/** Bound tool availability in code; the model chooses strategy within the granted sourcing budget. */
export async function planSearchNextAction(params: {
  contract: SearchDecisionContract;
  outcome: SearchOutcome;
  unresolved: Array<{ requirement: string; count: number }>;
  sourceAllowed: boolean;
  sourceAlreadyRequested: boolean;
  scanBudget: number;
  usage: { searchId: string; jobId: string; userId: string };
}): Promise<SearchAgentAction> {
  if (params.sourceAlreadyRequested) return { action: "finish", reason: "The authorized sourcing batch has been evaluated. Further expansion requires another explicit search action.", evidenceGap: "" };
  if (!params.sourceAllowed || params.scanBudget <= 0) return { action: "finish", reason: "This run is limited to saved profiles. The result states any remaining evidence and coverage gaps.", evidenceGap: "" };
  if (params.outcome.retrievedCount === 0) return { action: "source_more", reason: "The local index has no retrievable profiles for this role.", evidenceGap: "Candidate coverage" };
  const { data } = await generateLlmJson<{ action: SearchAgentAction["action"]; reason: string; evidence_gap: string }>({
    model: process.env.SEARCH_JUDGE_MODEL || getDefaultLlmModel(),
    system: "You control the next step of a bounded recruiting search. Inspect the evidence-backed outcome, then choose source_more or finish. source_more invokes the existing role-specific source plan within scan_budget; it does not relax the JD or guarantee qualified people. Prefer source_more when the local index failed to produce enough supported core-work/geographic matches and additional profiles can address the gap. Finish when the outreach target is met, further sourcing cannot resolve the main gap (for example personal willingness), or the existing result is sufficient. Reviews are not qualified contacts. Never use raw index size as proof of coverage, invent candidate facts, promise success, or request a different budget. State a concise factual reason and the evidence gap driving the action.",
    prompt: JSON.stringify({ output_contract: ACTION_SCHEMA.schema, contract: params.contract, observation: params.outcome, unresolved_requirements: params.unresolved, scan_budget: params.scanBudget }),
    maxOutputTokens: 1200, temperature: 0, timeoutMs: 90_000, jsonSchema: ACTION_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PLANNER_THINKING", "disabled"),
    usageEvent: { ...params.usage, stage: "search_next_action" },
  });
  if (data.action !== "source_more" && data.action !== "finish") throw new Error("Search planner returned an unsupported action.");
  return { action: data.action, reason: data.reason, evidenceGap: data.evidence_gap };
}
