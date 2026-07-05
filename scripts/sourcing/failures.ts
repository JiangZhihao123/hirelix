export type ProviderFailureType =
  | "none"
  | "auth_failure"
  | "rate_limit"
  | "timeout"
  | "bad_query"
  | "budget_blocked"
  | "no_result"
  | "provider_unavailable"
  | "provider_error"
  | "parse_error"
  | "unknown";

export function classifyProviderFailure(error: unknown): ProviderFailureType {
  const message = error instanceof Error ? error.message : String(error);
  return classifyFailureMessage(message);
}

export function classifyFailureMessage(message: string | null | undefined): ProviderFailureType {
  const value = (message || "").toLowerCase();
  if (!value) return "none";
  if (value.includes("budget exceeded") || value.includes("paid provider call blocked")) {
    return "budget_blocked";
  }
  if (value.includes("api key") || value.includes("authorization") || value.includes("unauthorized") || value.includes("403") || value.includes("401")) {
    return "auth_failure";
  }
  if (value.includes("429") || value.includes("rate limit") || value.includes("too many requests")) {
    return "rate_limit";
  }
  if (value.includes("timed out") || value.includes("timeout") || value.includes("aborted")) {
    return "timeout";
  }
  if (value.includes("400") || value.includes("422") || value.includes("bad query") || value.includes("invalid query")) {
    return "bad_query";
  }
  if (value.includes("404") || value.includes("not found")) {
    return "no_result";
  }
  if (value.includes("502") || value.includes("503") || value.includes("504") || value.includes("unavailable")) {
    return "provider_unavailable";
  }
  if (value.includes("syntaxerror") || value.includes("json") || value.includes("parse")) {
    return "parse_error";
  }
  return "provider_error";
}
