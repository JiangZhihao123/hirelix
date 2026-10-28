import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { WorkspaceError, rows, type Runner } from "./database";
import { MAX_FILE_BYTES, readFile, saveFile } from "./files";

// This image must be built before enabling the tools; it is never pulled at runtime.
const IMAGE = "hirelix-agent-sandbox:1";
const MAX_INPUT_BYTES = 128 * 1024 * 1024;
const MAX_OUTPUT_BYTES = MAX_FILE_BYTES;
const INLINE_OUTPUT_BYTES = 16 * 1024;
const SCOPE_LABEL = "hirelix.agent.scope";
const MANAGED_LABEL = "hirelix.agent.managed";
const DATABASE_LABEL = "hirelix.agent.database";
const JOB_LABEL = "hirelix.agent.job";
const LEASE_LABEL = "hirelix.agent.lease";
const MANAGED_VALUE = "workspace-v1";
const RECOVERY_GRACE_MS = 5 * 60 * 1000;
const WORKDIR = "/work";

export type FileExecutionContext = {
  userId: string;
  conversationId: string;
  jobId: string;
  /** Unique to this execution attempt, shared by all of its tool calls. */
  leaseKey: string;
  signal?: AbortSignal;
  /** Commit file bytes and the tool receipt together under the active job lease. */
  commit?: <T>(apply: (tx: Runner) => Promise<T>) => Promise<T>;
};

function normalizeWorkspacePath(value: string) {
  const name = value.startsWith("/") ? value : `${WORKDIR}/${value}`;
  if (!name.startsWith(`${WORKDIR}/`) || name.includes("\\") || name.includes("\0") ||
      name.slice(WORKDIR.length + 1).split("/").some((part) => !part || part === "." || part === ".."))
    throw new WorkspaceError("Use a file path under /work without symbolic path traversal.");
  return name;
}
const workspacePath = z.string().min(1).max(1000).refine((value) => {
  try { normalizeWorkspacePath(value); return true; } catch { return false; }
}, "Use a file path under /work without symbolic path traversal.");

export const bashInputSchema = z.object({
  command: z.string().min(1).max(50000),
  input_file_ids: z.array(z.uuid()).max(20).default([]),
  output_paths: z.array(workspacePath).max(20).default([]),
});
export const writeFileInputSchema = z.object({
  path: workspacePath,
  content: z.string().max(2 * 1024 * 1024),
  persist: z.boolean().default(false),
});
export const readWorkspaceFileInputSchema = z.object({ path: workspacePath });

type DockerResult = { code: number; stdout: Buffer; stderr: Buffer; truncated: boolean; stdoutTruncated: boolean; stderrTruncated: boolean; timedOut: boolean; aborted: boolean };
type DockerOptions = { input?: Buffer; signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; stop?: () => void };

function abortError() { return new DOMException("File execution was interrupted", "AbortError"); }
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
function commit<T>(ctx: FileExecutionContext, apply: (tx: Runner) => Promise<T>) {
  if (!ctx.commit) throw new WorkspaceError("The file tool requires a lease-checked receipt transaction.", 503);
  return ctx.commit(apply);
}
function scope(ctx: FileExecutionContext) {
  if ([ctx.userId, ctx.conversationId, ctx.jobId, ctx.leaseKey].some((part) => !part || part.length > 300))
    throw new WorkspaceError("File execution requires a user, conversation, job, and unique execution lease.");
  return createHash("sha256").update(JSON.stringify([ctx.userId, ctx.conversationId, ctx.jobId, ctx.leaseKey])).digest("hex").slice(0, 32);
}
function resourceNames(ctx: FileExecutionContext) {
  const id = scope(ctx);
  return { id, volume: `hirelix-agent-work-${id}`, keeper: `hirelix-agent-keeper-${id}`, lock: `hirelix-agent-lock-${id}` };
}

// Docker can be shared by several QA databases or services. A cluster and
// database identity prevents one worker from reclaiming another's resources;
// no connection string or credentials are stored in Docker metadata.
async function databaseNamespace() {
  const [identity] = await rows<{cluster: string; database: string; address: string; port: number | null}>(sql`
    SELECT (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      d.oid::text AS database, coalesce(inet_server_addr()::text, 'local') AS address,
      inet_server_port() AS port FROM pg_database d WHERE d.datname=current_database()`);
  if (!identity) throw new WorkspaceError("Could not identify the file workspace database.", 503);
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32);
}

