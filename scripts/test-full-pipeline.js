/**
 * Full Pipeline Test: Serper → Bright Data → Claude AI → Hunter.io
 * 
 * Real JD → Search LinkedIn → Scrape Profiles → AI Score & Rank → Get Emails
 */

const SERPER_API_KEY = '7c75b496bdecf7b09be1e9d8654ea8c1b08b05de';
const BRIGHTDATA_API_TOKEN = 'fde7d1e1-91d3-4f3c-baed-06a965a3f5f6';
const BRIGHTDATA_DATASET_ID = 'gd_l1viktl72bvl7bjuj0';
const ANTHROPIC_API_KEY = 'sk-zE55L0PFzJprg848dPufTxSlfXRaXEigA8MUd4NkqETIImPR';
const ANTHROPIC_BASE_URL = 'https://cc.honoursoft.cn/v1';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const HUNTER_API_KEY = '46678bf605f1f1033f158732a7b99a4bd5ca3e73';

// ═══════════════════ Real JD ═══════════════════

const TEST_JD = `
Senior Frontend Engineer - Remote (US)

About the Role:
We're looking for a Senior Frontend Engineer to join our growing team. 
You'll be building and maintaining our core web application used by thousands of users daily.

Requirements:
- 5+ years of experience with React and TypeScript
- Strong experience with Next.js and server-side rendering
- Proficiency in CSS/Tailwind CSS
- Experience with state management (Redux, Zustand, or similar)
- Experience with REST APIs and GraphQL
- Strong understanding of web performance optimization
- Experience with testing frameworks (Jest, Cypress, Playwright)

Nice to Have:
- Experience with design systems
- Knowledge of CI/CD pipelines
- Experience with Figma
- Contributions to open-source projects

Location: San Francisco Bay Area or Remote (US)
Salary: $180,000 - $220,000
`;

// ═══════════════════ Step 1: Parse JD with Claude ═══════════════════

async function parseJD(jd) {
  console.log('━━━ Step 1: Parsing JD with Claude AI ━━━\n');

  const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Parse this job description and extract key information as JSON:

${jd}

Return JSON with these fields:
{
  "title": "job title",
  "required_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill1"],
  "location": "location",
  "seniority": "Senior/Mid/Junior",
  "min_years": 5
}

Return ONLY the JSON, no markdown.`
      }]
    })
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Claude API error: ${JSON.stringify(data.error)}`);
  }
  
  let text = data.content[0].text;
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Try to extract JSON from text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log('Raw response:', text);
    throw new Error('No JSON object found in Claude response');
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  console.log('Parsed JD:', JSON.stringify(parsed, null, 2));
  return parsed;
}

// ═══════════════════ Step 2: Serper Search ═══════════════════

