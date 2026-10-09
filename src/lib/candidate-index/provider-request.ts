import { getLogger } from "@/lib/logger";

const logger = getLogger({ component: "candidate_index_provider" });

export class IndexProviderError extends Error {
  constructor(public readonly status: number) {
    super(`Candidate index provider failed (${status})`);
    this.name = "IndexProviderError";
  }

  get userMessage() {
    if (this.status === 402)
      return "The document search service has insufficient provider balance. Your material is saved. Retry after service is restored.";
    if (this.status === 401 || this.status === 403 || this.status === 404)
      return "The document search service has a configuration problem. Your material is saved. Contact support or retry after service is restored.";
    return "The document search service is temporarily unavailable. Your material is saved. Try again later.";
  }
}

function transportCode(error: unknown): string | undefined {
  const code = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause ? error.cause.code : undefined;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : undefined;
}

/** Keep transport retries at the provider boundary, including response body reads. */
export async function requestIndexJson<T>(options: {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  fetcher?: typeof fetch;
}): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let status: number | undefined;
    try {
      const response = await (options.fetcher || fetch)(options.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      status = response.status;
      if (!response.ok) {
        // Do not include provider bodies: they can echo private inputs.
        await response.body?.cancel();
        throw new IndexProviderError(status);
      }
      return await response.json() as T;
    } catch (error) {
      const transportFailure = error instanceof Error &&
        ["TypeError", "TimeoutError", "AbortError"].includes(error.name);
      const retryable = status === undefined || (status >= 200 && status < 300)
        ? transportFailure
        : status === 408 || status === 429 || status >= 500;
      const fields = { attempt, status, error_type: error instanceof Error ? error.name : "unknown", error_code: transportCode(error) };
      if (!retryable || attempt === 3) {
        logger.error(fields, "index provider request failed");
        throw error;
      }
      logger.warn(fields, "index provider request retrying");
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("Candidate index provider exhausted retries");
}
