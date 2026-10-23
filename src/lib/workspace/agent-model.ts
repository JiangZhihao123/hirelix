import { compactAgentToolSchema } from "./agent-tool-schema";
import { randomUUID } from "node:crypto";
import { agentCreditContext } from "@/lib/agent-credit-context";
import { getLogger } from "@/lib/logger";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  getDefaultLlmModel,
  getLlmApiKey,
  getLlmBaseUrl,
  isUsingOfficialDeepSeek,
  resolveDeepSeekThinkingMode,
  resolveDeepSeekReasoningEffort,
} from "@/lib/llm-client";
import { consumeAgentCredits, reserveAgentCall } from "@/lib/agent-access";
import {
  costToCreditUnits,
  creditMarkup,
  deepSeekRates,
  llmServiceCost,
  CREDIT_PRICING_VERSION,
} from "@/lib/agent-credit-pricing";
import { CREDIT_RETAIL_USD, CREDIT_UNITS } from "@/lib/agent-plan";
import { recordLlmUsageEvent } from "@/lib/search/persistence";
import { activeAgentJob } from "./agent-execution";
import { WorkspaceError } from "./database";
import type { Job } from "./types";

export function agentModel(job: Job, purpose: "reply" | "conversation_title" | "tool_input_repair" = "reply") {
  const stage = purpose === "conversation_title" ? "conversation_title"
    : purpose === "tool_input_repair" ? "private_agent_tool_input_repair" : "private_agent_step";
  const modelId = getDefaultLlmModel(),
    official = isUsingOfficialDeepSeek();
  const provider = official ? "deepseek" : "openrouter";
  const model = official
    ? createDeepSeek({ apiKey: getLlmApiKey(), baseURL: getLlmBaseUrl() })(
        modelId,
      )
    : createOpenAICompatible({
        name: "openrouter",
        apiKey: getLlmApiKey(),
        baseURL: getLlmBaseUrl(),
        includeUsage: true,
      })(modelId);
  const multiplier = creditMarkup();
  type Result = Awaited<ReturnType<typeof model.doGenerate>>;
  async function account(
    result: Pick<Result, "usage" | "finishReason">,
    startedAt: Date,
    maxOutputTokens?: number,
    responseBody?: unknown,
    metadata: Record<string, unknown> = {},
    attempt = 1,
  ) {
    const usage = {
      inputTokens: result.usage.inputTokens.total ?? 0,
      outputTokens: result.usage.outputTokens.total ?? 0,
      cachedInputTokens: result.usage.inputTokens.cacheRead ?? 0,
      cacheMissInputTokens: result.usage.inputTokens.noCache ?? 0,
    };
    const complete = result.finishReason.unified !== "length";
    await recordLlmUsageEvent({
      userId: job.user_id,
      jobId: job.id,
      stage,
      attempt,
      metadata: {...metadata, finish_reason: result.finishReason.unified, reasoning_tokens: result.usage.outputTokens.reasoning},
      model: modelId,
      provider,
      status: complete ? "success" : "error",
      ...usage,
      totalTokens: usage.inputTokens + usage.outputTokens,
      maxOutputTokens: maxOutputTokens,
      latencyMs: Date.now() - startedAt.getTime(),
      errorMessage: complete ? null : "Agent model output exceeded its limit",
      requestPayload: null,
      responsePayload: null,
    });
    if (!complete)
      throw new WorkspaceError(
        "The assistant could not finish this step. Completed work is saved; retry to continue.",
        502,
      );
    const body = responseBody as { usage?: { cost?: number } } | undefined;
    const cost = official
      ? llmServiceCost(modelId, startedAt, usage)
      : ((result.usage.raw as { cost?: number } | undefined)?.cost ??
        body?.usage?.cost);
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
      throw new Error("AI provider returned no cost");
    // Product metadata and structural format repairs are not extra user work.
    // Record their provider usage without overwriting the active reply's
    // reservation while the SDK is still parsing that reply's tool calls.
    if (purpose !== "reply") return;
    await consumeAgentCredits(job, costToCreditUnits(cost, multiplier), cost, {
      stage,
      model: modelId,
      provider,
      cost_usd: cost,
      multiplier,
      pricing_version: CREDIT_PRICING_VERSION,
      started_at: startedAt.toISOString(),
      usage,
      ...metadata,
    });
  }
  let lastStep: number | undefined, modelAttempt = 0;
  function callMetadata(params: {prompt: unknown; tools?: unknown}) {
    const trace = agentCreditContext.getStore()?.trace;
    if (trace?.step !== lastStep) {lastStep = trace?.step; modelAttempt = 0;}
    const callId = randomUUID();
    if (trace && purpose === "reply") trace.model_call_id = callId;
    const prompt = params.prompt as Array<{role: string}>;
    return {attempt: ++modelAttempt, metadata: {...trace, model_call_id: callId,
      input_bytes: {
        system: Buffer.byteLength(JSON.stringify(prompt.filter(message => message.role === "system"))),
        messages: Buffer.byteLength(JSON.stringify(prompt.filter(message => message.role !== "system"))),
        tools: Buffer.byteLength(JSON.stringify(params.tools ?? [])),
      },
    }};
  }
  async function recordFailure(error: unknown, startedAt: Date, metadata: Record<string, unknown>, attempt: number, maxOutputTokens?: number) {
    await recordLlmUsageEvent({userId: job.user_id, jobId: job.id, stage, model: modelId, provider,
      status: "error", attempt, maxOutputTokens, latencyMs: Date.now()-startedAt.getTime(),
      errorMessage: error instanceof Error ? error.name : "Unknown", metadata});
    getLogger({component: "workspace_agent_model"}).warn({job_id: job.id, ...metadata, model_attempt: attempt, error_type: error instanceof Error ? error.name : "Unknown"}, "Agent model call failed");
  }
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v3",
    transformParams: async ({ params }) => {
      await activeAgentJob(job);
      params = {...params, tools: params.tools?.map(tool => tool.type === "function"
        ? {...tool, inputSchema: compactAgentToolSchema(tool.inputSchema) as typeof tool.inputSchema} : tool)};
      if (purpose !== "reply") return params;
      const rates = official
        ? deepSeekRates(modelId, new Date(), true)
        : { input: 20, output: 20 };
      const inputBound =
        Buffer.byteLength(
          JSON.stringify({ prompt: params.prompt, tools: params.tools }),
          "utf8",
        ) + 512;
      const maxOutputTokens = await reserveAgentCall(
        job,
        costToCreditUnits((inputBound * rates.input) / 1e6, multiplier),
        params.maxOutputTokens ?? 16384,
        (((rates.output / 1e6) * multiplier) / CREDIT_RETAIL_USD) *
          CREDIT_UNITS,
      );
      return { ...params, maxOutputTokens };
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      const startedAt = new Date(), {metadata, attempt} = callMetadata(params);
      let result;
      try { result = await doGenerate(); }
      catch (error) {await recordFailure(error, startedAt, metadata, attempt, params.maxOutputTokens); throw error;}
      await account(result, startedAt, params.maxOutputTokens, result.response?.body, metadata, attempt);
      return result;
    },
    wrapStream: async ({ doStream, params }) => {
      const startedAt = new Date(), {metadata, attempt} = callMetadata(params);
      let result;
      try { result = await doStream(); }
      catch (error) {await recordFailure(error, startedAt, metadata, attempt, params.maxOutputTokens); throw error;}
      const reader = result.stream.getReader();
      return {
        ...result,
        stream: new ReadableStream({
          async start(controller) {
            let recorded = false;
            try {
              while (true) {
                const {done, value: part} = await reader.read();
                if (done) break;
                if (part.type === "finish") {
                  recorded = true;
                  await account(part, startedAt, params.maxOutputTokens, undefined, metadata, attempt);
                } else if (part.type === "error") {
                  recorded = true;
                  await recordFailure(part.error, startedAt, metadata, attempt, params.maxOutputTokens);
                }
                controller.enqueue(part);
              }
              if (!recorded) await recordFailure(new Error("StreamEndedWithoutUsage"), startedAt, metadata, attempt, params.maxOutputTokens);
              controller.close();
            } catch (error) {
              if (!recorded) await recordFailure(error, startedAt, metadata, attempt, params.maxOutputTokens);
              controller.error(error);
            } finally {reader.releaseLock();}
          },
          cancel(reason) {return reader.cancel(reason);},
        }),
      };
    },
  };
  return wrapLanguageModel({ model, middleware });
}
export function agentProviderOptions() {
  return isUsingOfficialDeepSeek()
    ? {
        deepseek: {
          thinking: {
            type: resolveDeepSeekThinkingMode("DEEPSEEK_THINKING", "enabled"),
          },
          reasoningEffort: resolveDeepSeekReasoningEffort(
            "DEEPSEEK_REASONING_EFFORT",
            "high",
          ),
        },
      }
    : undefined;
}
