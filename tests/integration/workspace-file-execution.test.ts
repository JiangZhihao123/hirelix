import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { readFile, saveFile } from "../../src/lib/workspace/files";
import { rows, type Runner } from "../../src/lib/workspace/database";
import { bashInputSchema, cleanupFileWorkspace, executeBash, persistWorkspaceFile, readWorkspaceFile, writeWorkspaceFile, type FileExecutionContext } from "../../src/lib/workspace/file-execution";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_"));
const owner = randomUUID(), other = randomUUID();
const contexts: FileExecutionContext[] = [];
function context(overrides: Partial<FileExecutionContext> = {}) {
  const result = { userId: owner, conversationId: randomUUID(), jobId: randomUUID(), leaseKey: randomUUID(), commit: <T>(apply: (tx: Runner) => Promise<T>) => db.transaction(apply), ...overrides };
  contexts.push(result);
  return result;
}
after(async () => {
  for (const ctx of contexts) await cleanupFileWorkspace(ctx);
  await db.execute(sql`DELETE FROM hirelix_private_files WHERE user_id IN (${owner}::uuid,${other}::uuid)`);
  await closeDb();
});

test("real Docker and PG: bounded tools, isolated files, original bytes and persisted outputs", { timeout: 120000 }, async () => {
  const ctx = context();
  const bytes = Buffer.from("name,notes\nAlex,Original text\n");
  const original = await saveFile(owner, {name: "候选人.csv", type: "text/csv", bytes});
  const foreign = await saveFile(other, {name: "foreign.csv", type: "text/csv", bytes: Buffer.from("foreign secret")});
  const written = await writeWorkspaceFile(ctx, {path: "scripts/test.py", content: "print('python-ok')\n", persist: true});
  assert.ok(written.file);
  assert.equal((await readFile(owner, written.file.file_id)).bytes.toString(), "print('python-ok')\n");
  const script = `set -e
python3 /work/scripts/test.py
node -e "require('exceljs'); require('mammoth'); require('docx'); console.log('node-libs-ok')"
python3 -c "import openpyxl, docx; print('python-libs-ok')"
cat /inputs/*.csv > /work/copy.csv
python3 -c "open('/work/data.bin','wb').write(bytes(range(256)))"
if echo altered > /inputs/*.csv 2>/dev/null; then echo input-was-writable; exit 22; fi
if [ -e /var/run/docker.sock ] || [ -e /Users/noah ]; then exit 23; fi
if printenv HIRELIX_SANDBOX_TEST_SECRET >/dev/null; then exit 25; fi
python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('1.1.1.1', 80))" 2>/dev/null && exit 24 || true
printf 'network-blocked\\n'
df -m /work
`;
  process.env.HIRELIX_SANDBOX_TEST_SECRET = "host-only-test-value";
  let result: Awaited<ReturnType<typeof executeBash>>;
  try { result = await executeBash(ctx, {command: script, input_file_ids: [original.id], output_paths: ["/work/copy.csv", "/work/data.bin"]}); }
  finally { delete process.env.HIRELIX_SANDBOX_TEST_SECRET; }
  assert.equal(result.exit_code, 0, result.stderr);
  assert.match(result.stdout, /python-ok/); assert.match(result.stdout, /node-libs-ok/);
  assert.match(result.stdout, /python-libs-ok/); assert.match(result.stdout, /network-blocked/);
  assert.match(result.stdout, /tmpfs\s+128/);
  assert.equal(result.inputs[0].sha256, original.sha256);
  assert.equal(result.inputs[0].path, `/inputs/${original.id}.csv`);
  assert.equal(result.outputs[0].sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual((await readFile(owner, result.outputs[0].file_id)).bytes, bytes);
  assert.deepEqual((await readFile(owner, result.outputs[1].file_id)).bytes, Buffer.from(Array.from({length:256}, (_, i) => i)));
  assert.deepEqual((await readFile(owner, original.id)).bytes, bytes);
  assert.ok(result.workspace.files.some((item) => item.path === "/work/copy.csv"));
  await assert.rejects(() => readFile(other, result.outputs[0].file_id), /not found/);
  await assert.rejects(() => executeBash(ctx, {command: "echo no", input_file_ids: [foreign.id]}), /not found/);
  const symlink = await executeBash(ctx, {command: "ln -s /etc /work/escape; ln -s /etc/passwd /work/link; echo ok"});
  assert.equal(symlink.exit_code, 0);
  await assert.rejects(() => readWorkspaceFile(ctx, {path: "/work/escape/passwd"}), /symbolic links/);
  await assert.rejects(() => persistWorkspaceFile(ctx, {path: "/work/link"}), /isolated file workspace failed/);
  assert.equal(bashInputSchema.safeParse({command:"cat",output_paths:["/work/../etc/passwd"]}).success, false);
  const large = await executeBash(ctx, {command: "python3 -c 'print(\"x\" * 20000)'"});
  assert.equal(large.exit_code, 0); assert.equal(large.stdout_truncated, true); assert.ok(large.stdout_file);
  assert.equal((await readFile(owner, large.stdout_file.file_id)).bytes.length, 20001);
  const [{ count: before }] = await rows<{count:number}>(sql`SELECT count(*)::int count FROM hirelix_private_files WHERE user_id=${owner}::uuid`);
  const rejected = { ...ctx, commit: <T>(apply: (tx: Runner) => Promise<T>) => db.transaction(async (tx) => { await apply(tx); throw new Error("receipt rejected"); }) };
  await assert.rejects(() => executeBash(rejected, {command:"echo no-commit > /work/rejected.txt", output_paths:["/work/rejected.txt"]}), /receipt rejected/);
  const [{ count: after }] = await rows<{count:number}>(sql`SELECT count(*)::int count FROM hirelix_private_files WHERE user_id=${owner}::uuid`);
  assert.equal(after, before, "receipt failure must roll back generated file bytes");
});

test("abort kills the whole command container; cleanup is lease-scoped", { timeout: 60000 }, async () => {
  const ctx = context(), newer = context({userId:ctx.userId, conversationId:ctx.conversationId, jobId:ctx.jobId});
  await writeWorkspaceFile(ctx, {path:"start.txt",content:"same attempt"});
  await writeWorkspaceFile(newer, {path:"other.txt",content:"other lease"});
  await assert.rejects(() => readWorkspaceFile(newer, {path:"start.txt"}), /isolated file workspace failed/);
  const controller = new AbortController();
  const aborted = executeBash({...ctx, signal: controller.signal}, {command:"(sleep 3; echo escaped > /work/late.txt) & sleep 30"});
  await new Promise((resolve) => setTimeout(resolve, 900));
  await assert.rejects(() => writeWorkspaceFile(ctx, {path:"parallel.txt",content:"must wait"}), /already in use/);
  controller.abort();
  await assert.rejects(() => aborted, (error: Error) => error.name === "AbortError");
  const next = await executeBash(ctx, {command:"sleep 4; test ! -e /work/late.txt"});
  assert.equal(next.exit_code, 0, next.stderr);
  await cleanupFileWorkspace(ctx);
  assert.equal((await readWorkspaceFile(newer, {path:"other.txt"})).bytes.toString(), "other lease");
  await cleanupFileWorkspace(newer);
  const scope = createHash("sha256").update(JSON.stringify([ctx.userId, ctx.conversationId, ctx.jobId, ctx.leaseKey])).digest("hex").slice(0, 32);
  const remaining = execFileSync("docker", ["ps", "-aq", "--filter", `label=hirelix.agent.scope=${scope}`], {encoding:"utf8"}).trim();
  assert.equal(remaining, "");
});

test("an unavailable Docker daemon fails closed without running the command on the host", async () => {
  const originalHost = process.env.DOCKER_HOST;
  const sentinel = `/tmp/hirelix-sandbox-must-not-execute-${randomUUID()}`;
  process.env.DOCKER_HOST = "unix:///tmp/hirelix-nonexistent-docker.sock";
  try {
    await assert.rejects(() => executeBash(context(), {command:`touch ${sentinel}`}), /isolated file workspace is unavailable/);
    assert.equal(existsSync(sentinel), false);
  } finally { process.env.DOCKER_HOST = originalHost; }
});
