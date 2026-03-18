import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envPath = '/Users/noah/projects/hirelix/.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const snapshotId = 'snap_mmv0dlb3f60n1s7tr';
  const res = await fetch(`https://api.brightdata.com/datasets/snapshots/${snapshotId}/download?format=json`, {
    headers: {
      Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}`,
    },
  });
  const brightData = await res.json();
  const brightSample = Array.isArray(brightData)
    ? brightData.slice(0, 20).map((x: any, i: number) => ({
        index: i + 1,
        name: x.name ?? null,
        headline: x.headline ?? x.current_title ?? x.position ?? x.title ?? null,
        location: x.city ?? x.location ?? null,
        country_code: x.country_code ?? null,
        skills: Array.isArray(x.skills) ? x.skills.slice(0, 8) : [],
        about: typeof x.about === 'string' ? x.about.slice(0, 160) : null,
        url: x.url ?? x.input_url ?? null,
      }))
    : brightData;

  const { data: serper } = await supabase
    .from('hirelix_candidates')
    .select('name,headline,location,skills,match_score,match_reasons,profile_url')
    .eq('search_id', 'af7df0f1-4cd9-4e8b-87ba-36f32c1cdf84')
    .order('match_score', { ascending: false })
    .limit(20);

  console.log(JSON.stringify({
    bright_count: Array.isArray(brightData) ? brightData.length : null,
    bright_sample: brightSample,
    serper_sample: serper || [],
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
