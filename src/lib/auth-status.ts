export const AUTH_UNAVAILABLE_CODE = "AUTH_SERVICE_UNAVAILABLE";
export const AUTH_UNAVAILABLE_MESSAGE =
  "Sign-in is temporarily unavailable. Please contact support@hirelix.online or try again later.";
export const AUTH_CONNECTION_MESSAGE =
  "We couldn't connect to sign-in. Check your connection and try again.";

class AuthTransportError extends Error {
  constructor() {
    super(AUTH_CONNECTION_MESSAGE);
    this.name = "AuthTransportError";
  }
}

// Classify failures at the fetch boundary, without inspecting exception text or
// treating unrelated TypeErrors in the UI as connection failures.
export const authTransportFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch {
    throw new AuthTransportError();
  }
};
export const AUTH_UNAVAILABLE_PAYLOAD = {
  code: AUTH_UNAVAILABLE_CODE,
  message: AUTH_UNAVAILABLE_MESSAGE,
  error: AUTH_UNAVAILABLE_MESSAGE,
};

export const AUTH_REQUIRED_SETTINGS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

export function missingAuthSettings(env: Record<string, string | undefined>) {
  return AUTH_REQUIRED_SETTINGS.filter((name) => !env[name]?.trim());
}

export class AuthConfigurationError extends Error {
  constructor(public readonly missing: readonly string[]) {
    super(`${missing[0]} is required for authentication.`);
    this.name = "AuthConfigurationError";
  }
}

// better-fetch returns a plain error object, or wraps it in .error when thrown.
// Never display provider details or mistake a server outage for a bad password.
export function authUnavailableMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; status?: unknown; error?: unknown };
  if (error instanceof AuthTransportError || value.error instanceof AuthTransportError) return AUTH_CONNECTION_MESSAGE;
  const nested = value.error && typeof value.error === "object"
    ? value.error as { code?: unknown }
    : null;
  return value.code === AUTH_UNAVAILABLE_CODE || nested?.code === AUTH_UNAVAILABLE_CODE ||
    (typeof value.status === "number" && value.status >= 500)
    ? AUTH_UNAVAILABLE_MESSAGE
    : null;
}
