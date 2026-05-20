export function sanitizeJsonbString(value: string) {
  return value.replace(/\u0000/g, "").replace(/\\u0000/gi, "");
}

export function toJsonbSafeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string") return sanitizeJsonbString(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (Array.isArray(value)) return value.map(toJsonbSafeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        sanitizeJsonbString(key),
        toJsonbSafeValue(entry),
      ]),
    );
  }
  return String(value);
}

export function toJsonbSafeRecord(value: unknown): Record<string, unknown> {
  const normalized = toJsonbSafeValue(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return {};
  try {
    const serialized = JSON.stringify(normalized);
    if (!serialized) return {};
    const jsonbSafeText = sanitizeJsonbString(serialized);
    const reparsed = JSON.parse(jsonbSafeText);
    return reparsed && typeof reparsed === "object" && !Array.isArray(reparsed)
      ? (reparsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
