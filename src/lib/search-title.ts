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

function cleanCandidateTitle(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\b(?:about\s+(?:the\s+)?company|about\s+us|who\s+we\s+are|what\s+you(?:'|’)ll\s+do|what\s+we(?:'|’)re\s+looking\s+for)\b.*$/i, "")
    .replace(/\b(?:we\s+are|we(?:'|’)re)\s+(?:hiring|looking\s+for|seeking)\b.*$/i, "")
    .replace(/\s*[-|:]\s*$/, "")
    .trim();
}

function looksLikeRoleTitle(value: string) {
  const normalized = cleanCandidateTitle(value);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (!normalized || wordCount > 8) return false;
  if (/^(about|company|location|requirements|responsibilities|nice to have|compensation)\b/i.test(normalized)) {
    return false;
  }

  return /\b(engineer|developer|manager|designer|scientist|analyst|architect|specialist|recruiter|marketer|operator|director|lead|head)\b/i.test(normalized);
}

function isNoisyStoredTitle(value: string) {
  return /\b(?:about\s+(?:the\s+)?company|we(?:'|’)re\s+hiring|what\s+you(?:'|’)ll\s+do|what\s+we(?:'|’)re\s+looking\s+for)\b/i.test(value);
}

export function extractLikelyTitleFromJdText(jdText: string) {
  const proseSource = jdText.replace(/\s+/g, " ").trim();
  const roleIntroPatterns = [
    /\b(?:we\s+are|we're)?\s*(?:hiring|looking\s+for|seeking)\s+(?:an?|our\s+next)\s+(.{4,80}?)\s+(?:to|who|for|with|based|located|in)\b/i,
    /^\s*(.{4,80}?)\s+(?:to|who|for|with|based|located|in)\b/i,
  ];

  const lines = jdText
    .split("\n")
    .map((line) => line.replace(/[#*`>-]/g, " ").trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 8)) {
    if (line.length < 4 || line.length > 90) continue;
    if (/^(location|company|about|requirements|responsibilities|nice to have|compensation)\s*:/i.test(line)) {
      continue;
    }

    const compactLine = cleanCandidateTitle(line.split(/[|:-]/)[0] || line);
    if (looksLikeRoleTitle(compactLine)) {
      return normalizeTitle(compactLine);
    }
  }

  for (const pattern of roleIntroPatterns) {
    const match = proseSource.match(pattern);
    const candidate = cleanCandidateTitle(match?.[1]?.trim() || "");
    if (candidate && looksLikeRoleTitle(candidate)) {
      return normalizeTitle(candidate);
    }
  }

  for (const line of lines.slice(0, 12)) {
    if (line.length < 4 || line.length > 90) continue;
    if (/^(location|company|about|requirements|responsibilities|nice to have|compensation)\s*:/i.test(line)) {
      continue;
    }
    return normalizeTitle(cleanCandidateTitle(line));
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
  if (directTitle && !isNoisyStoredTitle(directTitle)) return directTitle;

  const parsedTitle = typeof params.parsedRequirements?.title === "string"
    ? params.parsedRequirements.title.trim()
    : "";
  if (parsedTitle) return parsedTitle;

  return params.fallback || "New shortlist";
}
