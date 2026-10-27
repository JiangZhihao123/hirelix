/* Trusted helper: the model can modify /work but not this image. */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
const ROOT = '/work';
const MAX_FILE = 50 * 1024 * 1024;
const MAX_ENTRIES = 1000;

function parts(name) {
  if (typeof name !== 'string' || !name.startsWith('/work/') || name.includes('\\') || name.includes('\0')) throw new Error('Use a file path under /work.');
  const components = name.slice('/work/'.length).split('/');
  if (components.some(part => !part || part === '.' || part === '..')) throw new Error('Use a safe file path under /work.');
  return components;
}
async function target(name, makeDirectories) {
  const components = parts(name);
  let parent = ROOT;
  for (const part of components.slice(0, -1)) {
    parent = path.join(parent, part);
    if (makeDirectories) {
      try { await fs.promises.mkdir(parent); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const stat = await fs.promises.lstat(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Workspace paths cannot traverse symbolic links.');
  }
  return path.join(parent, components.at(-1));
}
async function list() {
  const files = [];
  let truncated = false, visited = 0;
  async function walk(dir, depth = 0) {
    if (depth > 64) { truncated = true; return; }
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++visited > 4096 || files.length >= MAX_ENTRIES) { truncated = true; return; }
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(name, depth + 1);
      else if (entry.isFile()) {
        const info = await fs.promises.lstat(name);
        if (info.isFile()) files.push({ path: name, size: info.size });
      }
      if (truncated) return;
    }
  }
  await walk(ROOT);
  process.stdout.write(JSON.stringify({ files, truncated }));
}
async function read(name) {
  const file = await target(name, false);
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Only regular workspace files can be read.');
    if (info.size > MAX_FILE) throw new Error('A workspace file cannot exceed 50 MB.');
    await pipeline(handle.createReadStream({ autoClose: false }), process.stdout);
  } finally { await handle.close(); }
}
async function write(name) {
  const file = await target(name, true);
  const handle = await fs.promises.open(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Only regular workspace files can be written.');
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > MAX_FILE) throw new Error('A workspace file cannot exceed 50 MB.');
      await handle.writeFile(chunk);
    }
  } finally { await handle.close(); }
}
(async () => {
  const [command, name] = process.argv.slice(2);
  if (command === 'list') await list();
  else if (command === 'read') await read(name);
  else if (command === 'write') await write(name);
  else throw new Error('Unknown workspace operation.');
})().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });
