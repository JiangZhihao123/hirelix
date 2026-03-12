/**
 * Test the 5-layer pipeline directly (bypasses HTTP API auth).
 * Serper → AI Pre-screen → Bright Data → AI Deep Score → Apollo/Hunter Email
 */

const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SERPER_API_KEY = env.SERPER_API_KEY;
const BRIGHTDATA_API_TOKEN = env.BRIGHTDATA_API_TOKEN;
const BRIGHTDATA_DATASET_ID = env.BRIGHTDATA_DATASET_ID;
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL;
const ANTHROPIC_MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const APOLLO_API_KEY = env.APOLLO_API_KEY;
const HUNTER_API_KEY = env.HUNTER_API_KEY;

const TEST_JD = `
Senior Frontend Engineer - Remote (US)

About the Role:
We're looking for a Senior Frontend Engineer to join our growing team.
You'll be building and maintaining our core web application used by thousands of users daily.

Requirements:
- 5+ years of experience with React and TypeScript
- Strong experience with Next.js
- Proficiency in Tailwind CSS
- Experience with REST APIs and GraphQL
- Understanding of CI/CD and testing best practices

Nice to have:
- Experience with server-side rendering (SSR)
- Knowledge of performance optimization
- Open source contributions

Location: Remote (US only)
Salary: $150k - $200k
`;

// ═══ Helper: call Claude ═══
async function callClaude(prompt, system) {
  const messages = [{ role: 'user', content: prompt }];
  const body = { model: ANTHROPIC_MODEL, max_tokens: 8000, messages };
  if (system) body.system = system;

  const res = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let text = data.content?.[0]?.text || '';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // Fix truncated JSON arrays: try to close unclosed arrays
  if (text.startsWith('[') && !text.endsWith(']')) {
    // Find last complete object
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > 0) {
      text = text.substring(0, lastBrace + 1) + ']';
    }
  }
  return text;
}

// ═══ Layer 1: Serper Search ═══
async function serperSearch(query, num = 20) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${await res.text()}`);
  return (await res.json()).organic || [];
}

function parseLinkedInResults(results) {
  const candidates = [];
  const seen = new Set();
  for (const r of results) {
    if (!r.link?.includes('linkedin.com/in/')) continue;
    const url = r.link.split('?')[0].replace(/\/$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    const name = r.title?.split(' - ')[0]?.split(' | ')[0]?.trim();
    if (!name || name.length < 2) continue;
    candidates.push({
      name,
      headline: r.title?.split(' - ').slice(1).join(' - ')?.trim() || '',
      linkedin_url: url.startsWith('http') ? url : `https://${url}`,
      snippet: r.snippet || '',
    });
  }
  return candidates;
}

// ═══ Layer 2: AI Pre-screen ═══
async function aiPreScreen(candidates, parsed, count) {
  const profiles = candidates.map((c, i) =>
    `[${i}] ${c.name}\n  Headline: ${c.headline}\n  Snippet: ${c.snippet}\n  URL: ${c.linkedin_url}`
  ).join('\n\n');

  const prompt = `You are an expert AI recruiter. Analyze these ${candidates.length} LinkedIn profiles and select the TOP ${count} best matches.

## Job Requirements
Title: ${parsed.title || 'N/A'}
Required Skills: ${(parsed.required_skills || []).join(', ')}
Experience: ${parsed.experience_years_min || '?'}+ years
Location: ${parsed.location || 'N/A'}

## Candidates
${profiles}

Return a JSON array of ${count} objects with: index, match_score (0-100), match_reasons (string[]), skills (string[]). Sorted by match_score descending. ONLY valid JSON.`;

  const text = await callClaude(prompt);
  return JSON.parse(text);
}

// ═══ Layer 3: Bright Data Scrape ═══
async function scrapeBrightData(urls) {
  console.log(`  Triggering scrape for ${urls.length} profiles...`);
  const triggerRes = await fetch(
    `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHTDATA_DATASET_ID}&include_errors=true`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${BRIGHTDATA_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(urls.map(url => ({ url }))),
    }
  );
  if (!triggerRes.ok) throw new Error(`BD trigger ${triggerRes.status}: ${await triggerRes.text()}`);
  const { snapshot_id } = await triggerRes.json();
  console.log(`  Snapshot ID: ${snapshot_id}`);

  // Poll
  for (let i = 0; i < 8; i++) {
    console.log(`  Polling... (attempt ${i + 1}/8)`);
    await new Promise(r => setTimeout(r, 30000));
    const snapRes = await fetch(
      `https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}?format=json`,
      { headers: { Authorization: `Bearer ${BRIGHTDATA_API_TOKEN}` } }
    );
    if (!snapRes.ok) throw new Error(`BD snapshot ${snapRes.status}: ${await snapRes.text()}`);
    const data = await snapRes.json();
    if (data.status === 'running') continue;
    if (Array.isArray(data)) return data;
    throw new Error('Unexpected BD response');
  }
  throw new Error('BD scraping timed out');
}

