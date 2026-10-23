import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolScheduler } from "../src/lib/workspace/agent-tool-scheduling";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return {promise, release};
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("independent reads overlap, use freed slots and never cross a write barrier", async () => {
  const schedule = createToolScheduler(new AbortController().signal, 2);
  const a = gate(), b = gate(), c = gate(), write = gate();
  const started: string[] = [];
  const call = (tool: string, name: string, hold = Promise.resolve()) => schedule(tool, async () => {started.push(name); await hold;});
  const tasks = [call("web_search", "A", a.promise), call("web_fetch", "B", b.promise),
    call("read_candidate", "C", c.promise), call("save_candidate", "write", write.promise), call("read_candidate", "after")];
  await tick(); assert.deepEqual(started, ["A", "B"]);
  b.release(); await tick(); assert.deepEqual(started, ["A", "B", "C"], "A slow first call cannot leave a free slot idle");
  c.release(); await tick(); assert.equal(started.length, 3);
  a.release(); await tick(); assert.deepEqual(started, ["A", "B", "C", "write"]);
  write.release(); await Promise.all(tasks); assert.equal(started.at(-1), "after");
});

test("failure releases capacity; unknown tools and ask_user are exclusive", async () => {
  const schedule = createToolScheduler(new AbortController().signal, 2);
  const hold = gate(), asked = gate(); const started: string[] = [];
  const first = schedule("web_search", async () => {await hold.promise; throw new Error("provider failed");});
  const failed = assert.rejects(first, /provider failed/);
  const ask = schedule("ask_user", async () => {started.push("ask"); await asked.promise;});
  const next = schedule("new_unknown_tool", async () => {started.push("next");});
  await tick(); assert.deepEqual(started, []);
  hold.release(); await failed; await tick(); assert.deepEqual(started, ["ask"]);
  asked.release(); await Promise.all([ask, next]); assert.deepEqual(started, ["ask", "next"]);
});

test("abort prevents queued reads and writes from executing", async () => {
  const controller = new AbortController(), hold = gate();
  const schedule = createToolScheduler(controller.signal, 1);
  const first = schedule("web_search", () => hold.promise);
  let extra = 0;
  const read = assert.rejects(schedule("web_fetch", async () => {extra++;}), /cancelled/);
  const write = assert.rejects(schedule("save_role", async () => {extra++;}), /cancelled/);
  await tick(); controller.abort(new Error("cancelled")); hold.release();
  await Promise.all([first, read, write]); assert.equal(extra, 0);
});
