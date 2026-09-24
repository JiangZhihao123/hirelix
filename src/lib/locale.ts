export type Locale = "en" | "zh";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}

export function localeLabel(value: Locale) {
  return value === "zh" ? "中文" : "English";
}
