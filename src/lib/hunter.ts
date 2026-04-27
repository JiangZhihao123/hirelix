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

const HUNTER_BASE = "https://api.hunter.io/v2";

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

// ──────────────────── Apollo.io People Match ────────────────────

async function apolloLookup(
  apiKey: string,
  linkedinUrl: string,
): Promise<{ email: string | null; source: string }> {
  const res = await fetch("https://api.apollo.io/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      linkedin_url: linkedinUrl,
      reveal_personal_emails: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo lookup failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const person = data.person || data;

  // Try work email first, then personal
  const email = person.email || person.personal_emails?.[0] || null;
  return { email, source: "apollo" };
}

// ──────────────────── LLM Extract Company Info ────────────────────

async function extractCompanyInfo(
  metadata: Record<string, unknown>,
  headline: string | null,
): Promise<{ companyName: string | null; domain: string | null }> {
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
    console.log(`[email] LLM company extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    return { companyName: null, domain: null };
  }
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

  // Strategy 1: Apollo.io (LinkedIn URL direct lookup)
  if (apolloApiKey) {
    try {
      const result = await apolloLookup(apolloApiKey, linkedinUrl);
      if (result.email) {
        console.log(`[email] ✅ Apollo found: ${result.email} for ${fullName}`);
        return { name: fullName, email: result.email, confidence: 90, source: "apollo" };
      }
    } catch (err) {
      console.log(`[email] Apollo failed for ${fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!hunterApiKey) {
    console.log(`[email] No Hunter API key, stopping`);
    return { name: fullName, email: null, confidence: 0, source: null };
  }

  // Strategy 2: LLM extract company name + domain from metadata
  console.log(`[email] Extracting company info via LLM for ${fullName}...`);
  const { companyName, domain: extractedDomain } = await extractCompanyInfo(metadata, headline);
  console.log(`[email] LLM extracted: company="${companyName}", domain="${extractedDomain}"`);

  let domain = extractedDomain;

  // Strategy 3: Hunter domain-search if we have company name but no domain
  if (companyName && !domain) {
    console.log(`[email] Searching domain for company: ${companyName}`);
    domain = await hunterDomainSearch(hunterApiKey, companyName);
    if (domain) {
      console.log(`[email] Hunter domain-search found: ${domain}`);
    }
  }

  // Strategy 4: Hunter email-finder with domain
  if (domain && firstName && lastName) {
    try {
      const result = await hunterEmailFinder(hunterApiKey, firstName, lastName, domain);
      if (result.email) {
        console.log(`[email] ✅ Hunter email-finder found: ${result.email} for ${fullName} (${result.score}%)`);
        return { name: fullName, email: result.email, confidence: result.score, source: "hunter" };
      }
    } catch (err) {
      console.log(`[email] Hunter email-finder failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Strategy 5: Email pattern guessing + Hunter verifier
  if (domain && firstName && lastName) {
    console.log(`[email] Trying email pattern guessing for ${fullName} @ ${domain}`);
    const patterns = guessEmailPatterns(firstName, lastName, domain);
    
    for (const email of patterns) {
      const verification = await hunterVerifyEmail(hunterApiKey, email);
      if (verification.valid && verification.score >= 70) {
        console.log(`[email] ✅ Pattern guess verified: ${email} (${verification.score}%)`);
        return { name: fullName, email, confidence: verification.score, source: "hunter" };
      }
    }
    console.log(`[email] No valid pattern found`);
  }

  console.log(`[email] ❌ No email found for ${fullName}`);
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
