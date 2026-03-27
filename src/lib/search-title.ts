export function getSearchDisplayTitle(params: {
  title?: string | null;
  parsedRequirements?: Record<string, unknown> | null;
  fallback?: string;
}) {
  const directTitle = params.title?.trim();
  if (directTitle) return directTitle;

  const parsedTitle = typeof params.parsedRequirements?.title === "string"
    ? params.parsedRequirements.title.trim()
    : "";
  if (parsedTitle) return parsedTitle;

  return params.fallback || "New sourcing task";
}