// ═══ Layer 4: AI Deep Score ═══
async function aiDeepScore(profiles, parsed, count) {
  const texts = profiles.map((p, i) => {
    const lines = [`[${i}] ${p.name}`];
    if (p.current_company) lines.push(`  Current: ${p.current_company.title || 'N/A'} at ${p.current_company.name || 'N/A'}`);
    lines.push(`  Location: ${[p.city, p.country_code].filter(Boolean).join(', ')}`);
    if (p.about) lines.push(`  About: ${p.about.substring(0, 300)}`);
    if (p.experience?.length) {
      lines.push('  Experience:');
      for (const e of p.experience.slice(0, 5)) {
        lines.push(`    - ${e.title || 'N/A'} at ${e.company || 'N/A'} (${e.duration || 'N/A'})`);
      }
    }
    if (p.skills?.length) lines.push(`  Skills: ${p.skills.slice(0, 12).join(', ')}`);
    lines.push(`  LinkedIn: ${p.url || p.input?.url || 'N/A'}`);
    return lines.join('\n');
  }).join('\n\n');

  const prompt = `You are an expert AI recruiter with FULL LinkedIn profile data. Deeply analyze and select TOP ${count} candidates.

## Job Requirements
Title: ${parsed.title || 'N/A'}
Required Skills: ${(parsed.required_skills || []).join(', ')}
Experience: ${parsed.experience_years_min || '?'}+ years
Location: ${parsed.location || 'N/A'}

## Full Profiles (${profiles.length})
${texts}

Return JSON array of ${count} objects: index, match_score (0-100), match_reasons (string[], 3-4 specific), skills (string[]), experience_years (number|null). Sorted by match_score desc. ONLY valid JSON.`;

  const text = await callClaude(prompt);
  return JSON.parse(text);
}

