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
  const groups = groupLeadsByIdentity(dedupeLeadsByUrl(leads));
  return groups.slice(0, limit).map((group, index) => {
    const primary = group.leads[0]!;
    const parsedName = inferNameFromTitle(primary.title);
    return {
      candidate_id: `candidate-${String(index + 1).padStart(3, "0")}`,
      identity_key: group.identityKey,
      identity_confidence: group.confidence,
      name: parsedName,
      headline: cleanTitle(primary.title),
      location: null,
      profile_urls: uniqueStrings(group.leads.map((lead) => lead.url)),
      evidence_summary: group.leads
        .map((lead) => [lead.title, lead.snippet].filter(Boolean).join("\n"))
        .filter(Boolean)
        .join("\n\n"),
      source_mix: uniqueProviders(group.leads.map((lead) => lead.provider)),
      lead_ids: group.leads.map((lead) => lead.lead_id),
    };
  });
}

function groupLeadsByIdentity(leads: CandidateLead[]) {
  const groups = new Map<string, {
    identityKey: string;
    confidence: NonNullable<CandidateCard["identity_confidence"]>;
    leads: CandidateLead[];
  }>();
  for (const lead of leads) {
    const identity = identityForLead(lead);
    const existing = groups.get(identity.key);
    if (existing) {
      existing.leads.push(lead);
      if (identity.confidence === "strong") existing.confidence = "strong";
      continue;
    }
    groups.set(identity.key, {
      identityKey: identity.key,
      confidence: identity.confidence,
      leads: [lead],
    });
  }
  return Array.from(groups.values());
}

function identityForLead(lead: CandidateLead) {
  const normalizedUrl = normalizeUrl(lead.url);
  const linkedIn = linkedInIdentity(normalizedUrl);
  if (linkedIn) return { key: `linkedin:${linkedIn}`, confidence: "strong" as const };
  const github = githubIdentity(normalizedUrl);
  if (github) return { key: `github:${github}`, confidence: "strong" as const };
  const name = normalizeName(inferNameFromTitle(lead.title));
  const companyOrTitle = normalizeName(cleanTitle(lead.title));
  if (name && companyOrTitle) {
    return { key: `weak:${name}:${companyOrTitle.slice(0, 80)}`, confidence: "weak" as const };
  }
  return { key: `url:${normalizedUrl}`, confidence: "single_source" as const };
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

function linkedInIdentity(normalizedUrl: string) {
  try {
    const parsed = new URL(normalizedUrl);
    if (!parsed.hostname.endsWith("linkedin.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const inIndex = parts.findIndex((part) => part.toLowerCase() === "in");
    return inIndex >= 0 && parts[inIndex + 1] ? parts[inIndex + 1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function githubIdentity(normalizedUrl: string) {
  try {
    const parsed = new URL(normalizedUrl);
    if (!parsed.hostname.endsWith("github.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0]?.toLowerCase() || null;
  } catch {
    return null;
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeName(value: string | null) {
  return value
    ?.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
