import { spawn } from 'node:child_process';
import net from 'node:net';
import { watchFile, unwatchFile } from 'node:fs';
import nextEnv from '@next/env';

// Use the same precedence and variable expansion as Next.js. Inherited settings
// (for example an explicitly selected QA database) always take precedence.
process.env.NODE_ENV ??= 'development';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const needsTunnel = dbUrl && ['localhost', '127.0.0.1'].includes(dbUrl.hostname) && dbUrl.port === '15432';
let tunnel;
let next;
let worker;
let retry;
let stopping = false;
let restarting = false;
const envFiles = ['.env.development.local', '.env.local', '.env.development', '.env'];

function portReady() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 15432 });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function connectTunnel() {
  if (stopping) return;
  console.info('[dev] Connecting database SSH tunnel');
  tunnel = spawn('ssh', ['-NT', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
    '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2',
    '-L', '127.0.0.1:15432:127.0.0.1:5432', 'us-2'], { stdio: 'inherit' });
  tunnel.on('error', error => console.error('[dev] SSH could not start:', error.message));
  tunnel.once('close', () => {
    tunnel = undefined;
    if (!stopping) {
      console.warn('[dev] Database tunnel disconnected; reconnecting in 2 seconds');
      retry = setTimeout(connectTunnel, 2000);
    }
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  envFiles.forEach(file => unwatchFile(file));
  clearTimeout(retry);
  next?.kill('SIGTERM');
  worker?.kill('SIGTERM');
  tunnel?.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

if (needsTunnel && !(await portReady())) {
  connectTunnel();
  const deadline = Date.now() + 30000;
  while (!stopping && !(await portReady()) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!stopping && !(await portReady())) {
    console.error('[dev] Database tunnel unavailable. Check SSH us-2 and the local proxy.');
    stop(1);
  }
} else if (needsTunnel) {
  console.info('[dev] Reusing the existing database tunnel');
  // If an externally started tunnel exits, take ownership of reconnection.
  const monitor = setInterval(async () => {
    if (!stopping && !tunnel && !retry && !(await portReady())) connectTunnel();
  }, 2000);
  monitor.unref();
}

function childClosed(kind, code) {
  if (kind === 'worker') worker = undefined;
  else next = undefined;
  if (stopping) return;
  if (!restarting) return stop(code || 1);
  // Wait for both old processes to release their ports and database pools.
  if (!worker && !next) {
    restarting = false;
    startProcesses();
  }
}

function startProcesses() {
  const env = { ...loadEnvConfig(process.cwd(), true, undefined, true).combinedEnv,
    SEARCH_JOB_SCHEDULER_ENABLED: 'false' };
  worker = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'watch', '--tsconfig', 'scheduler/tsconfig.json', 'scheduler/index.ts'], {
    stdio: 'inherit', env,
  });
  worker.on('error', error => { console.error('[dev] Agent worker could not start:', error.message); stop(1); });
  worker.once('close', code => childClosed('worker', code));
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', ...process.argv.slice(2)], { stdio: 'inherit', env });
  next.on('error', error => { console.error('[dev] Next.js could not start:', error.message); stop(1); });
  next.once('close', code => childClosed('web', code));
}

if (!stopping) {
  startProcesses();
  // tsx ignores dotfiles even with --include; explicitly watch local env files.
  envFiles.forEach(file => watchFile(file, { interval: 500 }, (current, previous) => {
    if (stopping || restarting || current.mtimeMs === previous.mtimeMs) return;
    console.info('[dev] Environment changed; restarting web and Agent worker');
    restarting = true;
    worker?.kill('SIGTERM');
    next?.kill('SIGTERM');
  }));
}