async function searchLinkedIn(parsed) {
  console.log('\n━━━ Step 2: Searching LinkedIn via Serper ━━━\n');

  const queries = buildSearchQueries(parsed);
  console.log('Search queries:');
  queries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  const allResults = [];
  const seenUrls = new Set();

  for (let i = 0; i < queries.length; i++) {
    console.log(`\nRunning query ${i + 1}...`);
    
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: queries[i], num: 15 })
    });

    const data = await res.json();
    const organic = data.organic || [];
    
    for (const r of organic) {
      if (!r.link?.includes('linkedin.com/in/')) continue;
      const url = r.link.split('?')[0].replace(/\/$/, '');
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      
      const name = extractName(r.title);
      if (!name || name.length < 2) continue;

      allResults.push({
        name,
        headline: extractHeadline(r.title),
        linkedin_url: url.startsWith('http') ? url : `https://${url}`,
        snippet: r.snippet || ''
      });
    }

    console.log(`  Found ${organic.length} results, ${seenUrls.size} unique LinkedIn profiles so far`);
  }

  console.log(`\n✅ Total unique LinkedIn profiles: ${allResults.length}`);
  allResults.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} - ${c.headline || 'N/A'}`);
    console.log(`     ${c.linkedin_url}`);
  });

  return allResults;
}

function buildSearchQueries(parsed) {
  const skills = (parsed.required_skills || []).slice(0, 6);
  const loc = parsed.location || '';
  const queries = [];

  // Query 1: Title + top skills + location
  queries.push(
    `site:linkedin.com/in "${parsed.title}" ${skills.slice(0, 2).map(s => `"${s}"`).join(' ')} "${loc}"`
  );

  // Query 2: Title + skills, no location
  queries.push(
    `site:linkedin.com/in "${parsed.title}" ${skills.slice(0, 3).map(s => `"${s}"`).join(' ')}`
  );

  // Query 3: Skills + seniority
  queries.push(
    `site:linkedin.com/in ${parsed.seniority || ''} ${skills.slice(0, 4).map(s => `"${s}"`).join(' ')}`
  );

  return queries;
}

function extractName(title) {
  const cleaned = title.replace(/\s*[-–|]\s*LinkedIn\s*$/i, '');
  return cleaned.split(/\s*[-–|]\s*/)[0]?.trim() || '';
}

function extractHeadline(title) {
  const cleaned = title.replace(/\s*[-–|]\s*LinkedIn\s*$/i, '');
  const parts = cleaned.split(/\s*[-–|]\s*/);
  return parts.length > 1 ? parts.slice(1).join(' | ').trim() : null;
}

// ═══════════════════ Step 3: Bright Data Scraping ═══════════════════

async function scrapeProfiles(candidates) {
  console.log('\n━━━ Step 3: Scraping LinkedIn Profiles via Bright Data ━━━\n');

  // Only scrape top 10 to save credits
  const toScrape = candidates.slice(0, 10);
  console.log(`Scraping ${toScrape.length} profiles...`);

  const urls = toScrape.map(c => ({ url: c.linkedin_url }));

  // Trigger batch scraping
  const triggerRes = await fetch(
    `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHTDATA_DATASET_ID}&include_errors=true`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIGHTDATA_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(urls)
    }
  );

  if (!triggerRes.ok) {
    const err = await triggerRes.text();
    throw new Error(`Bright Data trigger failed: ${triggerRes.status} - ${err}`);
  }

  const triggerData = await triggerRes.json();
  const snapshotId = triggerData.snapshot_id;
  console.log(`Snapshot ID: ${snapshotId}`);

  // Poll for results
  let profiles;
  const maxAttempts = 6;
  
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`Waiting 30s... (attempt ${i}/${maxAttempts})`);
    await new Promise(r => setTimeout(r, 30000));

    const resultRes = await fetch(
      `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
      {
        headers: { 'Authorization': `Bearer ${BRIGHTDATA_API_TOKEN}` }
      }
    );

    if (!resultRes.ok) {
      const err = await resultRes.text();
      throw new Error(`Fetch failed: ${resultRes.status} - ${err}`);
    }

    profiles = await resultRes.json();
    
    if (profiles.status !== 'running') {
      console.log('✅ Scraping completed!');
      break;
    }
  }

  if (!Array.isArray(profiles)) {
    throw new Error('Scraping did not complete in time');
  }

  console.log(`\n✅ Scraped ${profiles.length} complete profiles\n`);
  
  profiles.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name}`);
    console.log(`     Title: ${p.current_company?.title || 'N/A'} at ${p.current_company?.name || 'N/A'}`);
    console.log(`     Location: ${p.city || 'N/A'}, ${p.country_code || 'N/A'}`);
    console.log(`     About: ${(p.about || '').substring(0, 80)}...`);
  });

  return profiles;
}

// ═══════════════════ Step 4: AI Scoring ═══════════════════

async function scoreWithAI(profiles, jd) {
  console.log('\n━━━ Step 4: AI Scoring & Ranking with Claude ━━━\n');

  // Build rich profile text for AI
  const profileTexts = profiles.map((p, i) => {
    const exp = (p.experience || []).slice(0, 3).map(e => 
      `    - ${e.title} at ${e.company} (${e.duration || 'N/A'})`
    ).join('\n');
    
    const edu = (p.education || []).slice(0, 2).map(e => 
      `    - ${e.title || e.field_of_study || 'N/A'} at ${e.subtitle || e.school || 'N/A'}`
    ).join('\n');

    const skills = (p.skills || []).slice(0, 10).join(', ');

    return `[Candidate ${i + 1}]
  Name: ${p.name}
  Current: ${p.current_company?.title || 'N/A'} at ${p.current_company?.name || 'N/A'}
  Location: ${p.city || 'N/A'}, ${p.country_code || 'N/A'}
  About: ${(p.about || '').substring(0, 200)}
  Experience:
${exp || '    N/A'}
  Education:
${edu || '    N/A'}
  Skills: ${skills || 'N/A'}
  LinkedIn: ${p.url || p.input?.url || 'N/A'}`;
  }).join('\n\n');

  const prompt = `You are an expert tech recruiter. Analyze these candidates against the job description and score them.

JOB DESCRIPTION:
${jd}

CANDIDATES:
${profileTexts}

For each candidate, provide:
1. A score from 0-100 (how well they match the JD)
2. 3-4 specific match reasons
3. Any concerns

Return as JSON array:
[
  {
    "candidate_index": 1,
    "name": "...",
    "score": 85,
    "match_reasons": ["reason1", "reason2", "reason3"],
    "concerns": "any concerns or empty string"
  }
]

