import { createHash, randomBytes } from "node:crypto";

const REDEMPTION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REDEMPTION_PREFIX = "HIRELIX-BETA";

export function normalizeRedemptionCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[\s_]+/g, "-");
  if (!/^HIRELIX-BETA-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalized)) return null;
  return normalized;
}

export function hashRedemptionCode(code: string) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function getRedemptionCodePrefix(code: string) {
  return code.slice(0, -5);
}

export function generateRedemptionCode() {
  const bytes = randomBytes(8);
  const token = Array.from(bytes, (byte) => REDEMPTION_ALPHABET[byte % REDEMPTION_ALPHABET.length]).join("");
  return `${REDEMPTION_PREFIX}-${token.slice(0, 4)}-${token.slice(4)}`;
}

export function addRedemptionDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}
