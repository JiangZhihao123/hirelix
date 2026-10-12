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

export function agentModel(job: Job, purpose: "reply" | "conversation_title" = "reply") {
  const stage = purpose === "conversation_title" ? "conversation_title" : "private_agent_step";
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
    // Automatic titles are product metadata, not user-requested agent work.
    // Track provider usage above without sharing the reply reservation.
    if (purpose === "conversation_title") return;
    await consumeAgentCredits(job, costToCreditUnits(cost, multiplier), cost, {
      stage,
      model: modelId,
      provider,
      cost_usd: cost,
      multiplier,
      pricing_version: CREDIT_PRICING_VERSION,
      started_at: startedAt.toISOString(),
      usage,
    });
  }
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v3",
    transformParams: async ({ params }) => {
      await activeAgentJob(job);
      if (purpose === "conversation_title") return params;
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
      const startedAt = new Date();
      const result = await doGenerate();
      await account(
        result,
        startedAt,
        params.maxOutputTokens,
        result.response?.body,
      );
      return result;
    },
    wrapStream: async ({ doStream, params }) => {
      const startedAt = new Date();
      const result = await doStream();
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            async transform(part, controller) {
              if (part.type === "finish")
                await account(part, startedAt, params.maxOutputTokens);
              controller.enqueue(part);
            },
          }),
        ),
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
