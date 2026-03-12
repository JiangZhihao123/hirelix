/**
 * Hunter.io Email Finder API integration
 *
 * Finds professional email addresses by name + company.
 * Free tier: 25 searches/month, then paid plans.
 *
 * Used as fallback when Apollo.io is unavailable.
 */

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

// ──────────────────── Hunter.io Email Finder ────────────────────

async function hunterLookup(
  apiKey: string,
  firstName: string,
  lastName: string,
  company: string,
): Promise<HunterEmailResult> {
  const params = new URLSearchParams({
    first_name: firstName,
    last_name: lastName,
    company,
    api_key: apiKey,
  });

  const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hunter lookup failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    email: data.data?.email || null,
    score: data.data?.score || 0,
    company: data.data?.company || null,
    sources: data.data?.sources || [],
  };
}

// ──────────────────── Find email with Apollo → Hunter fallback ────────────────────

export async function findEmail(opts: {
  apolloApiKey?: string | null;
  hunterApiKey?: string | null;
  firstName: string;
  lastName: string;
  company: string;
  linkedinUrl: string;
}): Promise<EmailLookupResult> {
  const { apolloApiKey, hunterApiKey, firstName, lastName, company, linkedinUrl } = opts;
  const fullName = `${firstName} ${lastName}`.trim();

  // Try Apollo first
  if (apolloApiKey) {
    try {
      const result = await apolloLookup(apolloApiKey, linkedinUrl);
      if (result.email) {
        console.log(`[email] Apollo found: ${result.email} for ${fullName}`);
        return { name: fullName, email: result.email, confidence: 90, source: "apollo" };
      }
    } catch (err) {
      console.log(`[email] Apollo failed for ${fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Fallback to Hunter
  if (hunterApiKey && company) {
    try {
      const result = await hunterLookup(hunterApiKey, firstName, lastName, company);
      if (result.email) {
        console.log(`[email] Hunter found: ${result.email} for ${fullName} (${result.score}%)`);
        return { name: fullName, email: result.email, confidence: result.score, source: "hunter" };
      }
    } catch (err) {
      console.log(`[email] Hunter failed for ${fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[email] No email found for ${fullName}`);
  return { name: fullName, email: null, confidence: 0, source: null };
}

// ──────────────────── Batch email lookup ────────────────────

export async function findEmailsBatch(
  candidates: {
    firstName: string;
    lastName: string;
    company: string;
    linkedinUrl: string;
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
