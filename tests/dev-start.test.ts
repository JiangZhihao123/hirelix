import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const launcher = path.resolve("scripts/dev/start.mjs");
type Receipt = { kind: string; pid: number; database?: string; marker?: string; expanded?: string; removed?: string; scheduler?: string };

async function fixture(envFiles: Record<string, string>, inherited: Record<string, string> = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), "hirelix-dev-start-"));
  const receipts = path.join(cwd, "receipts.jsonl");
  // Only the child lifecycle is substituted; the actual launcher and Next.js
  // environment loader run in a separate process, without network or secrets.
  for (const [kind, filename] of [["worker", "node_modules/tsx/dist/cli.mjs"], ["web", "node_modules/next/dist/bin/next"]]) {
    const target = path.join(cwd, filename);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `
      import('node:fs').then(fs => {
      fs.appendFileSync(${JSON.stringify(receipts)}, JSON.stringify({
        kind: ${JSON.stringify(kind)}, pid: process.pid,
        database: process.env.DATABASE_URL, marker: process.env.DEV_MARKER,
        expanded: process.env.DEV_EXPANDED, removed: process.env.DEV_REMOVED,
        scheduler: process.env.SEARCH_JOB_SCHEDULER_ENABLED
      }) + '\\n');
      setInterval(() => {}, 1000);
      });
    `);
  }
  for (const [name, content] of Object.entries(envFiles)) await writeFile(path.join(cwd, name), content);
  let child: ChildProcess;
  let output = "";
  const read = async (): Promise<Receipt[]> => {
    try { return (await readFile(receipts, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  };
  return {
    cwd,
    start() {
      child = spawn(process.execPath, [launcher], { cwd, env: { PATH: process.env.PATH, NODE_ENV: "development", ...inherited }, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout?.on("data", data => { output += data; });
      child.stderr?.on("data", data => { output += data; });
    },
    async waitFor(count: number) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const rows = await read();
        if (rows.length >= count) return rows;
        assert.equal(child.exitCode, null, output);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.fail(`Expected ${count} child startup receipts. ${output}`);
    },
    async close() {
      if (child && child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
      await rm(cwd, { recursive: true, force: true });
    },
  };
}

test("dev web and worker both preserve an explicitly selected database over local files", async () => {
  const f = await fixture({ ".env.local": "DATABASE_URL=postgres://localhost/file_database\nDEV_MARKER=local\n" }, {
    DATABASE_URL: "postgres://localhost/selected_qa_database", DEV_MARKER: "inherited",
  });
  try {
    f.start();
    const rows = await f.waitFor(2);
    assert.deepEqual(rows.map(row => row.kind).sort(), ["web", "worker"]);
    for (const row of rows) {
      assert.equal(row.database, "postgres://localhost/selected_qa_database");
      assert.equal(row.marker, "inherited");
      assert.equal(row.scheduler, "false");
    }
    await writeFile(path.join(f.cwd, ".env.local"), "DATABASE_URL=postgres://localhost/changed_file_database\nDEV_MARKER=changed\n");
    for (const row of (await f.waitFor(4)).slice(-2)) {
      assert.equal(row.database, "postgres://localhost/selected_qa_database");
      assert.equal(row.marker, "inherited");
    }
  } finally { await f.close(); }
});

test("dev config uses Next precedence and expansion, then restarts both children with fresh values", async () => {
  const f = await fixture({
    ".env": "DATABASE_URL=postgres://localhost/base\nDEV_MARKER=base\n",
    ".env.development": "DEV_MARKER=development\n",
    ".env.local": "DATABASE_URL=postgres://localhost/local\nDEV_MARKER=local\nDEV_REMOVED=old\n",
    ".env.development.local": "DEV_MARKER=development-local\nDEV_EXPANDED=${DEV_MARKER}/expanded\n",
  });
  try {
    f.start();
    const initial = await f.waitFor(2);
    for (const row of initial) {
      assert.equal(row.database, "postgres://localhost/local");
      assert.equal(row.marker, "development-local");
      assert.equal(row.expanded, "development-local/expanded");
      assert.equal(row.removed, "old");
    }
    await writeFile(path.join(f.cwd, ".env.local"), "DATABASE_URL=postgres://localhost/updated\n");
    const reloaded = (await f.waitFor(4)).slice(-2);
    assert.deepEqual(reloaded.map(row => row.kind).sort(), ["web", "worker"]);
    for (const row of reloaded) {
      assert.equal(row.database, "postgres://localhost/updated");
      assert.equal(row.removed, undefined);
      assert.ok(!initial.some(previous => previous.pid === row.pid));
    }
    await rm(path.join(f.cwd, ".env.development.local"));
    for (const row of (await f.waitFor(6)).slice(-2)) {
      assert.equal(row.marker, "development");
      assert.equal(row.expanded, undefined);
    }
  } finally { await f.close(); }
});
