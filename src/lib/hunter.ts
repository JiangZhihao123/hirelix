/**
 * Hunter.io Email Finder API integration
 *
 * Finds professional email addresses by name + company.
 * Free tier: 25 searches/month, then paid plans.
 *
 * Strategies:
 * 1. Apollo.io people/match (LinkedIn URL)
 * 2. LLM extract company name + domain from profile metadata
 * 3. Hunter domain-search to find company domain
 * 4. Hunter email-finder with domain
 * 5. Email pattern guessing + Hunter email-verifier
 */

import {
  generateLlmJson,
  getDefaultLlmModel,
  getLlmApiKey,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import { COMPANY_INFO_EXTRACTION_JSON_SCHEMA } from "@/lib/llm-schemas";
import { getLogger } from "@/lib/logger";

const HUNTER_BASE = "https://api.hunter.io/v2";
const APOLLO_BASE = "https://api.apollo.io/api/v1";
const emailLookupLogger = getLogger({ component: "email_lookup" });

// ──────────────────── Types ────────────────────

export type HunterEmailResult = {
  email: string | null;
  score: number; // confidence 0-100
  company: string | null;
  sources: { domain: string; uri: string }[];
};

export type EmailLookupResult = {
  name: string;
  email: string | null;
  confidence: number;
  source: "apollo" | "hunter" | null;
};

export type ApolloHealthResult = {
  healthy: boolean;
  isLoggedIn: boolean;
};

// ──────────────────── Apollo.io People Match ────────────────────

export async function apolloLookup(
  apiKey: string,
  params: {
    firstName: string;
    lastName: string;
    linkedinUrl: string;
    domain?: string | null;
  },
): Promise<{ email: string | null; source: string }> {
  const searchParams = new URLSearchParams({
    first_name: params.firstName,
    last_name: params.lastName,
    name: `${params.firstName} ${params.lastName}`.trim(),
    linkedin_url: params.linkedinUrl,
    reveal_personal_emails: "false",
    reveal_phone_number: "false",
  });
  if (params.domain) {
    searchParams.set("domain", params.domain);
  }

  const res = await fetch(`${APOLLO_BASE}/people/match?${searchParams}`, {
    method: "POST",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo lookup failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const person = data.person || data;

  // Try work email first, then personal
  const email = person.email || person.organization_email || person.personal_emails?.[0] || null;
  return { email, source: "apollo" };
}

export async function checkApolloHealth(apiKey: string): Promise<ApolloHealthResult> {
  const res = await fetch(`${APOLLO_BASE}/auth/health`, {
    method: "GET",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo health check failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    healthy: data.healthy === true,
    isLoggedIn: data.is_logged_in === true,
  };
}

// ──────────────────── LLM Extract Company Info ────────────────────

async function extractCompanyInfo(
  metadata: Record<string, unknown>,
  headline: string | null,
): Promise<{ companyName: string | null; domain: string | null }> {
  const metadataCompanyInfo = extractCompanyInfoFromMetadata(metadata);
  if (metadataCompanyInfo.companyName || metadataCompanyInfo.domain) {
    return metadataCompanyInfo;
  }

  try {
    getLlmApiKey();
  } catch {
    return { companyName: null, domain: null };
  }

  const workHistory = metadata.work_history as { company?: string; title?: string }[] | undefined;
  const about = metadata.about as string | undefined;

  const prompt = `Extract the current company name and website domain from this LinkedIn profile data.

Headline: ${headline || "N/A"}
Work History: ${workHistory ? JSON.stringify(workHistory.slice(0, 3)) : "N/A"}
About: ${about?.substring(0, 300) || "N/A"}

  Return JSON with:
- company_name: string (current employer, e.g. "Stripe", "Google", "Microsoft")
- domain: string (company website domain without https://, e.g. "stripe.com", "google.com")

If uncertain, return null for that field. Return ONLY valid JSON, no markdown.`;

  try {
    const { data } = await generateLlmJson<{
      company_name?: string | null;
      domain?: string | null;
    }>({
      model: getDefaultLlmModel(),
      prompt,
      maxOutputTokens: 300,
      temperature: 0,
      jsonSchema: COMPANY_INFO_EXTRACTION_JSON_SCHEMA,
      deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PARSE_THINKING", "disabled"),
    });
    return {
      companyName: data.company_name || null,
      domain: data.domain || null,
    };
  } catch (err) {
    emailLookupLogger.warn({
      event: "company_extraction_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { companyName: null, domain: null };
  }
}

function cleanDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const parsed = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    return parsed.hostname.replace(/^www\./, "") || null;
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .trim() || null;
  }
}

function extractCompanyInfoFromMetadata(
  metadata: Record<string, unknown>,
): { companyName: string | null; domain: string | null } {
  const directDomain =
    cleanDomain(metadata.company_domain) ||
    cleanDomain(metadata.current_company_domain) ||
    cleanDomain(metadata.domain) ||
    cleanDomain(metadata.company_website) ||
    cleanDomain(metadata.website);

  const currentCompany = metadata.current_company;
  if (currentCompany && typeof currentCompany === "object") {
    const record = currentCompany as Record<string, unknown>;
    return {
      companyName: typeof record.name === "string" && record.name.trim() ? record.name.trim() : null,
      domain:
        directDomain ||
        cleanDomain(record.domain) ||
        cleanDomain(record.website) ||
        cleanDomain(record.url),
    };
  }

  const workHistory = Array.isArray(metadata.work_history)
    ? metadata.work_history
    : [];
  const currentWork = workHistory.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return record.current === true || record.end_date === null || record.endDate === null;
  });
  const firstWork = workHistory.find((item) => item && typeof item === "object");
  const workRecord = (currentWork || firstWork) as Record<string, unknown> | undefined;

  return {
    companyName:
      typeof metadata.company_name === "string" && metadata.company_name.trim()
        ? metadata.company_name.trim()
        : typeof metadata.current_company_name === "string" && metadata.current_company_name.trim()
          ? metadata.current_company_name.trim()
          : typeof workRecord?.company === "string" && workRecord.company.trim()
            ? workRecord.company.trim()
            : null,
    domain:
      directDomain ||
      cleanDomain(workRecord?.domain) ||
      cleanDomain(workRecord?.company_domain) ||
      cleanDomain(workRecord?.website),
  };
}

// ──────────────────── Hunter.io Domain Search ────────────────────

async function hunterDomainSearch(
  apiKey: string,
  companyName: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    company: companyName,
    api_key: apiKey,
  });

  try {
    const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.domain || null;
  } catch {
    return null;
  }
}

