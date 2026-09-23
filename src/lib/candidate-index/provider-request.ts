import { getLogger } from "@/lib/logger";

const logger = getLogger({ component: "candidate_index_provider" });

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
        throw new Error(`Candidate index provider failed (${status})`);
      }
      return await response.json() as T;
    } catch (error) {
      const transportFailure = error instanceof Error &&
        ["TypeError", "TimeoutError", "AbortError"].includes(error.name);
      const retryable = status === undefined || (status >= 200 && status < 300)
        ? transportFailure
        : status === 408 || status === 429 || status >= 500;
      if (!retryable || attempt === 3) throw error;
      logger.warn({ attempt, status, error_type: error instanceof Error ? error.name : "unknown" }, "index provider request retrying");
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("Candidate index provider exhausted retries");
}
