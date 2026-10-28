// Explicit long-running test: a real Docker daemon, real PostgreSQL, and SIGKILL.
// Use a fresh, exclusively owned recovery QA database; no worker is started.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { commitAgentTool } from "../../src/lib/workspace/agent-execution";
import { rows, type Runner } from "../../src/lib/workspace/database";
import { cleanupFileWorkspace, recoverFileWorkspaces, writeWorkspaceFile, type FileExecutionContext } from "../../src/lib/workspace/file-execution";
import { readFile } from "../../src/lib/workspace/files";
import { claimJob, reclaimJobs } from "../../src/lib/workspace/jobs";
import type { Job } from "../../src/lib/workspace/types";

const enabled = process.env.HIRELIX_RECOVERY_LONG_TEST === "1";
const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
if (enabled) assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.port !== "15432" && /^\/hirelix_workspace_qa_coldstart_recovery_/.test(database.pathname));
const owner = randomUUID(), conversation = randomUUID(), jobId = randomUUID(), lease = randomUUID();
const context: FileExecutionContext = {userId: owner, conversationId: conversation, jobId, leaseKey: lease};
const otherName = `hirelix-recovery-other-${randomUUID()}`;
const otherDatabaseName = `hirelix-recovery-other-db-${randomUUID()}`;
const scope = createHash("sha256").update(JSON.stringify([owner, conversation, jobId, lease])).digest("hex").slice(0, 32);
const docker = (...args: string[]) => execFileSync("docker", args, {encoding: "utf8"}).trim();
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function named(scopeId: string) {
  return {
    containers: docker("ps", "-aq", "--filter", `label=hirelix.agent.scope=${scopeId}`),
    volumes: docker("volume", "ls", "-q", "--filter", `label=hirelix.agent.scope=${scopeId}`),
  };
}
after(async () => {
  if (!enabled) return;
  // Cleanup is restricted to the two test leases and exact control containers.
  await cleanupFileWorkspace(context).catch(() => {});
  docker("rm", "-f", otherName);
  docker("rm", "-f", otherDatabaseName);
  await db.execute(sql`DELETE FROM hirelix_private_files WHERE user_id=${owner}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid AND id=${jobId}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${owner}::uuid AND id=${conversation}::uuid`);
  await closeDb();
});

test("recover only old resources from a revoked lease after a killed process", {skip: !enabled, timeout: 400000}, async () => {
  await db.execute(sql`INSERT INTO hirelix_private_conversations(id,user_id) VALUES(${conversation}::uuid,${owner}::uuid)`);
  await db.execute(sql`INSERT INTO hirelix_private_jobs(id,user_id,kind,request_key,payload,result,status,attempts,lease_token,lease_until)
    VALUES(${jobId}::uuid,${owner}::uuid,'chat',${randomUUID()},${JSON.stringify({conversation_id:conversation,message_id:randomUUID()})}::jsonb,'{}'::jsonb,'running',1,${lease}::uuid,now()+interval '20 minutes')`);
  const [original] = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${jobId}::uuid AND user_id=${owner}::uuid`);
  const input = {path: "committed.txt", content: "durable bytes", persist: true};
  const toolInput = {tool_call_id: randomUUID(), input};
  const committedContext = {...context, commit: <T>(apply: (tx: Runner) => Promise<T>) => commitAgentTool(original, "write_file", toolInput, async tx => ({output: await apply(tx)})) as Promise<T>};
  const saved = await writeWorkspaceFile(committedContext, input);
  assert.ok(saved.file);
  const oldFile = saved.file.file_id;

  // Unrelated and different-database resources must survive even when old.
  docker("create", "--name", otherName, "--pull=never", "hirelix-agent-sandbox:1", "sleep", "infinity");
  docker("create", "--name", otherDatabaseName, "--label", "hirelix.agent.managed=workspace-v1", "--label", `hirelix.agent.database=${randomUUID().replaceAll("-", "")}`, "--pull=never", "hirelix-agent-sandbox:1", "sleep", "infinity");
  const child = spawn(process.execPath, ["--import", "tsx", "tests/fixtures/workspace-file-recovery-child.ts"], {
    env: {...process.env, QA_USER: owner, QA_CONVERSATION: conversation, QA_JOB: jobId, QA_LEASE: lease},
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const [output] = await once(child.stdout!, "data") as [Buffer];
    assert.match(output.toString(), /workspace-ready/);
    for (let i = 0; i < 100; i++) {
      if (docker("ps", "--filter", `label=hirelix.agent.scope=${scope}`, "--format", "{{.Names}}").includes("hirelix-agent-run-")) break;
      if (i === 99) throw new Error("Command container never started");
      await pause(100);
    }
    child.kill("SIGKILL");
    await once(child, "exit");
    const killed = named(scope);
    assert.equal(killed.containers.split("\n").length, 3);
    assert.ok(killed.volumes);
    assert.equal((await recoverFileWorkspaces()).removed, 0, "recent resources must not be collected");
    assert.deepEqual(named(scope), killed);
    process.stdout.write("SIGKILL reproduced; waiting for real five-minute expiry\n");
    await pause(5 * 60 * 1000 + 3000);
    assert.equal((await recoverFileWorkspaces()).removed, 0, "an active lease must retain old resources");
    assert.deepEqual(named(scope), killed);
    await db.execute(sql`UPDATE hirelix_private_jobs SET lease_until=now()-interval '1 second' WHERE id=${jobId}::uuid AND user_id=${owner}::uuid`);
    assert.equal((await recoverFileWorkspaces()).removed, 0, "an expired but not yet reclaimed lease must be retained");
    const otherExpired = await rows<{count:number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_jobs WHERE status='running' AND lease_until<=now() AND id<>${jobId}::uuid`);
    assert.equal(otherExpired[0].count, 0, "this must be an exclusively owned QA database");
    assert.ok((await reclaimJobs()).some(item => item.id === jobId && item.status === "queued"));
    const resumed = await claimJob(["chat"], {id:jobId,userId:owner});
    assert.ok(resumed && resumed.lease_token && resumed.lease_token !== lease);
    const newContext = {...context, leaseKey: resumed.lease_token};
    try {
      const replayContext = {...newContext, commit: <T>(apply: (tx: Runner) => Promise<T>) => commitAgentTool(resumed, "write_file", toolInput, async tx => ({output: await apply(tx)})) as Promise<T>};
      const replay = await writeWorkspaceFile(replayContext, input);
      assert.equal(replay.file?.file_id, oldFile, "a committed receipt must survive recovery without a second file");
      assert.equal((await readFile(owner, oldFile)).bytes.toString(), "durable bytes");
      assert.equal((await rows<{count:number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_files WHERE user_id=${owner}::uuid`))[0].count, 1);
      assert.ok((await recoverFileWorkspaces()).removed >= 4);
      assert.deepEqual(named(scope), {containers:"", volumes:""});
      const newScope = createHash("sha256").update(JSON.stringify([owner, conversation, jobId, resumed.lease_token])).digest("hex").slice(0, 32);
      assert.ok(named(newScope).containers && named(newScope).volumes, "the new lease workspace remains active");
      assert.equal((await recoverFileWorkspaces()).removed, 0, "recovery must be repeatable");
      assert.ok(docker("inspect", "--format", "{{.Id}}", otherName));
      assert.ok(docker("inspect", "--format", "{{.Id}}", otherDatabaseName));
    } finally { await cleanupFileWorkspace(newContext); }
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
});