// ──────────────────── Hunter.io Email Finder ────────────────────

async function hunterEmailFinder(
  apiKey: string,
  firstName: string,
  lastName: string,
  domain: string,
): Promise<HunterEmailResult> {
  const params = new URLSearchParams({
    first_name: firstName,
    last_name: lastName,
    domain,
    api_key: apiKey,
  });

  const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hunter email-finder failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    email: data.data?.email || null,
    score: data.data?.score || 0,
    company: data.data?.company || null,
    sources: data.data?.sources || [],
  };
}

// ──────────────────── Hunter.io Email Verifier ────────────────────

async function hunterVerifyEmail(
  apiKey: string,
  email: string,
): Promise<{ valid: boolean; score: number }> {
  const params = new URLSearchParams({
    email,
    api_key: apiKey,
  });

  try {
    const res = await fetch(`${HUNTER_BASE}/email-verifier?${params}`);
    if (!res.ok) return { valid: false, score: 0 };
    const data = await res.json();
    return {
      valid: data.data?.status === "valid",
      score: data.data?.score || 0,
    };
  } catch {
    return { valid: false, score: 0 };
  }
}

// ──────────────────── Email Pattern Guessing ────────────────────

function guessEmailPatterns(
  firstName: string,
  lastName: string,
  domain: string,
): string[] {
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();
  const patterns = [
    `${f}.${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}_${l}@${domain}`,
    `${l}.${f}@${domain}`,
  ];
  return patterns;
}

// ──────────────────── Find email with multi-strategy approach ────────────────────

