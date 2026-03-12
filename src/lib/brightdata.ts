/**
 * Bright Data LinkedIn Profiles Scraper API integration
 *
 * Scrapes full LinkedIn profile data including experience, education, skills,
 * about section, and more.
 *
 * Pricing: ~$1.50/1k records ($0.0015/profile)
 * Flow: trigger → snapshot_id → poll until ready → get JSON results
 */

const BRIGHTDATA_API_BASE = "https://api.brightdata.com/datasets/v3";

// ──────────────────── Types ────────────────────

export type BrightDataExperience = {
  title: string | null;
  company: string | null;
  company_id: string | null;
  location: string | null;
  duration: string | null;
  description: string | null;
};

export type BrightDataEducation = {
  title: string | null;
  subtitle: string | null;
  field_of_study: string | null;
  degree: string | null;
  start_year: string | null;
  end_year: string | null;
};

export type BrightDataProfile = {
  name: string;
  first_name: string | null;
  last_name: string | null;
  linkedin_id: string | null;
  about: string | null;
  city: string | null;
  country_code: string | null;
  current_company: {
    name: string | null;
    company_id: string | null;
    title: string | null;
    location: string | null;
  } | null;
  experience: BrightDataExperience[];
  education: BrightDataEducation[];
  skills: string[];
  connections: number | null;
  followers: number | null;
  url: string | null;
  avatar: string | null;
  languages: string[];
  certifications: { name: string; authority: string | null }[];
  recommendations_count: number | null;
  input: { url: string };
};

// ──────────────────── Trigger scraping job ────────────────────

export async function triggerScrape(
  apiToken: string,
  datasetId: string,
  linkedinUrls: string[],
): Promise<string> {
  const body = linkedinUrls.map((url) => ({ url }));

  const res = await fetch(
    `${BRIGHTDATA_API_BASE}/trigger?dataset_id=${datasetId}&include_errors=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bright Data trigger failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.snapshot_id;
}

// ──────────────────── Poll for results ────────────────────

export async function pollSnapshot(
  apiToken: string,
  snapshotId: string,
  maxAttempts: number = 6,
  intervalMs: number = 30000,
): Promise<BrightDataProfile[]> {
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`[brightdata] Polling snapshot ${snapshotId} (attempt ${i + 1}/${maxAttempts})...`);
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(
      `${BRIGHTDATA_API_BASE}/snapshot/${snapshotId}?format=json`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bright Data snapshot fetch failed (${res.status}): ${text}`);
    }

    const data = await res.json();

    if (data.status === "running") {
      console.log(`[brightdata] Snapshot still running, waiting...`);
      continue;
    }

    // Data is ready
    if (Array.isArray(data)) {
      console.log(`[brightdata] Got ${data.length} profiles`);
      return data as BrightDataProfile[];
    }

    // Unexpected format
    console.error("[brightdata] Unexpected response format:", JSON.stringify(data).slice(0, 200));
    throw new Error("Unexpected Bright Data response format");
  }

  throw new Error(`Bright Data scraping did not complete after ${maxAttempts} attempts`);
}

// ──────────────────── Convenience: scrape and wait ────────────────────

export async function scrapeLinkedInProfiles(
  apiToken: string,
  datasetId: string,
  linkedinUrls: string[],
): Promise<BrightDataProfile[]> {
  if (linkedinUrls.length === 0) return [];

  console.log(`[brightdata] Triggering scrape for ${linkedinUrls.length} profiles...`);
  const snapshotId = await triggerScrape(apiToken, datasetId, linkedinUrls);
  console.log(`[brightdata] Snapshot ID: ${snapshotId}`);

  return pollSnapshot(apiToken, snapshotId);
}

// ──────────────────── Convert to rich profile text for AI ────────────────────

export function brightDataProfileToRichText(profile: BrightDataProfile, index: number): string {
  const lines: string[] = [];
  lines.push(`[${index}] ${profile.name}`);

  if (profile.current_company) {
    lines.push(`  Current: ${profile.current_company.title || "N/A"} at ${profile.current_company.name || "N/A"}`);
  }
  if (profile.city || profile.country_code) {
    lines.push(`  Location: ${[profile.city, profile.country_code].filter(Boolean).join(", ")}`);
  }
  if (profile.about) {
    lines.push(`  About: ${profile.about.substring(0, 300)}`);
  }

  const experience = (profile.experience || []).slice(0, 5);
  if (experience.length > 0) {
    lines.push(`  Experience:`);
    for (const exp of experience) {
      lines.push(`    - ${exp.title || "N/A"} at ${exp.company || "N/A"} (${exp.duration || "N/A"})`);
      if (exp.description) {
        lines.push(`      ${exp.description.substring(0, 150)}`);
      }
    }
  }

  const education = (profile.education || []).slice(0, 3);
  if (education.length > 0) {
    lines.push(`  Education:`);
    for (const edu of education) {
      lines.push(`    - ${edu.title || edu.field_of_study || "N/A"} at ${edu.subtitle || "N/A"}`);
    }
  }

  const skills = (profile.skills || []).slice(0, 12);
  if (skills.length > 0) {
    lines.push(`  Skills: ${skills.join(", ")}`);
  }

  if (profile.languages?.length) {
    lines.push(`  Languages: ${profile.languages.join(", ")}`);
  }

  lines.push(`  LinkedIn: ${profile.url || profile.input?.url || "N/A"}`);

  return lines.join("\n");
}