/** Docker is invoked without a shell. No model input is executed on the host. */
async function docker(args: string[], options: DockerOptions = {}): Promise<DockerResult> {
  checkAbort(options.signal);
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[][] = [[], []];
    const sizes = [0, 0];
    const max = options.maxBytes ?? 2 * 1024 * 1024;
    let truncated = false, timedOut = false, aborted = false, stopCalled = false;
    const stop = () => {
      if (stopCalled) return;
      stopCalled = true;
      options.stop?.();
      // A Docker daemon can be unavailable while an attached CLI is still open.
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
      if (!options.stop) child.kill("SIGKILL");
    };
    const collect = (index: number, chunk: Buffer) => {
      const remaining = Math.max(0, max - sizes[index]);
      if (remaining) chunks[index].push(chunk.subarray(0, remaining));
      sizes[index] += chunk.length;
      if (sizes[index] > max) { truncated = true; stop(); }
    };
    child.stdout.on("data", (chunk: Buffer) => collect(0, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(1, chunk));
    child.stdin.on("error", () => {});
    child.stdin.end(options.input);
    const onAbort = () => { aborted = true; stop(); };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs ?? 30000);
    timer.unref();
    child.on("error", (error) => { clearTimeout(timer); options.signal?.removeEventListener("abort", onAbort); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ code: code ?? -1, stdout: Buffer.concat(chunks[0]), stderr: Buffer.concat(chunks[1]), truncated, stdoutTruncated: sizes[0] > max, stderrTruncated: sizes[1] > max, timedOut, aborted });
    });
  });
}
async function requiredDocker(args: string[], options: DockerOptions = {}) {
  const result = await docker(args, options);
  if (result.aborted) throw abortError();
  if (result.timedOut || result.truncated || result.code !== 0)
    throw new WorkspaceError(`The isolated file workspace failed: ${result.stderr.toString("utf8").trim().slice(0, 1000) || (result.timedOut ? "Docker operation timed out" : "Docker is unavailable or the sandbox image is missing")}`, 503);
  return result.stdout;
}
function removeContainer(name: string) { void docker(["rm", "-f", name], { timeoutMs: 10000 }).catch(() => {}); }
async function removeResource(kind: "container" | "volume", name: string) {
  const args = kind === "container" ? ["rm", "-f", name] : ["volume", "rm", name];
  const result = await docker(args, { timeoutMs: 10000 });
  if (result.code !== 0 && result.stderr.toString().toLowerCase().includes(`no such ${kind}`)) return false;
  if (result.code !== 0 || result.timedOut || result.truncated)
    throw new WorkspaceError(`Could not remove the isolated ${kind}: ${result.stderr.toString().trim().slice(0, 500)}`, 503);
  return true;
}
type WorkspaceNames = ReturnType<typeof resourceNames> & { labels: string[] };
const common = (names: WorkspaceNames) => [
  ...names.labels, "--network", "none", "--read-only",
  "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "1000:1000",
  "--pids-limit", "64", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1",
  "--shm-size", "8m", "--ulimit", "nofile=256:256", "--ulimit", "core=0:0",
  "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m",
  // Docker CLI can otherwise inject proxy settings from the host client config.
  ...["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "FTP_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "ftp_proxy", "no_proxy"].flatMap((name) => ["--env", `${name}=`]),
];

