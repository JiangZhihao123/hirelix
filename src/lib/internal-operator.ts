const DEFAULT_INTERNAL_PROFILE_SCAN_BUDGET = 500;

type InternalOperatorEnv = Record<string, string | undefined>;

export function getInternalOperatorEmails(env: InternalOperatorEnv = process.env) {
  return new Set(
    (env.HIRELIX_INTERNAL_OPERATOR_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isInternalOperatorEmail(
  email: string | null | undefined,
  env: InternalOperatorEnv = process.env,
) {
  return Boolean(email && getInternalOperatorEmails(env).has(email.trim().toLowerCase()));
}

export function getInternalProfileScanBudget(env: InternalOperatorEnv = process.env) {
  const parsed = Number.parseInt(env.HIRELIX_INTERNAL_PROFILE_SCAN_BUDGET || "", 10);
  return Number.isFinite(parsed)
    ? Math.max(50, Math.min(2_000, parsed))
    : DEFAULT_INTERNAL_PROFILE_SCAN_BUDGET;
}
