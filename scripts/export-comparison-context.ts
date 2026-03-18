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
  const { data: parsedData } = await supabase
    .from('hirelix_searches')
    .select('parsed_requirements')
    .eq('id', 'ddcf1f12-91e8-4a89-ac38-629c96f38a73')
    .single();

  const { data: serperData } = await supabase
    .from('hirelix_candidates')
    .select('name,headline,location,skills,match_score,match_reasons,profile_url')
    .eq('search_id', 'af7df0f1-4cd9-4e8b-87ba-36f32c1cdf84')
    .order('match_score', { ascending: false });

  const res = await fetch('https://api.brightdata.com/datasets/snapshots/snap_mmv0dlb3f60n1s7tr/download?format=json', {
    headers: {
      Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN}`,
    },
  });
  const brightData = await res.json();

  const output = {
    parsed_requirements: parsedData?.parsed_requirements || null,
    bright_count: Array.isArray(brightData) ? brightData.length : null,
    bright_candidates: brightData,
    serper_count: Array.isArray(serperData) ? serperData.length : null,
    serper_candidates: serperData || [],
  };

  const outPath = '/Users/noah/projects/hirelix/analysis-bright-vs-serper.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