Sort by score descending. Return ONLY the JSON array, no markdown.`;

  const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  let text = data.content[0].text;
  
  // Strip markdown if present
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const scores = JSON.parse(text);

  console.log('🏆 Candidate Rankings:\n');
  scores.forEach((s, i) => {
    console.log(`  #${i + 1} ${s.name} — Score: ${s.score}/100`);
    s.match_reasons.forEach(r => console.log(`      ✅ ${r}`));
    if (s.concerns) console.log(`      ⚠️  ${s.concerns}`);
    console.log('');
  });

  return scores;
}

// ═══════════════════ Step 5: Hunter.io Email Finder ═══════════════════

async function findEmails(rankings, profiles) {
  console.log('\n━━━ Step 5: Finding Emails via Hunter.io ━━━\n');

  // Only get emails for top 3 candidates
  const topCandidates = rankings.slice(0, 3);
  const results = [];

  for (const candidate of topCandidates) {
    const profile = profiles[candidate.candidate_index - 1];
    if (!profile) continue;

    const firstName = profile.first_name || profile.name?.split(' ')[0] || '';
    const lastName = profile.last_name || profile.name?.split(' ').slice(1).join(' ') || '';
    const company = profile.current_company?.name || '';

    if (!firstName || !company) {
      console.log(`  ⚠️  ${profile.name}: Missing name or company, skipping`);
      results.push({ name: profile.name, email: null, score: 0, reason: 'Missing data' });
      continue;
    }

    console.log(`  🔍 Looking up: ${firstName} ${lastName} at ${company}...`);

    try {
      const params = new URLSearchParams({
        first_name: firstName,
        last_name: lastName,
        company: company,
        api_key: HUNTER_API_KEY
      });

      const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
      const data = await res.json();

      if (data.data?.email) {
        console.log(`     ✅ Found: ${data.data.email} (confidence: ${data.data.score}%)`);
        results.push({
          name: profile.name,
          email: data.data.email,
          score: data.data.score,
          company: data.data.company
        });
      } else {
        console.log(`     ❌ No email found`);
        results.push({ name: profile.name, email: null, score: 0, reason: 'Not found' });
      }
    } catch (err) {
      console.log(`     ❌ Error: ${err.message}`);
      results.push({ name: profile.name, email: null, score: 0, reason: err.message });
    }

    // Rate limit: wait 1s between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n📧 Email Results:');
  results.forEach((r, i) => {
    if (r.email) {
      console.log(`  ${i + 1}. ${r.name}: ${r.email} (${r.score}% confidence)`);
    } else {
      console.log(`  ${i + 1}. ${r.name}: No email found (${r.reason})`);
    }
  });

  return results;
}

// ═══════════════════ Run Full Pipeline ═══════════════════

async function runPipeline() {
  console.log('🚀 HIRELIX FULL PIPELINE TEST\n');
  console.log('Pipeline: JD → Claude Parse → Serper Search → Bright Data Scrape → Claude Score → Hunter Email\n');
  console.log('═'.repeat(60));

  const startTime = Date.now();

  try {
    // Step 1: Parse JD
    const parsed = await parseJD(TEST_JD);

    // Step 2: Search LinkedIn
    const serperCandidates = await searchLinkedIn(parsed);

    if (serperCandidates.length === 0) {
      throw new Error('No candidates found via Serper!');
    }

    // Step 3: Scrape full profiles
    const profiles = await scrapeProfiles(serperCandidates);

    if (profiles.length === 0) {
      throw new Error('No profiles scraped via Bright Data!');
    }

    // Step 4: AI scoring
    const rankings = await scoreWithAI(profiles, TEST_JD);

    // Step 5: Get emails for top candidates
    const emails = await findEmails(rankings, profiles);

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('═'.repeat(60));
    console.log('\n📊 PIPELINE SUMMARY\n');
    console.log(`  ⏱  Total time: ${elapsed}s`);
    console.log(`  🔍 Serper results: ${serperCandidates.length} LinkedIn profiles found`);
    console.log(`  📋 Bright Data: ${profiles.length} full profiles scraped`);
    console.log(`  🏆 AI scored: ${rankings.length} candidates ranked`);
    console.log(`  📧 Emails found: ${emails.filter(e => e.email).length}/${emails.length}`);
    console.log(`  🥇 Top candidate: ${rankings[0]?.name} (${rankings[0]?.score}/100)`);
    
    const topWithEmail = emails.find(e => e.email);
    if (topWithEmail) {
      console.log(`  📬 Top email: ${topWithEmail.name} → ${topWithEmail.email}`);
    }
    console.log('\n✅ FULL 4-LAYER PIPELINE TEST COMPLETE!');

  } catch (error) {
    console.error('\n❌ Pipeline failed:', error.message);
    console.error(error);
  }
}

runPipeline();
