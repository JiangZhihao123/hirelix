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
    if (item instanceof Date || (typeof item === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(item))) {
      const date = new Date(item);
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
