function normalizeWhitespace(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

export function sanitizeDisplayName(value: string | null | undefined) {
  if (typeof value !== "string") return "Unknown";

  const normalized = normalizeWhitespace(
    value
      .normalize("NFKC")
      .replace(/\uFFFD/gu, "")
      .replace(/[\u0000-\u001F\u007F-\u009F]/gu, " "),
  );

  const withoutDecorativePrefix = normalized.replace(/^[^\p{L}\p{N}]+/gu, "").trim();
  const cleaned = withoutDecorativePrefix.replace(/[.,;]+$/gu, "").trim();

  return cleaned || normalized || "Unknown";
}

export function getDisplayNameInitials(value: string | null | undefined) {
  const displayName = sanitizeDisplayName(value);
  const parts = displayName.split(/\s+/u).filter(Boolean);

  if (parts.length === 0) return "?";

  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join("").toUpperCase() || "?";
  }

  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase() || "?";
}

export function getDisplayNameColorSeed(value: string | null | undefined) {
  const displayName = sanitizeDisplayName(value);
  return Array.from(displayName).reduce(
    (total, char) => total + (char.codePointAt(0) ?? 0),
    0,
  );
}
