#!/usr/bin/env node
// Copy an existing root-owned VPS backup to a private directory on another host.
// Does not create a remote dump, alter production data, or delete old backups.
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, stat, open, link, unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {isAbsolute, join} from 'node:path';
const exec = promisify(execFile);
const [host, destination] = process.argv.slice(2);
if (process.argv.length !== 4 || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(host || '') || !isAbsolute(destination || '')) {
  throw Error('Usage: node scripts/ops/pull-database-backup.mjs <SSH-host-alias> <absolute-private-directory>');
}
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const ssh = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', host];
const metadataScript = `from pathlib import Path
import hashlib,json
files=sorted(p for p in Path('/var/backups/hirelix').glob('daily-*.dump') if p.is_file() and not p.is_symlink())
if not files: raise RuntimeError('No daily backup is available')
p=files[-1]
h=hashlib.sha256()
with p.open('rb') as f:
 while chunk:=f.read(1048576): h.update(chunk)
print(json.dumps({'name':p.name,'bytes':p.stat().st_size,'sha256':h.hexdigest(),'modified':p.stat().st_mtime}))`;
const {stdout} = await exec('ssh', [...ssh, 'sudo -n python3 -c ' + quote(metadataScript)], {timeout:120000,maxBuffer:4096});
const source = JSON.parse(stdout);
if (!/^daily-\d{8}T\d{6}Z\.dump$/.test(source.name) || !/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isSafeInteger(source.bytes) || source.bytes<=0 || !Number.isFinite(source.modified)) throw Error('Invalid remote backup metadata');
if (Date.now()/1000-source.modified>26*3600) throw Error('Latest remote backup is older than 26 hours; refusing to report a healthy off-host copy');
await mkdir(destination,{recursive:true,mode:0o700});
const directory = await stat(destination);
if ((directory.mode & 0o077)!==0) throw Error('Destination must be private (mode 700) before copying database contents');
async function digest(file) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const target=join(destination,source.name);
let existing;
try {existing=await stat(target);} catch(error) {if(error.code!=='ENOENT')throw error;}
if (existing) {
  if(!existing.isFile() || (existing.mode & 0o077)!==0 || existing.size!==source.bytes || await digest(target)!==source.sha256) throw Error('Existing destination does not match the private backup; it was not overwritten');
  console.log(JSON.stringify({status:'already_verified',name:source.name,bytes:source.bytes,sha256:source.sha256}));
} else {
  const partial=target+'.partial-'+randomUUID();
  const handle=await open(partial,'wx',0o600);
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn('ssh',[...ssh,'sudo -n cat '+quote('/var/backups/hirelix/'+source.name)],{stdio:['ignore',handle.fd,'pipe']});
      child.stderr.resume();
      child.once('error',reject);
      child.once('close',code=>code===0?resolve():reject(Error('Backup transfer failed; retry does not overwrite a verified copy')));
    });
    await handle.sync();
    await handle.close();
    if ((await stat(partial)).size!==source.bytes || await digest(partial)!==source.sha256) throw Error('Transferred backup failed size or SHA-256 verification');
    await link(partial,target); // Atomic creation: never replace an existing path.
    console.log(JSON.stringify({status:'copied_and_verified',name:source.name,bytes:source.bytes,sha256:source.sha256}));
  } finally {
    await handle.close().catch(()=>{});
    await unlink(partial).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}
