/**
 * Test script for new LLM-based email lookup with multi-strategy approach
 */

const fs = require('fs');

// Load env
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}

// Mock candidate data with Bright Data metadata
const testCandidates = [
  {
    name: "Sarah Chen",
    headline: "Senior Software Engineer at Stripe",
    metadata: {
      work_history: [
        { company: "Stripe", title: "Senior Software Engineer", duration: "2 yrs" },
        { company: "Google", title: "Software Engineer", duration: "3 yrs" }
      ],
      about: "Passionate about building scalable payment systems. Currently at Stripe working on infrastructure."
    }
  },
  {
    name: "John Smith",
    headline: "Product Manager",
    metadata: {
      work_history: [
        { company: "Microsoft", title: "Senior Product Manager", duration: "1 yr" },
        { company: "Amazon", title: "Product Manager", duration: "2 yrs" }
      ],
      about: "Leading product strategy at Microsoft for Azure services."
    }
  },
  {
    name: "Emily Rodriguez",
    headline: "Engineering Manager @ Airbnb",
    metadata: {
      work_history: [
        { company: "Airbnb", title: "Engineering Manager", duration: "2 yrs" },
        { company: "Uber", title: "Senior Engineer", duration: "3 yrs" }
      ]
    }
  }
];

async function testLLMExtraction(candidate) {
  console.log(`\n=== Testing LLM Company Extraction for ${candidate.name} ===`);
  
  const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  const ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL;
  const MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  
  const workHistory = candidate.metadata.work_history;
  const about = candidate.metadata.about;
  
  const prompt = `Extract the current company name and website domain from this LinkedIn profile data.

Headline: ${candidate.headline || "N/A"}
Work History: ${workHistory ? JSON.stringify(workHistory.slice(0, 3)) : "N/A"}
About: ${about?.substring(0, 300) || "N/A"}

Return JSON with:
- company_name: string (current employer, e.g. "Stripe", "Google", "Microsoft")
- domain: string (company website domain without https://, e.g. "stripe.com", "google.com")

If uncertain, return null for that field. Return ONLY valid JSON, no markdown.`;

  const res = await fetch(ANTHROPIC_BASE_URL + '/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    }),
  });
  
  if (!res.ok) {
    console.log(`  ❌ Claude API failed: ${res.status}`);
    return null;
  }
  
  const data = await res.json();
  let text = data.content?.[0]?.text || '';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  try {
    const result = JSON.parse(text);
    console.log(`  ✅ Extracted: company="${result.company_name}", domain="${result.domain}"`);
    return result;
  } catch (e) {
    console.log(`  ❌ JSON parse failed:`, e.message);
    console.log(`  Raw:`, text.substring(0, 200));
    return null;
  }
}

async function testHunterDomainSearch(companyName) {
  console.log(`\n=== Testing Hunter Domain Search for "${companyName}" ===`);
  
  const HUNTER_API_KEY = env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    console.log('  ⚠️  No Hunter API key');
    return null;
  }
  
  const params = new URLSearchParams({
    company: companyName,
    api_key: HUNTER_API_KEY,
  });
  
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);
    if (!res.ok) {
      console.log(`  ❌ Hunter domain-search failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const domain = data.data?.domain || null;
    console.log(`  ✅ Found domain: ${domain}`);
    return domain;
  } catch (err) {
    console.log(`  ❌ Error:`, err.message);
    return null;
  }
}

async function testHunterEmailFinder(firstName, lastName, domain) {
  console.log(`\n=== Testing Hunter Email Finder: ${firstName} ${lastName} @ ${domain} ===`);
  
  const HUNTER_API_KEY = env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    console.log('  ⚠️  No Hunter API key');
    return null;
  }
  
  const params = new URLSearchParams({
    first_name: firstName,
    last_name: lastName,
    domain,
    api_key: HUNTER_API_KEY,
  });
  
  try {
    const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
    if (!res.ok) {
      console.log(`  ❌ Hunter email-finder failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const email = data.data?.email || null;
    const score = data.data?.score || 0;
    if (email) {
      console.log(`  ✅ Found email: ${email} (confidence: ${score}%)`);
    } else {
      console.log(`  ❌ No email found`);
    }
    return { email, score };
  } catch (err) {
    console.log(`  ❌ Error:`, err.message);
    return null;
  }
}

