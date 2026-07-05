import type { CandidateCard, CandidateLead, ProviderName } from "./types";

export function dedupeLeadsByUrl(leads: CandidateLead[]) {
  const seen = new Map<string, CandidateLead>();
  for (const lead of leads) {
    const key = normalizeUrl(lead.url);
    if (!seen.has(key)) {
      seen.set(key, lead);
      continue;
    }
    const existing = seen.get(key)!;
    seen.set(key, {
      ...existing,
      snippet: existing.snippet || lead.snippet,
      title: existing.title || lead.title,
      raw: {
        ...existing.raw,
        duplicate_from: [
          ...asStringArray(existing.raw.duplicate_from),
          lead.lead_id,
        ],
      },
    });
  }
  return Array.from(seen.values());
}

export function buildCandidateCards(leads: CandidateLead[], limit = 30): CandidateCard[] {
  return dedupeLeadsByUrl(leads).slice(0, limit).map((lead, index) => {
    const parsedName = inferNameFromTitle(lead.title);
    return {
      candidate_id: `candidate-${String(index + 1).padStart(3, "0")}`,
      name: parsedName,
      headline: cleanTitle(lead.title),
      location: null,
      profile_urls: [lead.url],
      evidence_summary: [lead.title, lead.snippet].filter(Boolean).join("\n"),
      source_mix: uniqueProviders([lead.provider]),
      lead_ids: [lead.lead_id],
    };
  });
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

function inferNameFromTitle(title: string | null) {
  if (!title) return null;
  const cleaned = title
    .replace(/\s+\|\s+LinkedIn.*$/i, "")
    .replace(/\s+-\s+LinkedIn.*$/i, "")
    .replace(/\s+\|\s+GitHub.*$/i, "")
    .trim();
  if (!cleaned || cleaned.length > 80) return null;
  const firstPart = cleaned.split(/[|–—-]/)[0]?.trim();
  return firstPart || null;
}

function cleanTitle(title: string | null) {
  if (!title) return null;
  return title.replace(/\s+/g, " ").trim() || null;
}

function uniqueProviders(providers: ProviderName[]) {
  return Array.from(new Set(providers));
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
