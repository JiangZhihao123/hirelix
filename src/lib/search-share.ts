import { createHash, randomBytes } from "node:crypto";

export const DEFAULT_SHARED_CANDIDATE_LIMIT = 50;

export function createSearchShareToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSearchShareToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidSearchShareToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
