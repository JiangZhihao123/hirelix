export type PublicProfileLinks = {
  github_urls: string[];
  personal_sites: string[];
  developer_profiles: string[];
  source_fields: string[];
};

const DEVELOPER_PROFILE_HOSTS = [
  "stackoverflow.com",
  "stackexchange.com",
  "dev.to",
  "medium.com",
  "hashnode.dev",
  "gitlab.com",
  "bitbucket.org",
];

const NON_PERSONAL_SITE_HOSTS = [
  "linkedin.com",
  "github.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "google.com",
  "bing.com",
  "microsoft.com",
  "apple.com",
];

function compactStringArray(values: Array<string | null | undefined>, maxItems: number) {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

const RESERVED_GITHUB_PATHS = new Set([
  "about",
  "account",
  "apps",
  "blog",
  "collections",
  "contact",
  "dashboard",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "gists",
  "github",
  "home",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "repositories",
  "search",
  "security",
  "settings",
  "signup",
  "site",
  "sponsors",
  "stars",
  "topics",
  "trending",
  "users",
]);

function extractGithubOwnerCandidateFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com" && host !== "gist.github.com") {
      return null;
    }
    const owner = parsed.pathname.split("/").filter(Boolean)[0];
    if (!owner || RESERVED_GITHUB_PATHS.has(owner.toLowerCase())) return null;
    return /^[A-Za-z0-9-]+$/.test(owner) ? owner : null;
  } catch {
    return null;
  }
}

function normalizeUrl(value: string) {
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function hostIncludes(hostname: string, needles: string[]) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return needles.some((needle) => normalized === needle || normalized.endsWith(`.${needle}`));
}

function collectTextValues(value: unknown, path: string, out: Array<{ path: string; text: string }>) {
  if (typeof value === "string") {
    if (value.trim()) out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectTextValues(entry, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      collectTextValues(entry, path ? `${path}.${key}` : key, out);
    }
  }
}

function extractUrlsFromText(text: string) {
  const matches = text.match(/https?:\/\/[^\s"'<>),;]+|www\.[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'<>),;]*)?/gi) || [];
  return compactStringArray(
    matches
      .map((match) => normalizeUrl(match.replace(/[.!?]+$/, "")))
      .filter((value): value is string => Boolean(value)),
    50,
  );
}

export function extractPublicProfileLinks(input: unknown): PublicProfileLinks {
  const textValues: Array<{ path: string; text: string }> = [];
  collectTextValues(input, "", textValues);

  const githubUrls: string[] = [];
  const personalSites: string[] = [];
  const developerProfiles: string[] = [];
  const sourceFields: string[] = [];

  for (const item of textValues) {
    for (const url of extractUrlsFromText(item.text)) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }

      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (hostname === "github.com" || hostname === "gist.github.com") {
        if (extractGithubOwnerCandidateFromUrl(url)) {
          githubUrls.push(url);
          sourceFields.push(item.path || "root");
        }
        continue;
      }

      if (hostIncludes(hostname, DEVELOPER_PROFILE_HOSTS)) {
        developerProfiles.push(url);
        sourceFields.push(item.path || "root");
        continue;
      }

      if (!hostIncludes(hostname, NON_PERSONAL_SITE_HOSTS)) {
        personalSites.push(url);
        sourceFields.push(item.path || "root");
      }
    }
  }

  return {
    github_urls: compactStringArray(githubUrls, 5),
    personal_sites: compactStringArray(personalSites, 5),
    developer_profiles: compactStringArray(developerProfiles, 8),
    source_fields: compactStringArray(sourceFields, 12),
  };
}

export function mergePublicProfileLinks(...items: Array<PublicProfileLinks | null | undefined>): PublicProfileLinks {
  return {
    github_urls: compactStringArray(items.flatMap((item) => item?.github_urls || []), 8),
    personal_sites: compactStringArray(items.flatMap((item) => item?.personal_sites || []), 8),
    developer_profiles: compactStringArray(items.flatMap((item) => item?.developer_profiles || []), 12),
    source_fields: compactStringArray(items.flatMap((item) => item?.source_fields || []), 16),
  };
}
