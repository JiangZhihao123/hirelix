export function getInternalApiSecret() {
  return (process.env.INTERNAL_API_SECRET || "").trim();
}

export function getInternalApiAuthorizationHeader() {
  const secret = getInternalApiSecret();
  return secret ? `Bearer ${secret}` : null;
}

export function isInternalApiAuthorizationValid(authHeader: string | null) {
  const expected = getInternalApiAuthorizationHeader();
  return Boolean(expected && authHeader === expected);
}
