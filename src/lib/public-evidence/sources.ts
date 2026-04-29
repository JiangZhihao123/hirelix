import type { PublicEvidenceSourceType } from "./types";

const BLOG_HOST_PATTERNS = [
  "medium.com",
  "dev.to",
  "hashnode.dev",
  "substack.com",
];

const PACKAGE_HOST_PATTERNS = [
  "npmjs.com",
  "pypi.org",
  "crates.io",
  "packagist.org",
  "rubygems.org",
  "mvnrepository.com",
];

const PAPER_HOST_PATTERNS = [
  "arxiv.org",
  "openreview.net",
  "scholar.google.com",
  "semanticscholar.org",
  "researchgate.net",
  "dblp.org",
  "aclanthology.org",
  "proceedings.mlr.press",
  "neurips.cc",
  "acm.org",
  "ieee.org",
  "usenix.org",
  "biorxiv.org",
  "medrxiv.org",
  "nature.com",
  "springer.com",
  "sciencedirect.com",
];

const TALK_HOST_PATTERNS = [
  "youtube.com",
  "youtu.be",
  "slideshare.net",
  "speakerdeck.com",
  "confreaks.tv",
];

export function normalizeEvidenceUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function hostIncludes(host: string, patterns: string[]) {
  return patterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
}

export function classifyPublicEvidenceSource(url: string): PublicEvidenceSourceType | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();

    if (host === "github.com" || host === "gist.github.com") return "github";
    if (host === "stackoverflow.com") return "stackoverflow";
    if (hostIncludes(host, PACKAGE_HOST_PATTERNS)) return "package_registry";
    if (hostIncludes(host, PAPER_HOST_PATTERNS)) return "paper";
    if (hostIncludes(host, TALK_HOST_PATTERNS)) return "talk";
    if (hostIncludes(host, BLOG_HOST_PATTERNS)) return "technical_blog";
    if (host.includes("engineering") || path.includes("/engineering") || path.includes("/blog")) {
      return "company_engineering_blog";
    }
    if (path.includes("portfolio") || path.includes("projects")) return "portfolio";
    if (
      host.includes("linkedin.com") ||
      host.includes("about.me") ||
      host.includes("read.cv") ||
      host.includes("wellfound.com")
    ) {
      return "other_professional";
    }
    if (!host.includes("google.") && !host.includes("facebook.com") && !host.includes("x.com")) {
      return "personal_site";
    }
    return null;
  } catch {
    return null;
  }
}

export function isLikelyUsefulPublicEvidenceUrl(url: string) {
  const type = classifyPublicEvidenceSource(url);
  if (!type) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("linkedin.com/in/")) return true;
    if (host.includes("linkedin.com")) return false;
    return true;
  } catch {
    return false;
  }
}
