import { createHash } from "node:crypto";
import { generateLlmJson, getDefaultLlmModel, resolveDeepSeekThinkingMode } from "@/lib/llm-client";
import { SEARCH_DECISION_VERSION, readDecisionContract, type SearchDecisionContract, type SearchRequirement } from "@/lib/search/decision-contract";

const CONTRACT_SCHEMA = {
  name: "search_decision_contract",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["title", "requirements"],
    properties: {
      title: { type: "string" },
      requirements: { type: "array", minItems: 1, maxItems: 12, items: {
        type: "object", additionalProperties: false,
        required: ["description", "kind", "priority", "verification"],
        properties: {
          description: { type: "string" },
          kind: { type: "string", enum: ["core_work", "capability", "seniority", "location", "work_model", "eligibility"] },
          priority: { type: "string", enum: ["required", "preferred"] },
          verification: { type: "string", enum: ["before_outreach", "during_outreach"] },
        },
      } },
    },
  },
} as const;

function object(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()) : []; }

export async function ensureSearchDecisionContract(jdText: string, parsed: Record<string, unknown>, usage: { searchId: string; jobId: string; userId: string }) {
  const brief = object(parsed.hiring_brief);
  const recall = object(parsed.recall_spec);
  const inputHash = createHash("sha256").update(JSON.stringify({ version: SEARCH_DECISION_VERSION, contractPromptVersion: 2, jdText, brief, clarification: parsed.user_clarification })).digest("hex");
  const existing = readDecisionContract(parsed.decision_contract);
  if (existing?.inputHash === inputHash) return existing;
  const { data } = await generateLlmJson<{ title: string; requirements: Omit<SearchRequirement, "id">[] }>({
    model: process.env.SEARCH_JUDGE_MODEL || getDefaultLlmModel(),
    system: "Define the evidence contract for a passive recruiting search from the actual JD and explicit recruiter clarifications. Return schema-valid JSON. Include exactly one required core_work criterion describing the central work outcome, not titles or employer prestige. Keep it distinct from the detailed capability and seniority criteria; do not turn every responsibility into an additional mandatory checklist inside core_work. Preserve all explicit hard location, work-model, seniority and core capability constraints. Combine related evidence requirements without requiring every optional technology. Preserve alternatives such as Go OR Java OR Python. Do not add requirements absent from the JD. before_outreach means the profile must contain direct or clearly equivalent evidence to recommend outreach: core work, essential capability and a strict geographic scope belong here. during_outreach means the fact normally requires a candidate conversation, such as interest, notice period, work authorization or willingness to attend the office when already local. Being local supports geographic feasibility but does not prove personal willingness. Do not require open-to-work, willingness or a perfect checklist to recommend a passive candidate. Separate geographic feasibility from willingness and separate hard facts from preferences. Unknown is not a contradiction. Keep each description specific, under 220 characters.",
    prompt: JSON.stringify({ output_contract: CONTRACT_SCHEMA.schema, raw_jd: jdText, hiring_brief: brief, user_clarification: parsed.user_clarification || null }),
    maxOutputTokens: 4500, temperature: 0, timeoutMs: 120_000, jsonSchema: CONTRACT_SCHEMA,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_INTENT_THINKING", "disabled"),
    usageEvent: { ...usage, stage: "search_decision_contract" },
  });
  if (!Array.isArray(data.requirements) || data.requirements.filter((item) => item.kind === "core_work" && item.priority === "required" && item.verification === "before_outreach").length !== 1) throw new Error("Search contract is missing the role's required core work.");
  if (brief.location_flexibility === "strict" && !data.requirements.some((item) => item.kind === "location" && item.priority === "required" && item.verification === "before_outreach")) throw new Error("Search contract omitted the strict location requirement.");
  const contract: SearchDecisionContract = {
    version: SEARCH_DECISION_VERSION, inputHash, title: data.title,
    requirements: data.requirements.map((item, index) => ({ ...item, id: `r${index + 1}` })),
    location: {
      scope: typeof brief.location_scope === "string" ? brief.location_scope : typeof parsed.location === "string" ? parsed.location : null,
      terms: [...new Set([...strings(recall.strict_location_terms), ...strings(recall.nearby_location_terms), ...strings(recall.location_terms)])],
      countries: strings(recall.countries).map((item) => item.toUpperCase()),
      strict: brief.location_flexibility === "strict",
      workModel: String(brief.work_model || "unknown"),
      relocationAllowed: String(brief.relocation_allowed || "unknown"),
    },
  };
  parsed.decision_contract = contract;
  return contract;
}
