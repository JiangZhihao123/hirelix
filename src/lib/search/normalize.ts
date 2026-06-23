import { sanitizeDisplayName } from "@/lib/display-name";
import { getLogger } from "@/lib/logger";
import type { CandidateRowInput } from "@/lib/search/types";

const searchLogger = getLogger({ component: "search_pipeline" });

export function nowIso() {
  return new Date().toISOString();
}

export function logSearchEvent(eventName: string, payload: Record<string, unknown>) {
  searchLogger.info({ event: eventName, ...payload });
}

export function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// LinkedIn scraper strips newlines without spaces, leaving "sentence.NextSentence".
// Fix: add a space after sentence-ending punctuation followed by a capital letter.
export function normalizeScrapedDescription(value: unknown): string | null {
  const raw = normalizeNullableString(value);
  if (!raw) return null;
  return raw.replace(/([.!?])([A-Z])/g, "$1 $2");
}

export function normalizeStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const item of value) {
    const normalized = normalizeNullableString(item);
    if (normalized) deduped.add(normalized);
    if (deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

export function normalizeText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^\w\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCandidateRowInput(row: CandidateRowInput): CandidateRowInput {
  return {
    ...row,
    name: sanitizeDisplayName(row.name),
  };
}

export function normalizeExperienceYears(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return null;
}

export function normalizeSummaryTerms(values: string[] | undefined) {
  return [...(values || [])]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort();
}

export function truncateForPrompt(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Job description truncated for prompt length]`;
}

export function normalizeEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}