export async function findEmail(opts: {
  apolloApiKey?: string | null;
  hunterApiKey?: string | null;
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  metadata?: Record<string, unknown>;
  headline?: string | null;
}): Promise<EmailLookupResult> {
  const { apolloApiKey, hunterApiKey, firstName, lastName, linkedinUrl, metadata = {}, headline = null } = opts;
  const fullName = `${firstName} ${lastName}`.trim();
  const metadataCompanyInfo = extractCompanyInfoFromMetadata(metadata);

  // Strategy 1: Apollo.io (LinkedIn URL direct lookup)
  if (apolloApiKey) {
    try {
      const result = await apolloLookup(apolloApiKey, {
        firstName,
        lastName,
        linkedinUrl,
        domain: metadataCompanyInfo.domain,
      });
      if (result.email) {
        emailLookupLogger.info({
          event: "email_lookup_found",
          source: "apollo",
        });
        return { name: fullName, email: result.email, confidence: 90, source: "apollo" };
      }
    } catch (err) {
      emailLookupLogger.warn({
        event: "apollo_lookup_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!hunterApiKey) {
    emailLookupLogger.info({
      event: "email_lookup_stopped",
      reason: "missing_hunter_api_key",
    });
    return { name: fullName, email: null, confidence: 0, source: null };
  }

  // Strategy 2: LLM extract company name + domain from metadata
  emailLookupLogger.info({
    event: "company_extraction_started",
  });
  const { companyName, domain: extractedDomain } =
    metadataCompanyInfo.companyName || metadataCompanyInfo.domain
      ? metadataCompanyInfo
      : await extractCompanyInfo(metadata, headline);
  emailLookupLogger.info({
    event: "company_extraction_completed",
    has_company_name: Boolean(companyName),
    has_domain: Boolean(extractedDomain),
  });

  let domain = extractedDomain;

  // Strategy 3: Hunter domain-search if we have company name but no domain
  if (companyName && !domain) {
    emailLookupLogger.info({
      event: "hunter_domain_search_started",
    });
    domain = await hunterDomainSearch(hunterApiKey, companyName);
    if (domain) {
      emailLookupLogger.info({
        event: "hunter_domain_search_found",
      });
    }
  }

  // Strategy 4: Hunter email-finder with domain
  if (domain && firstName && lastName) {
    try {
      const result = await hunterEmailFinder(hunterApiKey, firstName, lastName, domain);
      if (result.email) {
        emailLookupLogger.info({
          event: "email_lookup_found",
          source: "hunter",
          score: result.score,
        });
        return { name: fullName, email: result.email, confidence: result.score, source: "hunter" };
      }
    } catch (err) {
      emailLookupLogger.warn({
        event: "hunter_email_finder_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Strategy 5: Email pattern guessing + Hunter verifier
  if (domain && firstName && lastName) {
    emailLookupLogger.info({
      event: "email_pattern_guessing_started",
      has_domain: Boolean(domain),
    });
    const patterns = guessEmailPatterns(firstName, lastName, domain);
    
    for (const email of patterns) {
      const verification = await hunterVerifyEmail(hunterApiKey, email);
      if (verification.valid && verification.score >= 70) {
        emailLookupLogger.info({
          event: "email_lookup_found",
          source: "hunter",
          score: verification.score,
          strategy: "pattern_guess",
        });
        return { name: fullName, email, confidence: verification.score, source: "hunter" };
      }
    }
    emailLookupLogger.info({
      event: "email_pattern_guessing_not_found",
      has_domain: Boolean(domain),
    });
  }

  emailLookupLogger.info({
    event: "email_lookup_not_found",
  });
  return { name: fullName, email: null, confidence: 0, source: null };
}

// ──────────────────── Batch email lookup ────────────────────

export async function findEmailsBatch(
  candidates: {
    firstName: string;
    lastName: string;
    linkedinUrl: string;
    metadata?: Record<string, unknown>;
    headline?: string | null;
  }[],
  apolloApiKey?: string | null,
  hunterApiKey?: string | null,
): Promise<EmailLookupResult[]> {
  const results: EmailLookupResult[] = [];

  for (const candidate of candidates) {
    const result = await findEmail({
      apolloApiKey,
      hunterApiKey,
      ...candidate,
    });
    results.push(result);

    // Rate limit: 1 second between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
