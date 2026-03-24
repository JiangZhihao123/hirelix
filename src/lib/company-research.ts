import { load } from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getOutboundProxySettings } from "@/lib/server-outbound-proxy";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; HirelixBot/1.0; +https://hirelix.app)";
const PAGE_FETCH_TIMEOUT_MS = 8000;
const MAX_PAGE_BODY_CHARS = 3500;
const MAX_TOTAL_BODY_CHARS = 9000;
const MIN_EVIDENCE_CHARS = 600;
const execFileAsync = promisify(execFile);
const SITEMAP_PRIORITY_KEYWORDS = [
  "about",
  "company",
  "what-we-do",
  "culture",
  "careers",
  "jobs",
  "team",
  "mission",
  "profile",
  "overview",
];
const CLIENT_HINT_KEYWORDS = [
  "about",
  "mission",
  "culture",
  "business",
  "company",
  "careers",
  "team",
  "profile",
  "what we do",
  "who we are",
  "create value",
  "investment bank",
];

export type CompanyResearchMode =
  | "website_evidence"
  | "fallback_domain_inference";

export type CompanyEvidencePage = {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  bodyText: string;
};

export type CompanyEvidencePacket = {
  baseUrl: string;
  pages: CompanyEvidencePage[];
  totalBodyChars: number;
};

function trimToEmpty(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function hostMatches(baseHost: string, candidateHost: string) {
  return (
    candidateHost === baseHost ||
    candidateHost.endsWith(`.${baseHost}`) ||
    baseHost.endsWith(`.${candidateHost}`)
  );
}

export function normalizeCompanyUrl(input: string) {
  const trimmed = input.trim();
  const candidate =
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https websites are supported");
  }
  url.hash = "";
  return url;
}

export function buildCandidatePageUrls(baseUrl: URL) {
  const paths = ["/", "/about", "/company", "/careers", "/jobs", "/team"];
  return paths.map((path) => new URL(path, baseUrl).toString());
}

function dedupeUrls(urls: string[]) {
  return Array.from(new Set(urls));
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isSameCompanyHost(base: URL, candidate: URL) {
  return hostMatches(
    normalizeHostname(base.hostname),
    normalizeHostname(candidate.hostname),
  );
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithCurl(url: string) {
  try {
    const { proxyUrl } = getOutboundProxySettings();
    const args = [
      "-L",
      "--silent",
      "--show-error",
      "--max-time",
      String(Math.ceil(PAGE_FETCH_TIMEOUT_MS / 1000)),
      "--user-agent",
      DEFAULT_USER_AGENT,
      ...(proxyUrl ? ["--proxy", proxyUrl] : []),
      url,
    ];

    const { stdout } = await execFileAsync("curl", args);
    return stdout;
  } catch {
    return null;
  }
}

async function fetchTextResource(url: string) {
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return fetchWithCurl(url);
  }
}

function extractClientBundleUrls(html: string, pageUrl: string, baseUrl: URL) {
  const $ = load(html);
  const urls = [
    ...$("script[src]")
      .map((_, el) => $(el).attr("src"))
      .get(),
    ...$('link[rel="modulepreload"][href]')
      .map((_, el) => $(el).attr("href"))
      .get(),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value, pageUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      try {
        const parsed = new URL(value);
        return isSameCompanyHost(baseUrl, parsed) && parsed.pathname.endsWith(".js");
      } catch {
        return false;
      }
    });

  return dedupeUrls(urls).slice(0, 2);
}