async function withWorkspace<T>(ctx: FileExecutionContext, fn: (names: WorkspaceNames) => Promise<T>) {
  const base = resourceNames(ctx);
  const namespace = await databaseNamespace();
  const names: WorkspaceNames = { ...base, labels: [
    "--label", `${SCOPE_LABEL}=${base.id}`, "--label", `${MANAGED_LABEL}=${MANAGED_VALUE}`,
    "--label", `${DATABASE_LABEL}=${namespace}`, "--label", `${JOB_LABEL}=${ctx.jobId}`,
    "--label", `${LEASE_LABEL}=${ctx.leaseKey}`,
  ] };
  // A Docker name is an atomic cross-process lock. A stale lock is removed by
  // cleanupFileWorkspace when the owning lease ends or is recovered.
  const lock = await docker(["create", "--pull=never", "--name", names.lock, ...common(names), IMAGE, "sleep", "infinity"], { signal: ctx.signal });
  if (lock.aborted) throw abortError();
  if (lock.code !== 0) {
    if (lock.stderr.toString().includes("already in use")) throw new WorkspaceError("This file workspace is already in use by another tool call.", 409);
    throw new WorkspaceError(`The isolated file workspace is unavailable: ${lock.stderr.toString().trim().slice(0, 1000)}`, 503);
  }
  try {
    checkAbort(ctx.signal);
    await ensureWorkspace(ctx, names);
    return await fn(names);
  } finally {
    await removeResource("container", names.lock);
  }
}
async function ensureWorkspace(ctx: FileExecutionContext, names: WorkspaceNames) {
  const existing = await docker(["inspect", "--format", "{{.State.Status}}", names.keeper], { signal: ctx.signal });
  if (existing.aborted) throw abortError();
  if (existing.code === 0) {
    if (existing.stdout.toString().trim() !== "running")
      throw new WorkspaceError("The temporary file workspace stopped and its files were lost. Reload any saved files.", 409);
    return;
  }
  await requiredDocker(["volume", "create", "--driver", "local", ...names.labels,
    "--opt", "type=tmpfs", "--opt", "device=tmpfs", "--opt", "o=size=128m,nr_inodes=4096,uid=1000,gid=1000,mode=0700", names.volume], { signal: ctx.signal });
  await requiredDocker(["run", "--pull=never", "--detach", "--name", names.keeper, ...common(names),
    // A worker can be killed without running finally. Limit residual in-memory
    // workspace lifetime even in that case; a stopped keeper is an explicit error.
    "--mount", `type=volume,src=${names.volume},dst=/work,volume-nocopy`, IMAGE, "sleep", "7200"], { signal: ctx.signal });
}
async function helper(names: WorkspaceNames, command: string, name?: string, input?: Buffer, signal?: AbortSignal) {
  const container = `hirelix-agent-helper-${randomUUID().replaceAll("-", "")}`;
  try {
    return await requiredDocker(["run", "--pull=never", "--init", "-i", "--name", container, ...common(names),
      "--mount", `type=volume,src=${names.volume},dst=/work,volume-nocopy`, IMAGE, "node", "/opt/hirelix-sandbox/helper.mjs", command, ...(name ? [name] : [])],
    { input, signal, maxBytes: command === "read" ? MAX_FILE_BYTES : 2 * 1024 * 1024, stop: () => removeContainer(container) });
  } finally { await removeResource("container", container); }
}
async function files(names: WorkspaceNames, signal?: AbortSignal) {
  return JSON.parse((await helper(names, "list", undefined, undefined, signal)).toString("utf8")) as { files: { path: string; size: number }[]; truncated: boolean };
}
function fileType(name: string) {
  const types: Record<string, string> = { pdf: "application/pdf", txt: "text/plain", md: "text/markdown", json: "application/json", jsonl: "application/x-ndjson", ndjson: "application/x-ndjson", csv: "text/csv", tsv: "text/tab-separated-values", html: "text/html", xml: "application/xml", zip: "application/zip", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  return types[path.posix.extname(name).slice(1).toLowerCase()] || "application/octet-stream";
}
async function saveBytes(userId: string, name: string, bytes: Buffer, tx: Runner) {
  const saved = await saveFile(userId, { name: path.posix.basename(name), type: fileType(name), bytes }, tx);
  return { file_id: saved.id, sha256: saved.sha256, name: saved.name, size: saved.byte_size, media_type: saved.media_type };
}
function tarHeader(name: string, size: number) {
  const block = Buffer.alloc(512);
  const text = (offset: number, length: number, value: string) => block.write(value, offset, length, "ascii");
  const octal = (offset: number, length: number, value: number) => text(offset, length, value.toString(8).padStart(length - 1, "0") + "\0");
  text(0, 100, name); octal(100, 8, 0o644); octal(108, 8, 1000); octal(116, 8, 1000); octal(124, 12, size); octal(136, 12, 0);
  block.fill(32, 148, 156); text(156, 1, "0"); text(257, 6, "ustar\0"); text(263, 2, "00");
  octal(148, 8, block.reduce((sum, byte) => sum + byte, 0));
  return block;
}
function tarFile(name: string, bytes: Buffer) {
  return Buffer.concat([tarHeader(name, bytes.length), bytes, Buffer.alloc((512 - bytes.length % 512) % 512 + 1024)]);
}

async function prepareInputs(ctx: FileExecutionContext, names: WorkspaceNames, ids: string[]) {
  if (!ids.length) return { volume: null as string | null, container: null as string | null, inputs: [] as {file_id:string;sha256:string;name:string;path:string;size:number}[] };
  const token = randomUUID().replaceAll("-", "");
  const volume = `hirelix-agent-input-${token}`, container = `hirelix-agent-input-keeper-${token}`;
  try {
    await requiredDocker(["volume", "create", "--driver", "local", ...names.labels,
      "--opt", "type=tmpfs", "--opt", "device=tmpfs", "--opt", "o=size=128m,nr_inodes=64,uid=1000,gid=1000,mode=0700", volume], { signal: ctx.signal });
    await requiredDocker(["run", "--pull=never", "--detach", "--name", container, ...common(names),
      "--mount", `type=volume,src=${volume},dst=/inputs,volume-nocopy`, IMAGE, "sleep", "600"], { signal: ctx.signal });
    let total = 0;
    const inputs = [];
    for (const id of [...new Set(ids)]) {
      checkAbort(ctx.signal);
      const file = await readFile(ctx.userId, id);
      total += file.bytes.length;
      if (total > MAX_INPUT_BYTES) throw new WorkspaceError("The selected files exceed the 128 MB sandbox input limit.");
      if (createHash("sha256").update(file.bytes).digest("hex") !== file.sha256) throw new WorkspaceError("A source file failed its integrity check.", 409);
      const ext = path.extname(file.name).toLowerCase();
      const safeExt = /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
      const name = `${id}${safeExt}`;
      await requiredDocker(["cp", "-", `${container}:/inputs/`], { input: tarFile(name, file.bytes), signal: ctx.signal, timeoutMs: 60000 });
      inputs.push({ file_id: id, sha256: file.sha256, name: file.name, path: `/inputs/${name}`, size: file.byte_size });
    }
    return { volume, container, inputs };
  } catch (error) {
    await removeResource("container", container);
    await removeResource("volume", volume);
    throw error;
  }
}

export async function executeBash(ctx: FileExecutionContext, raw: z.input<typeof bashInputSchema>) {
  const input = bashInputSchema.parse(raw);
  if (!ctx.commit) throw new WorkspaceError("The file tool requires a lease-checked receipt transaction.", 503);
  return withWorkspace(ctx, async (names) => {
    const source = await prepareInputs(ctx, names, input.input_file_ids);
    const run = `hirelix-agent-run-${randomUUID().replaceAll("-", "")}`;
    try {
      await requiredDocker(["create", "--pull=never", "--init", "--name", run, ...common(names),
        "--ulimit", "fsize=67108864:67108864", "--workdir", "/work",
        "--mount", `type=volume,src=${names.volume},dst=/work,volume-nocopy`,
        ...(source.volume ? ["--mount", `type=volume,src=${source.volume},dst=/inputs,readonly,volume-nocopy`] : []),
        IMAGE, "/usr/bin/timeout", "--signal=TERM", "--kill-after=2s", "60s", "/bin/bash", "-c", input.command], { signal: ctx.signal });
      const result = await docker(["start", "--attach", run], { signal: ctx.signal, timeoutMs: 65000, maxBytes: MAX_OUTPUT_BYTES, stop: () => removeContainer(run) });
      if (result.aborted) throw abortError();
      const state = await docker(["inspect", "--format", "{{.State.ExitCode}} {{.State.OOMKilled}}", run], { timeoutMs: 10000 });
      const stateMatch = state.stdout.toString().trim().match(/^(\d+) (true|false)$/);
      if (!stateMatch && !result.timedOut && !result.truncated) throw new WorkspaceError("The sandbox did not report a process result.", 503);
      // Stopping/removing the container also terminates any surviving descendants.
      await removeResource("container", run);
      checkAbort(ctx.signal);
      const listing = await files(names, ctx.signal);
      const requested = await Promise.all([...new Set(input.output_paths.map(normalizeWorkspacePath))].map(async (name) => ({ name, bytes: await helper(names, "read", name, undefined, ctx.signal) })));
      return await commit(ctx, async (tx) => {
        const outputs = [];
        for (const item of requested) { checkAbort(ctx.signal); outputs.push({ path: item.name, ...await saveBytes(ctx.userId, item.name, item.bytes, tx) }); }
        const stdout_file = result.stdout.length > INLINE_OUTPUT_BYTES ? await saveBytes(ctx.userId, "stdout.txt", result.stdout, tx) : null;
        const stderr_file = result.stderr.length > INLINE_OUTPUT_BYTES ? await saveBytes(ctx.userId, "stderr.txt", result.stderr, tx) : null;
        checkAbort(ctx.signal);
        return {
          exit_code: stateMatch ? Number(stateMatch[1]) : null,
          oom_killed: stateMatch?.[2] === "true",
          // GNU timeout uses 124 both for its own deadline and for a command that exits 124.
          timed_out: result.timedOut ? true : stateMatch?.[1] === "124" ? null : false,
          stdout: result.stdout.subarray(0, INLINE_OUTPUT_BYTES).toString("utf8"),
          stderr: result.stderr.subarray(0, INLINE_OUTPUT_BYTES).toString("utf8"),
          stdout_truncated: result.stdout.length > INLINE_OUTPUT_BYTES || result.stdoutTruncated,
          stderr_truncated: result.stderr.length > INLINE_OUTPUT_BYTES || result.stderrTruncated,
          output_limit_reached: result.truncated, inputs: source.inputs, workspace: listing,
          outputs, stdout_file, stderr_file,
        };
      });
    } finally {
      await removeResource("container", run);
      if (source.container) await removeResource("container", source.container);
      if (source.volume) await removeResource("volume", source.volume);
    }
  });
}

export async function writeWorkspaceFile(ctx: FileExecutionContext, raw: z.input<typeof writeFileInputSchema>) {
  const input = writeFileInputSchema.parse(raw);
  input.path = normalizeWorkspacePath(input.path);
  if (input.persist && !ctx.commit) throw new WorkspaceError("The file tool requires a lease-checked receipt transaction.", 503);
  return withWorkspace(ctx, async (names) => {
    const bytes = Buffer.from(input.content, "utf8");
    await helper(names, "write", input.path, bytes, ctx.signal);
    if (!input.persist) return { path: input.path, size: bytes.length, file: null };
    return commit(ctx, async (tx) => {
      checkAbort(ctx.signal);
      const file = await saveBytes(ctx.userId, input.path, bytes, tx);
      checkAbort(ctx.signal);
      return { path: input.path, size: bytes.length, file };
    });
  });
}

/** For read_file: read actual bytes before passing them to the existing document reader. */
export async function readWorkspaceFile(ctx: FileExecutionContext, raw: z.input<typeof readWorkspaceFileInputSchema>) {
  const input = readWorkspaceFileInputSchema.parse(raw);
  input.path = normalizeWorkspacePath(input.path);
  return withWorkspace(ctx, async (names) => ({
    name: path.posix.basename(input.path), media_type: fileType(input.path),
    bytes: await helper(names, "read", input.path, undefined, ctx.signal),
  }));
}

export async function persistWorkspaceFile(ctx: FileExecutionContext, raw: z.input<typeof readWorkspaceFileInputSchema>) {
  const input = readWorkspaceFileInputSchema.parse(raw);
  input.path = normalizeWorkspacePath(input.path);
  if (!ctx.commit) throw new WorkspaceError("The file tool requires a lease-checked receipt transaction.", 503);
  return withWorkspace(ctx, async (names) => {
    const bytes = await helper(names, "read", input.path, undefined, ctx.signal);
    checkAbort(ctx.signal);
    return commit(ctx, async (tx) => {
      const saved = await saveBytes(ctx.userId, input.path, bytes, tx);
      checkAbort(ctx.signal);
      return { path: input.path, ...saved };
    });
  });
}

/** Invoke once the execution attempt ends, including on cancellation or recovery. */
export async function cleanupFileWorkspace(ctx: FileExecutionContext) {
  const names = resourceNames(ctx);
  const containers = (await requiredDocker(["ps", "-aq", "--filter", `label=${SCOPE_LABEL}=${names.id}`])).toString().trim().split("\n").filter(Boolean);
  if (containers.length) await requiredDocker(["rm", "-f", ...containers], { timeoutMs: 30000 });
  const volumes = (await requiredDocker(["volume", "ls", "-q", "--filter", `label=${SCOPE_LABEL}=${names.id}`])).toString().trim().split("\n").filter(Boolean);
  if (volumes.length) await requiredDocker(["volume", "rm", ...volumes], { timeoutMs: 30000 });
}

type RecoveryResource = { id: string; created: number; labels: Record<string, string>; kind: "container" | "volume" };
async function recoveryResources(kind: RecoveryResource["kind"], namespace: string) {
  const filter = ["--filter", `label=${MANAGED_LABEL}=${MANAGED_VALUE}`, "--filter", `label=${DATABASE_LABEL}=${namespace}`];
  const list = kind === "container" ? ["ps", "-aq", ...filter] : ["volume", "ls", "-q", ...filter];
  const ids = (await requiredDocker(list)).toString().trim().split("\n").filter(Boolean);
  const resources: RecoveryResource[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const format = kind === "container" ? "{{.Id}}\t{{.Created}}\t{{json .Config.Labels}}" : "{{.Name}}\t{{.CreatedAt}}\t{{json .Labels}}";
    const args = kind === "container" ? ["inspect", "--format", format] : ["volume", "inspect", "--format", format];
    const result = await docker([...args, ...ids.slice(i, i + 50)]);
    const errors = result.stderr.toString().trim().split("\n").filter(Boolean);
    // Normal workspace cleanup or another worker can remove an item between
    // listing and inspection. Keep the other inspected items; retry real errors.
    if (result.timedOut || result.truncated || (result.code !== 0 &&
        (!errors.length || errors.some(line => !/no such (object|container|volume)/i.test(line)))))
      throw new WorkspaceError("Could not inspect isolated workspace resources for recovery.", 503);
    const output = result.stdout.toString().trim();
    for (const line of output.split("\n").filter(Boolean)) {
      const [id, time, rawLabels] = line.split("\t");
      resources.push({ id, created: Date.parse(time), labels: JSON.parse(rawLabels), kind });
    }
  }
  return resources;
}

/** Recover only expired resources from this database whose original lease was revoked. */
export async function recoverFileWorkspaces() {
  const namespace = await databaseNamespace();
  const daemonTime = Date.parse((await requiredDocker(["info", "--format", "{{.SystemTime}}"])).toString().trim());
  if (!Number.isFinite(daemonTime)) throw new WorkspaceError("Could not determine the file workspace daemon time.", 503);
  const resources = (await Promise.all([
    recoveryResources("container", namespace), recoveryResources("volume", namespace),
  ])).flat();
  const groups = new Map<string, {job: string; lease: string; resources: RecoveryResource[]}>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const resource of resources) {
    const labels = resource.labels;
    const job = labels?.[JOB_LABEL], lease = labels?.[LEASE_LABEL], id = labels?.[SCOPE_LABEL];
    if (labels?.[MANAGED_LABEL] !== MANAGED_VALUE || labels?.[DATABASE_LABEL] !== namespace ||
        !uuid.test(job || "") || !uuid.test(lease || "") || !/^[0-9a-f]{32}$/.test(id || "") ||
        !Number.isFinite(resource.created)) continue;
    const key = `${job}:${lease}:${id}`;
    const group = groups.get(key) || { job, lease, resources: [] };
    group.resources.push(resource);
    groups.set(key, group);
  }
  let removed = 0;
  for (const group of groups.values()) {
    if (group.resources.some((resource) => resource.created > daemonTime - RECOVERY_GRACE_MS)) continue;
    const [job] = await rows<{lease_token: string | null}>(sql`
      SELECT lease_token::text AS lease_token FROM hirelix_private_jobs WHERE id=${group.job}::uuid`);
    // Even an expired token is retained until reclaimJobs atomically clears or
    // replaces it. That also excludes an in-flight heartbeat racing this check.
    if (job?.lease_token === group.lease) continue;
    for (const resource of group.resources.filter((item) => item.kind === "container")) {
      if (await removeResource(resource.kind, resource.id)) removed++;
    }
    for (const resource of group.resources.filter((item) => item.kind === "volume")) {
      // Names can be reused, so check the labels again before removing a volume.
      const current = await docker(["volume", "inspect", "--format", "{{.CreatedAt}}\t{{json .Labels}}", resource.id]);
      if (current.code !== 0) {
        if (current.stderr.toString().toLowerCase().includes("no such volume")) continue;
        throw new WorkspaceError("Could not inspect the isolated volume before recovery.", 503);
      }
      const [created, rawLabels] = current.stdout.toString().trim().split("\t");
      const labels = JSON.parse(rawLabels) as Record<string, string> | null;
      if (Date.parse(created) !== resource.created || labels?.[MANAGED_LABEL] !== MANAGED_VALUE || labels?.[DATABASE_LABEL] !== namespace ||
          labels[JOB_LABEL] !== group.job || labels[LEASE_LABEL] !== group.lease ||
          labels[SCOPE_LABEL] !== resource.labels[SCOPE_LABEL]) continue;
      if (await removeResource(resource.kind, resource.id)) removed++;
    }
  }
  return { removed };
}
