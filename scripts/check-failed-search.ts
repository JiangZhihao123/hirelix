import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (!process.env[key]) process.env[key] = value;
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from('hirelix_searches')
    .select('parsed_requirements, error_message')
    .eq('id', '2b14354e-e60a-42d2-9596-9416ea190372')
    .single();

  if (data?.parsed_requirements) {
    const parsed = data.parsed_requirements as any;
    console.log('=== JD 解析结果 ===');
    console.log('Title:', parsed.title);
    console.log('\n=== Recall Spec ===');
    console.log(JSON.stringify(parsed.recall_spec, null, 2));
    console.log('\n=== Recall Metadata ===');
    console.log(JSON.stringify(parsed.recall_metadata, null, 2));
    console.log('\n=== Error Message ===');
    console.log(data.error_message || 'None');
  }
}

main();