function extractInterestingStringsFromJs(jsText: string) {
  const matches = jsText.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g) || [];
  const candidates = matches
    .map((raw) => raw.slice(1, -1).replace(/\\n/g, " ").replace(/\\"/g, "\"").replace(/\\'/g, "'"))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 12 && value.length <= 220)
    .filter((value) => /[A-Za-z\u4e00-\u9fff]/.test(value))
    .filter((value) => !/^https?:\/\//i.test(value))
    .filter((value) =>
      CLIENT_HINT_KEYWORDS.some((keyword) => value.toLowerCase().includes(keyword)),
    );

  return dedupeStrings(candidates).slice(0, 20);
}

async function fetchClientRenderedHints(
  html: string,
  pageUrl: string,
  baseUrl: URL,
) {
  const bundleUrls = extractClientBundleUrls(html, pageUrl, baseUrl);
  const hints: string[] = [];

  for (const bundleUrl of bundleUrls) {
    const jsText = await fetchTextResource(bundleUrl);
    if (!jsText) continue;
    hints.push(...extractInterestingStringsFromJs(jsText));
    if (hints.length >= 12) break;
  }

  return dedupeStrings(hints).slice(0, 12);
}

function parseSitemapText(text: string, baseUrl: URL) {
  const urls = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http://") || line.startsWith("https://"))
    .filter((line) => {
      try {
        return isSameCompanyHost(baseUrl, new URL(line));
      } catch {
        return false;
      }
    });

  const priority = urls
    .filter((url) =>
      SITEMAP_PRIORITY_KEYWORDS.some((keyword) =>
        url.toLowerCase().includes(keyword),
      ),
    )
    .slice(0, 8);
  const remainder = urls.filter((url) => !priority.includes(url)).slice(0, 8);
  return [...priority, ...remainder];
}

async function fetchSitemapUrls(baseUrl: URL) {
  const robotUrl = new URL("/robots.txt", baseUrl).toString();
  const robots = await fetchTextResource(robotUrl);
  const declaredSitemaps =
    robots
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^sitemap:/i.test(line))
      .map((line) => line.replace(/^sitemap:/i, "").trim()) || [];

  const fallbackSitemaps = [
    new URL("/sitemap.txt", baseUrl).toString(),
    new URL("/sitemap.xml", baseUrl).toString(),
  ];
  const sitemapUrls = dedupeUrls([...declaredSitemaps, ...fallbackSitemaps]).slice(0, 4);

  const discovered: string[] = [];
  for (const sitemapUrl of sitemapUrls) {
    const text = await fetchTextResource(sitemapUrl);
    if (!text) continue;
    discovered.push(...parseSitemapText(text, baseUrl));
    if (discovered.length >= 12) break;
  }

  return dedupeUrls(discovered).slice(0, 12);
}

export async function fetchCompanyPage(baseUrl: URL, url: string) {
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;

    const finalUrl = new URL(response.url);
    if (!isSameCompanyHost(baseUrl, finalUrl)) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const html = await response.text();
    return {
      url: finalUrl.toString(),
      html,
    };
  } catch {
    const html = await fetchWithCurl(url);
    if (!html) return null;
    return {
      url,
      html,
    };
  }
}

export function extractReadableCompanyText(html: string, url: string): CompanyEvidencePage | null {
  const $ = load(html);

  $("script, style, noscript, iframe, svg").remove();
  $("nav, footer, form, aside").remove();

  const title = trimToEmpty($("title").first().text());
  const metaDescription = trimToEmpty(
    $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content"),
  );
  const headings = $("h1, h2")
    .slice(0, 8)
    .map((_, el) => trimToEmpty($(el).text()))
    .get()
    .filter(Boolean);

  const bodySource = $("main").text() || $("body").text();
  const bodyText = trimToEmpty(bodySource).slice(0, MAX_PAGE_BODY_CHARS);

  if (!title && !metaDescription && !headings.length && bodyText.length < 120) {
    return null;
  }

  return {
    url,
    title,
    metaDescription,
    headings,
    bodyText,
  };
}

export async function collectCompanyEvidence(
  baseUrl: URL,
): Promise<CompanyEvidencePacket | null> {
  const sitemapUrls = await fetchSitemapUrls(baseUrl);
  const candidateUrls = dedupeUrls([
    ...buildCandidatePageUrls(baseUrl),
    ...sitemapUrls,
  ]);
  const pages: CompanyEvidencePage[] = [];
  let totalBodyChars = 0;

  for (const url of candidateUrls) {
    if (pages.length >= 4 || totalBodyChars >= MAX_TOTAL_BODY_CHARS) break;

    const fetched = await fetchCompanyPage(baseUrl, url);
    if (!fetched) continue;

    const extracted = extractReadableCompanyText(fetched.html, fetched.url);
    if (!extracted) continue;

    let hintText = "";
    if (extracted.bodyText.length < 160) {
      const hints = await fetchClientRenderedHints(fetched.html, fetched.url, baseUrl);
      hintText = hints.join(" ");
    }

    const remainingChars = Math.max(MAX_TOTAL_BODY_CHARS - totalBodyChars, 0);
    const bodyText = `${extracted.bodyText} ${hintText}`.trim().slice(0, remainingChars);
    const page = {
      ...extracted,
      bodyText,
    };
    if (page.bodyText.length < 120 && !page.metaDescription && page.headings.length === 0) {
      continue;
    }

    pages.push(page);
    totalBodyChars += page.bodyText.length;
  }

  const hasStructuredSignals = pages.some(
    (page) => page.title || page.metaDescription || page.headings.length > 0,
  );

  if (!pages.length || (!hasStructuredSignals && totalBodyChars < MIN_EVIDENCE_CHARS)) {
    return null;
  }

  return {
    baseUrl: baseUrl.toString(),
    pages,
    totalBodyChars,
  };
}
