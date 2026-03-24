function normalizeTitle(value: string) {
  return value
    .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^(ai|ml|qa|ui|ux|sre|ios)$/i.test(word)) return word.toUpperCase();
      if (/^node\.js$/i.test(word)) return "Node.js";
      if (/^typescript$/i.test(word)) return "TypeScript";
      if (/^javascript$/i.test(word)) return "JavaScript";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function extractLikelyTitleFromJdText(jdText: string) {
  const proseSource = jdText.replace(/\s+/g, " ").trim();
  const roleIntroPatterns = [
    /\b(?:we\s+are|we're)?\s*(?:hiring|looking\s+for|seeking)\s+(?:an?|our\s+next)\s+(.{4,80}?)\s+(?:to|who|for|with|based|located|in)\b/i,
    /^\s*(.{4,80}?)\s+(?:to|who|for|with|based|located|in)\b/i,
  ];
  const looksLikeRoleTitle = (value: string) =>
    /\b(engineer|developer|manager|designer|scientist|analyst|architect|specialist|recruiter|marketer|operator|director|lead|head)\b/i.test(value);

  for (const pattern of roleIntroPatterns) {
    const match = proseSource.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && looksLikeRoleTitle(candidate)) {
      return normalizeTitle(candidate);
    }
  }

  const lines = jdText
    .split("\n")
    .map((line) => line.replace(/[#*`>-]/g, " ").trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 12)) {
    if (line.length < 4 || line.length > 90) continue;
    if (/^(location|company|about|requirements|responsibilities|nice to have|compensation)\s*:/i.test(line)) {
      continue;
    }
    return normalizeTitle(line);
  }

  return null;
}

export function getSearchDisplayTitle(params: {
  title?: string | null;
  jdText?: string | null;
  parsedRequirements?: Record<string, unknown> | null;
  fallback?: string;
}) {
  const directTitle = params.title?.trim();
  if (directTitle) return directTitle;

  const parsedTitle = typeof params.parsedRequirements?.title === "string"
    ? params.parsedRequirements.title.trim()
    : "";
  if (parsedTitle) return parsedTitle;

  const inferred = params.jdText ? extractLikelyTitleFromJdText(params.jdText) : null;
  return inferred || params.fallback || "Untitled shortlist";
}
