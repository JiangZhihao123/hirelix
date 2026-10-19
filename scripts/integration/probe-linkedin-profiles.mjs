// Standalone, explicitly invoked provider probe. Never writes product records.
// start sends exactly one paid request; subsequent calls resume the saved snapshot.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const [phase, inputPath, outputPath] = process.argv.slice(2);
if (!['start', 'collect', 'billing', 'analyze'].includes(phase) || !inputPath || !outputPath) {
  throw new Error('Usage: node scripts/integration/probe-linkedin-profiles.mjs start|collect|billing|analyze INPUT.json OUTPUT_DIRECTORY');
}
const token = process.env.BRIGHTDATA_API_TOKEN;
const datasetId = process.env.BRIGHTDATA_DATASET_ID || 'gd_l1viktl72bvl7bjuj0';
if (phase !== 'analyze' && (!token || datasetId !== 'gd_l1viktl72bvl7bjuj0')) throw new Error('Configure the existing LinkedIn people profiles scraper credentials');
const inputs = JSON.parse(await readFile(inputPath, 'utf8'));
if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 10) throw new Error('Probe accepts 1–10 explicit public profile URLs');
for (const input of inputs) {
  const url = new URL(input.url);
  if (url.protocol !== 'https:' || url.username || url.password || !/(^|\.)linkedin\.com$/.test(url.hostname) || !/^\/in\/[^/]+\/?$/.test(url.pathname) || url.search || url.hash) throw new Error('Expected a public LinkedIn /in/ profile URL');
}
if (new Set(inputs.map(input => input.url)).size !== inputs.length) throw new Error('Duplicate input URLs');
await mkdir(outputPath, { recursive: true, mode: 0o700 });
const statePath = path.join(outputPath, 'state.json');
const fingerprint = createHash('sha256').update(JSON.stringify({datasetId, inputs})).digest('hex');
async function save(name, data) {
  await writeFile(path.join(outputPath, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}
async function request(endpoint, options = {}) {
  const response = await fetch(`https://api.brightdata.com${endpoint}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Bright Data ${endpoint}: HTTP ${response.status}, non-JSON response`); }
  if (!response.ok) throw new Error(`Bright Data ${endpoint}: HTTP ${response.status}; ${JSON.stringify(data).replaceAll(token, '[redacted]').slice(0, 300)}`);
  return data;
}
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (state && state.fingerprint !== fingerprint) throw new Error('Output directory belongs to a different probe');

if (phase === 'analyze') {
  const records = JSON.parse(await readFile(path.join(outputPath, 'raw-profiles.json'), 'utf8'));
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const profileId = value => { try { return decodeURIComponent(new URL(value).pathname).replace(/\/$/, '').toLowerCase(); } catch { return null; } };
  const people = inputs.map(input => {
    const matches = records.filter(record => profileId(record.input_url || record.input?.url || record.url) === profileId(input.url));
    if (matches.length !== 1) return {id: input.id, input_url: input.url, matched_records: matches.length};
    const p = matches[0], experience = list(p.experience), education = list(p.education);
    return { id: input.id, expected_name: input.name, returned_name: p.name, input_url: input.url, returned_url: p.url,
      matched_records: 1, same_profile_path: profileId(p.url) === profileId(input.url), error: p.error || null,
      fields: {name: text(p.name), company: text(p.current_company?.name || p.current_company_name),
        current_title: text(p.position), location: text(p.city || p.location), country: text(p.country_code),
        about: text(p.about), experience: experience.length > 0,
        employment_dates: experience.some(e => text(e.start_date || e.start_year || e.end_date || e.end_year || e.duration)),
        employment_descriptions: experience.some(e => text(e.description || e.description_html)),
        education: education.some(e => text(e.title || e.institute_name)), skills: list(p.skills).length > 0,
        certifications: list(p.certifications).length > 0, recommendations: list(p.recommendations).length > 0,
        projects: list(p.projects).length > 0, timestamp: text(p.timestamp)},
      company: p.current_company?.name || p.current_company_name || null, current_title: p.position || null,
      location: p.city || p.location || null, country: p.country_code || null,
      about_characters: p.about?.length || 0, about_ends_in_ellipsis: typeof p.about === 'string' && /(?:…|\.\.\.)$/.test(p.about.trim()),
      experience_count: experience.length, named_education_count: education.filter(e => text(e.title || e.institute_name)).length,
      unnamed_education_count: education.filter(e => !text(e.title || e.institute_name)).length,
      certification_count: list(p.certifications).length, recommendation_count: list(p.recommendations).length,
      project_count: list(p.projects).length, collected_at: p.timestamp || null };
  });
  const keys = [...new Set(people.flatMap(p => Object.keys(p.fields || {})))];
  const report = {snapshot_id: state?.snapshot_id, requested: inputs.length, returned: records.length,
    provider_error_records: records.filter(p => p.error || p.error_code).length,
    coverage: Object.fromEntries(keys.map(key => [key, {present: people.filter(p => p.fields?.[key]).length, total: inputs.length}])),
    people, limitations: ['Field presence measures returned data, not completeness against an authenticated LinkedIn profile.',
      'Null experience means the provider returned no experience; it does not mean the person has none.',
      'Profile path agreement is not a complete independent identity check.',
      'Search-discoverable convenience sample, not a representative population sample.']};
  await save('quality.json', report);
  console.log(JSON.stringify(report, null, 2));
} else if (phase === 'start') {
  if (state) throw new Error('A submission was already attempted. Use collect; never automatically repeat a paid request.');
  const balance = await request('/customer/balance');
  if (!Number.isFinite(balance.balance) || balance.balance < 0.05) throw new Error('Insufficient confirmed account balance');
  await save('balance-before.json', { checked_at: new Date().toISOString(), ...balance });
  state = { fingerprint, dataset_id: datasetId, inputs, started_at: new Date().toISOString(), submission: 'dispatching', balance_before: balance.balance };
  // Write before dispatch, so an ambiguous timeout cannot cause a duplicate job.
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const result = await request(`/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true`, {
    method: 'POST', body: JSON.stringify(inputs.map(({url}) => ({url}))),
  });
  await save('trigger-response.json', result);
  if (!result.snapshot_id) throw new Error('Trigger returned no snapshot ID; inspect the saved response before any further submission');
  state.snapshot_id = result.snapshot_id;
  state.submission = 'accepted';
  await save('state.json', state);
  console.log(JSON.stringify({snapshot_id: state.snapshot_id, requested: inputs.length, balance_before: balance.balance}));
} else {
  if (!state?.snapshot_id) throw new Error('No confirmed snapshot. Inspect submission state; do not resubmit automatically.');
  if (phase === 'collect') {
    const progress = await request(`/datasets/v3/progress/${state.snapshot_id}`);
    await save('progress.json', { checked_at: new Date().toISOString(), ...progress });
    console.log(JSON.stringify({snapshot_id: state.snapshot_id, progress}));
    if (progress.status === 'ready') {
      const records = await request(`/datasets/v3/snapshot/${state.snapshot_id}?format=json`);
      if (!Array.isArray(records)) throw new Error('Snapshot did not return a record array');
      await save('raw-profiles.json', records);
      state.completed_at ||= new Date().toISOString();
      state.records = records.length;
      await save('state.json', state);
      console.log(JSON.stringify({records: records.length, elapsed_ms: Date.parse(state.completed_at) - Date.parse(state.started_at)}));
    }
  }
  const balance = await request('/customer/balance');
  const observation = { checked_at: new Date().toISOString(), ...balance, before: state.balance_before,
    observed_balance_decrease: Number.isFinite(balance.balance) ? Number((state.balance_before - balance.balance).toFixed(8)) : null,
    note: 'Account-level observation; may be rounded, delayed or include unrelated usage. Not a per-snapshot invoice.' };
  await save('balance-after.json', observation);
  console.log(JSON.stringify({balance_after: balance.balance, observed_balance_decrease: observation.observed_balance_decrease}));
}
