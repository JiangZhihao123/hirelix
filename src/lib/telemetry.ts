/** Shared, content-free first-party telemetry contract. Never collect form values. */
export const TELEMETRY_VERSION = 2;
export const TELEMETRY_EVENTS = new Set([
  "page_view",
  "session_summary",
  "section_view",
  "navigation_click",
  "ui_action",
  "product_action_success",
  "product_action_failed",
  "client_error",
  "web_vital",
  "document_view",
  "document_export",
  "document_copy",
]);
const strings = new Set([
  "traffic_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "device_type",
  "page_variant",
  "entry_mode",
  "intent_path",
  "section_id",
  "action",
  "method",
  "outcome",
  "metric",
  "visibility_state",
  "route",
  "endpoint",
  "destination",
  "format",
  "cta_location",
  "plan",
  "billing_cycle",
]);
const numbers = new Set([
  "page_stay_seconds",
  "active_read_seconds",
  "max_scroll_depth",
  "interaction_count",
  "duration_ms",
  "status",
  "value",
  "viewport_width",
  "viewport_height",
]);
export function telemetryRoute(value: string) {
  try {
    const url = new URL(value, "https://hirelix.online");
    if (!["http:", "https:"].includes(url.protocol)) return "/external-action";
    const path = url.pathname;
    if (path.startsWith("/ops")) return "/ops";
    if (/^\/(recommendation|invite|go|o)\//.test(path))
      return `/${path.split("/")[1]}/:token`;
    return path
      .split("/")
      .map((part) =>
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) || part.length > 64
          ? ":id"
          : part,
      )
      .join("/")
      .slice(0, 240);
  } catch {
    return "/unknown";
  }
}
export function telemetryMetadata(input: Record<string, unknown>) {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (strings.has(key) && typeof value === "string") {
      result[key] = ["route", "endpoint", "destination"].includes(key)
        ? telemetryRoute(value)
        : value.slice(0, 120);
    } else if (
      numbers.has(key) &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      result[key] = Math.max(0, Math.min(value, 86400000));
    }
  }
  return result;
}
export function telemetryReferrer(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
export function telemetryBot(ua: string) {
  return /bot\b|crawler|spider|headless|preview|facebookexternalhit|slurp/i.test(
    ua,
  );
}
