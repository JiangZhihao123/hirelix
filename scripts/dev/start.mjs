import { spawn } from 'node:child_process';
import net from 'node:net';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const needsTunnel = dbUrl && ['localhost', '127.0.0.1'].includes(dbUrl.hostname) && dbUrl.port === '15432';
let tunnel;
let next;
let worker;
let retry;
let stopping = false;

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

if (!stopping) {
  worker = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'watch', '--include', '.env.local', '--include', '.env', '--tsconfig', 'scheduler/tsconfig.json', 'scripts/dev/worker.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, SEARCH_JOB_SCHEDULER_ENABLED: 'false' },
  });
  worker.on('error', error => { console.error('[dev] Agent worker could not start:', error.message); stop(1); });
  worker.once('close', code => { if (!stopping) stop(code || 1); });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', ...process.argv.slice(2)], { stdio: 'inherit' });
  next.on('error', error => { console.error('[dev] Next.js could not start:', error.message); stop(1); });
  next.once('close', code => stop(code ?? 1));
}
