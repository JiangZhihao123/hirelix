import { createHash } from "node:crypto";

import type { BrightDataExperience, BrightDataProfile } from "@/lib/brightdata";

export type NormalizedExperience = {
  sourceOrdinal: number;
  ref: string;
  title: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  location: string | null;
  description: string | null;
};

export type NormalizedProfile = {
  linkedinId: string | null;
  linkedinUrl: string | null;
  name: string;
  currentTitle: string | null;
  currentCompany: string | null;
  yearsExperience: number | null;
  countryCode: string | null;
  city: string | null;
  highestDegree: string | null;
  schools: string[];
  fieldsOfStudy: string[];
  experiences: NormalizedExperience[];
  rawProfile: BrightDataProfile;
  rawContentHash: string;
};

function normalizeLinkedInUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    url.protocol = "https:";
    url.hostname = "www.linkedin.com";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function parseMonth(value: string) {
  const trimmed = value.trim();
  if (/^(present|current|now)$/i.test(trimmed)) return { date: null, current: true, month: null };
  const yearOnly = trimmed.match(/^(19|20)\d{2}$/);
  if (yearOnly) {
    const year = Number(trimmed);
    return { date: `${year}-01-01`, current: false, month: year * 12 };
  }
  const parsed = Date.parse(`1 ${trimmed}`);
  if (!Number.isFinite(parsed)) return { date: null, current: false, month: null };
  const date = new Date(parsed);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (year < 1950 || year > new Date().getUTCFullYear() + 1) {
    return { date: null, current: false, month: null };
  }
  return {
    date: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    current: false,
    month: year * 12 + month,
  };
}

function parseDuration(duration: string | null) {
  if (!duration) return { startDate: null, endDate: null, isCurrent: false, startMonth: null, endMonth: null };
  const parts = duration.split(/\s+-\s+|\s+to\s+/i);
  if (parts.length < 2) return { startDate: null, endDate: null, isCurrent: false, startMonth: null, endMonth: null };
  const start = parseMonth(parts[0]);
  const end = parseMonth(parts.slice(1).join(" "));
  const currentMonth = new Date().getUTCFullYear() * 12 + new Date().getUTCMonth();
  return {
    startDate: start.date,
    endDate: end.date,
    isCurrent: end.current,
    startMonth: start.month,
    endMonth: end.current ? currentMonth : end.month,
  };
}

function mergeExperienceMonths(experiences: NormalizedExperience[], source: BrightDataExperience[]) {
  const intervals = source
    .map((item) => parseDuration(item.duration))
    .filter((item): item is typeof item & { startMonth: number; endMonth: number } =>
      item.startMonth != null && item.endMonth != null && item.endMonth >= item.startMonth,
    )
    .map((item) => [item.startMonth, item.endMonth] as [number, number])
    .sort((left, right) => left[0] - right[0]);
  if (intervals.length === 0 || experiences.length === 0) return null;
  let months = 0;
  let [start, end] = intervals[0];
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end + 1) end = Math.max(end, nextEnd);
    else { months += end - start + 1; start = nextStart; end = nextEnd; }
  }
  months += end - start + 1;
  return Math.round((months / 12) * 10) / 10;
}

const DEGREE_RANKS: Array<[RegExp, string, number]> = [
  [/ph\.?d|doctor/i, "doctorate", 5],
  [/master|m\.?s\.?|m\.?eng|mba/i, "master", 4],
  [/bachelor|b\.?s\.?|b\.?a\.?|b\.?eng/i, "bachelor", 3],
  [/associate/i, "associate", 2],
  [/high school|secondary/i, "high_school", 1],
];

function highestDegree(profile: BrightDataProfile) {
  let best: { value: string; rank: number } | null = null;
  for (const education of profile.education) {
    const text = [education.degree, education.title].filter(Boolean).join(" ");
    for (const [pattern, value, rank] of DEGREE_RANKS) {
      if (pattern.test(text) && (!best || rank > best.rank)) best = { value, rank };
    }
  }
  return best?.value ?? null;
}

export function normalizeBrightProfile(profile: BrightDataProfile): NormalizedProfile {
  const linkedinUrl = normalizeLinkedInUrl(profile.url || profile.input?.url || null);
  const linkedinId = profile.linkedin_id?.trim() || linkedinUrl?.match(/\/in\/([^/]+)/i)?.[1] || null;
  if (!linkedinId && !linkedinUrl) throw new Error("Bright profile has no LinkedIn identity");
  const experiences = profile.experience.map((experience, sourceOrdinal) => {
    const duration = parseDuration(experience.duration);
    return {
      sourceOrdinal,
      ref: `exp-${sourceOrdinal}`,
      title: experience.title,
      company: experience.company,
      startDate: duration.startDate,
      endDate: duration.endDate,
      isCurrent: duration.isCurrent,
      location: experience.location,
      description: experience.description,
    };
  });
  return {
    linkedinId,
    linkedinUrl,
    name: profile.name,
    currentTitle: profile.current_company?.title || profile.headline,
    currentCompany: profile.current_company?.name || null,
    yearsExperience: mergeExperienceMonths(experiences, profile.experience),
    countryCode: profile.country_code?.toUpperCase() || null,
    city: profile.city,
    highestDegree: highestDegree(profile),
    schools: [...new Set(profile.education.map((item) => item.subtitle || item.title).filter((item): item is string => Boolean(item)))],
    fieldsOfStudy: [...new Set(profile.education.map((item) => item.field_of_study).filter((item): item is string => Boolean(item)))],
    experiences,
    rawProfile: profile,
    rawContentHash: createHash("sha256").update(JSON.stringify(profile)).digest("hex"),
  };
}

export function buildExperienceSearchDocument(experience: NormalizedExperience, semantic?: {
  domain?: string | null;
  responsibilities?: string[];
  technologies?: string[];
}) {
  return [
    `Role: ${experience.title || "Unknown"}`,
    `Company: ${experience.company || "Unknown"}`,
    `Period: ${experience.startDate || "Unknown"} - ${experience.isCurrent ? "Present" : experience.endDate || "Unknown"}`,
    `Location: ${experience.location || "Unknown"}`,
    `Domain: ${semantic?.domain || "Unknown"}`,
    `Responsibilities: ${(semantic?.responsibilities || []).join("; ") || experience.description || "Unknown"}`,
    `Technologies: ${(semantic?.technologies || []).join("; ") || "Unknown"}`,
  ].join("\n");
}

