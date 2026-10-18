// Add presentation evidence at the model boundary; stored facts and tool receipts
// remain unchanged. Only structured timestamps are converted, never source prose
// or date-only facts.
export function localTimeEvidence(value: unknown, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const times: Record<string, string> = {};
  function visit(item: unknown, path: string) {
    const timestamp = typeof item === "string"
      ? /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(item)
      : null;
    if (item instanceof Date || timestamp) {
      // Drizzle raw rows retain PostgreSQL's space separator, microseconds and
      // short offsets (+08); normalize those explicitly before Date parsing.
      const offset = timestamp?.[4];
      const normalizedOffset = offset?.length === 3 ? `${offset}:00`
        : offset?.length === 5 ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset;
      const date = item instanceof Date ? item : new Date(
        `${timestamp![1]}T${timestamp![2]}${timestamp![3]?.slice(0, 4) || ""}${normalizedOffset}`,
      );
      if (Number.isFinite(date.getTime())) times[path] = `${formatter.format(date)} (${timezone})`;
    } else if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    } else if (item && typeof item === "object") {
      for (const [key, entry] of Object.entries(item)) visit(entry, path ? `${path}.${key}` : key);
    }
  }
  visit(value, "");
  return times;
}