// ═══ Layer 5: Email Lookup ═══
async function lookupEmail(firstName, lastName, company, linkedinUrl) {
  // Try Apollo first
  if (APOLLO_API_KEY) {
    try {
      const res = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
        body: JSON.stringify({ linkedin_url: linkedinUrl, reveal_personal_emails: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const email = data.person?.email || data.email || data.person?.personal_emails?.[0];
        if (email) return { email, source: 'apollo' };
      }
    } catch {}
  }

  // Fallback to Hunter
  if (HUNTER_API_KEY && company) {
    try {
      const params = new URLSearchParams({ first_name: firstName, last_name: lastName, company, api_key: HUNTER_API_KEY });
      const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
      const data = await res.json();
      if (data.data?.email) return { email: data.data.email, source: 'hunter', score: data.data.score };
    } catch {}
  }

  return { email: null, source: null };
}

// ═══ Main Pipeline ═══
async function runPipeline() {
  console.log('\n🚀 HIRELIX 5-LAYER PIPELINE TEST\n');
  console.log('Pipeline: JD → Serper → AI Pre-screen → Bright Data → AI Deep Score → Email\n');
  console.log('═'.repeat(60));
  const startTime = Date.now();

  try {
    // Step 0: Parse JD
    console.log('\n━━━ Step 0: Parse JD with Claude ━━━\n');
    const parsePrompt = `Analyze this job description and return JSON with: title, company, seniority, required_skills (string[]), nice_to_have_skills (string[]), experience_years_min (number), location. ONLY valid JSON.\n\n${TEST_JD}`;
    const parsed = JSON.parse(await callClaude(parsePrompt));
    console.log(`  Title: ${parsed.title}`);
    console.log(`  Skills: ${(parsed.required_skills || []).join(', ')}`);
    console.log(`  Location: ${parsed.location}`);
    console.log(`  Min Experience: ${parsed.experience_years_min} years`);

    // Layer 1: Serper
    console.log('\n━━━ Layer 1: Serper Search ━━━\n');
    const queries = [
      `site:linkedin.com/in "${parsed.title}" ${(parsed.required_skills || []).slice(0, 3).join(' ')} ${parsed.location || ''}`,
      `site:linkedin.com/in ${parsed.title} ${(parsed.required_skills || []).slice(0, 2).join(' ')}`,
    ];
    let allCandidates = [];
    const seenUrls = new Set();
    for (const q of queries) {
      if (allCandidates.length >= 20) break;
      console.log(`  Query: ${q}`);
      const results = await serperSearch(q, 15);
      const parsed2 = parseLinkedInResults(results);
      for (const c of parsed2) {
        if (!seenUrls.has(c.linkedin_url.toLowerCase())) {
          seenUrls.add(c.linkedin_url.toLowerCase());
          allCandidates.push(c);
        }
      }
      console.log(`  → ${allCandidates.length} unique candidates so far`);
    }
    console.log(`\n  Total: ${allCandidates.length} LinkedIn profiles found`);

    if (allCandidates.length === 0) throw new Error('No candidates found!');

    // Layer 2: AI Pre-screen
    console.log('\n━━━ Layer 2: AI Pre-screen ━━━\n');
    const preScreenCount = Math.min(allCandidates.length, 10);
    console.log(`  Pre-screening ${allCandidates.length} → top ${preScreenCount}`);
    const preScreened = await aiPreScreen(allCandidates, parsed, preScreenCount);
    console.log(`  Passed: ${preScreened.length} candidates`);
    preScreened.forEach((s, i) => {
      const c = allCandidates[s.index];
      console.log(`    ${i + 1}. [${s.match_score}] ${c?.name} — ${c?.headline?.substring(0, 60)}`);
    });

    // Layer 3: Bright Data Scrape
    console.log('\n━━━ Layer 3: Bright Data Scrape ━━━\n');
    const urlsToScrape = preScreened.map(s => allCandidates[s.index]?.linkedin_url).filter(Boolean);
    console.log(`  Scraping ${urlsToScrape.length} profiles...`);
    const bdProfiles = await scrapeBrightData(urlsToScrape);
    console.log(`  ✅ Got ${bdProfiles.length} full profiles`);
    bdProfiles.forEach((p, i) => {
      console.log(`    ${i + 1}. ${p.name} — ${p.current_company?.name || 'N/A'} — ${p.city || ''}, ${p.country_code || ''}`);
    });

    // Layer 4: AI Deep Score
    console.log('\n━━━ Layer 4: AI Deep Score ━━━\n');
    const finalCount = Math.min(bdProfiles.length, 5);
    console.log(`  Deep scoring ${bdProfiles.length} → top ${finalCount}`);
    const deepScored = await aiDeepScore(bdProfiles, parsed, finalCount);
    console.log('\n  🏆 Final Rankings:\n');
    deepScored.forEach((s, i) => {
      const p = bdProfiles[s.index];
      console.log(`    #${i + 1} ${p?.name} — Score: ${s.match_score}/100`);
      (s.match_reasons || []).forEach(r => console.log(`        ✅ ${r}`));
      console.log();
    });

    // Layer 5: Email Lookup
    console.log('━━━ Layer 5: Email Lookup (Apollo → Hunter) ━━━\n');
    const emailResults = [];
    for (const s of deepScored) {
      const p = bdProfiles[s.index];
      if (!p) continue;
      const firstName = p.first_name || p.name?.split(' ')[0] || '';
      const lastName = p.last_name || p.name?.split(' ').slice(1).join(' ') || '';
      const company = p.current_company?.name || '';
      const linkedinUrl = p.url || p.input?.url || '';
      console.log(`  Looking up: ${firstName} ${lastName} at ${company}...`);
      const result = await lookupEmail(firstName, lastName, company, linkedinUrl);
      emailResults.push({ name: p.name, ...result });
      if (result.email) {
        console.log(`    ✅ ${result.email} (via ${result.source}${result.score ? `, ${result.score}%` : ''})`);
      } else {
        console.log(`    ❌ No email found`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '═'.repeat(60));
    console.log('\n📊 5-LAYER PIPELINE SUMMARY\n');
    console.log(`  ⏱  Total time: ${elapsed}s`);
    console.log(`  🔍 Layer 1 (Serper): ${allCandidates.length} LinkedIn profiles`);
    console.log(`  🧠 Layer 2 (AI Pre-screen): ${preScreened.length} passed`);
    console.log(`  📋 Layer 3 (Bright Data): ${bdProfiles.length} full profiles`);
    console.log(`  🏆 Layer 4 (AI Deep Score): ${deepScored.length} ranked`);
    console.log(`  📧 Layer 5 (Email): ${emailResults.filter(e => e.email).length}/${emailResults.length} found`);
    console.log(`  🥇 Top: ${deepScored[0] ? bdProfiles[deepScored[0].index]?.name : 'N/A'} (${deepScored[0]?.match_score}/100)`);
    const topEmail = emailResults.find(e => e.email);
    if (topEmail) console.log(`  📬 Email: ${topEmail.name} → ${topEmail.email}`);
    console.log('\n✅ 5-LAYER PIPELINE TEST COMPLETE!');

  } catch (err) {
    console.error('\n❌ Pipeline failed:', err.message);
    console.error(err);
  }
}

runPipeline();
