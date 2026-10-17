/** Diagnostic metadata only: database wrappers include SQL parameters and
 * provider errors can embed credentials or source documents in their messages. */
export function workErrorDiagnostics(error: unknown) {
  const causes: Array<{ type: string; code?: string; reason?: string; frames: string[] }> = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current) && causes.length < 5) {
    seen.add(current);
    const code = (current as Error & { code?: unknown }).code;
    const safeCode = typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code) ? code : undefined;
    causes.push({
      type: /^[A-Za-z0-9_]{1,80}$/.test(current.name) ? current.name : "Error",
      code: safeCode,
      reason: safeCode === "22021" ? "Database rejected text encoding (including unsupported NUL characters)" : undefined,
      // Exclude the message/header and keep only source locations, not values.
      frames: (current.stack ?? "").split("\n").flatMap(line => {
        const location = line.match(/(?:\/src\/|\/node_modules\/)[\w./@-]+:\d+:\d+/);
        return location ? [location[0]] : [];
      }).slice(0, 6),
    });
    current = current.cause;
  }
  return { error_causes: causes };
}