async function testEmailPatternGuessing(firstName, lastName, domain) {
  console.log(`\n=== Testing Email Pattern Guessing + Verification ===`);
  
  const HUNTER_API_KEY = env.HUNTER_API_KEY;
  if (!HUNTER_API_KEY) {
    console.log('  ⚠️  No Hunter API key');
    return null;
  }
  
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();
  const patterns = [
    `${f}.${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f}@${domain}`,
    `${f[0]}${l}@${domain}`,
  ];
  
  console.log(`  Testing ${patterns.length} patterns...`);
  
  for (const email of patterns) {
    const params = new URLSearchParams({
      email,
      api_key: HUNTER_API_KEY,
    });
    
    try {
      const res = await fetch(`https://api.hunter.io/v2/email-verifier?${params}`);
      if (!res.ok) continue;
      const data = await res.json();
      const valid = data.data?.status === 'valid';
      const score = data.data?.score || 0;
      
      console.log(`  ${valid && score >= 70 ? '✅' : '❌'} ${email}: ${data.data?.status} (${score}%)`);
      
      if (valid && score >= 70) {
        return { email, score };
      }
    } catch (err) {
      console.log(`  ❌ ${email}: ${err.message}`);
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`  ❌ No valid pattern found`);
  return null;
}

async function testFullPipeline(candidate) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING: ${candidate.name}`);
  console.log(`${'='.repeat(60)}`);
  
  const nameParts = candidate.name.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');
  
  // Step 1: LLM extract company info
  const extracted = await testLLMExtraction(candidate);
  if (!extracted || !extracted.company_name) {
    console.log(`\n❌ Failed to extract company info, stopping`);
    return { success: false, email: null };
  }
  
  let domain = extracted.domain;
  
  // Step 2: Hunter domain-search if no domain
  if (!domain) {
    domain = await testHunterDomainSearch(extracted.company_name);
  }
  
  if (!domain) {
    console.log(`\n❌ No domain found, stopping`);
    return { success: false, email: null };
  }
  
  // Step 3: Hunter email-finder
  const emailResult = await testHunterEmailFinder(firstName, lastName, domain);
  if (emailResult?.email) {
    console.log(`\n✅ SUCCESS: Found ${emailResult.email} via Hunter email-finder`);
    return { success: true, email: emailResult.email, method: 'hunter-finder' };
  }
  
  // Step 4: Pattern guessing + verification
  const patternResult = await testEmailPatternGuessing(firstName, lastName, domain);
  if (patternResult?.email) {
    console.log(`\n✅ SUCCESS: Found ${patternResult.email} via pattern guessing`);
    return { success: true, email: patternResult.email, method: 'pattern-guess' };
  }
  
  console.log(`\n❌ FAILED: No email found for ${candidate.name}`);
  return { success: false, email: null };
}

async function main() {
  console.log('Starting Email Lookup Test...\n');
  
  const results = [];
  
  for (const candidate of testCandidates) {
    const result = await testFullPipeline(candidate);
    results.push({ name: candidate.name, ...result });
    
    // Rate limit between candidates
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  
  const successCount = results.filter(r => r.success).length;
  const successRate = (successCount / results.length * 100).toFixed(1);
  
  console.log(`\nTotal candidates: ${results.length}`);
  console.log(`Emails found: ${successCount}`);
  console.log(`Success rate: ${successRate}%\n`);
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const method = r.method ? ` (${r.method})` : '';
    console.log(`${status} ${r.name}: ${r.email || 'not found'}${method}`);
  });
}

main().catch(e => console.error('Error:', e.message));
