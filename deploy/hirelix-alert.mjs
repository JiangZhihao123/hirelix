#!/usr/bin/env node
// Explicitly opt-in: preview is the default; --send needs an approved recipient.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const alertUnits=['hirelix-health.service','hirelix-backup.service','test'];

/** @param {string} unit @param {Record<string, string | undefined>} env @param {number} now */
export function alertPlan(unit, env=process.env, now=Date.now()) {
  if (!alertUnits.includes(unit)) throw Error('Unsupported alert unit');
  const to=env.HIRELIX_ALERT_TO, from=env.SEARCH_NOTIFICATIONS_FROM_EMAIL;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || '') || !from || /[\r\n]/.test(from)) throw Error('Configure an approved HIRELIX_ALERT_TO and SEARCH_NOTIFICATIONS_FROM_EMAIL');
  const hour=Math.floor(now/3600000);
  const body={from,to:[to],subject:unit==='test'?'Hirelix operational alert connection check':`Hirelix needs attention: ${unit}`,
    text:unit==='test'?'This is the requested one-time check of the Hirelix operational alert channel. No customer data is included.':`The ${unit} check failed. Inspect the service status and its journal on the Hirelix server. This notice contains no customer data. Further failures of the same check are limited to one notice per UTC hour.`};
  const key='hirelix-ops-'+createHash('sha256').update(JSON.stringify({unit,hour,body})).digest('hex');
  return {unit,key,body};
}
async function main() {
  const [unit,mode='--preview']=process.argv.slice(2);
  if(process.argv.length>4 || !alertUnits.includes(unit) || !['--preview','--send'].includes(mode)) throw Error('Usage: hirelix-alert.mjs <hirelix-health.service|hirelix-backup.service|test> [--preview|--send]');
  if(mode==='--preview') {
    console.log(JSON.stringify({mode:'preview',unit,recipientConfigured:!!process.env.HIRELIX_ALERT_TO,senderConfigured:!!process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL,providerConfigured:!!process.env.RESEND_API_KEY,sent:false}));return;
  }
  const plan=alertPlan(unit);
  if(!process.env.RESEND_API_KEY) throw Error('RESEND_API_KEY is required');
  const directory=process.env.STATE_DIRECTORY || '/var/lib/hirelix-alert';
  await mkdir(directory,{recursive:true,mode:0o700});
  const stateFile=join(directory,unit+'.json');
  let previous;
  try {previous=JSON.parse(await readFile(stateFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous?.key===plan.key){console.log(JSON.stringify({unit,status:'suppressed_same_hour'}));return;}
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':plan.key},body:JSON.stringify(plan.body),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw Error(`Alert provider returned HTTP ${response.status}`);
  const receipt=await response.json();
  if(typeof receipt.id!=='string') throw Error('Alert provider did not return a receipt');
  const temporary=stateFile+'.tmp';
  await writeFile(temporary,JSON.stringify({key:plan.key,receipt:receipt.id}),{mode:0o600});
  await rename(temporary,stateFile);
  console.log(JSON.stringify({unit,status:'accepted_by_provider',receipt:receipt.id}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error.message);process.exitCode=1;});
