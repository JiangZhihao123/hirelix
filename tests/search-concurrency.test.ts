import assert from "node:assert/strict";
import test from "node:test";
import { runWithConcurrency } from "@/lib/search/concurrency";

test("a failed worker stops new work and drains in-flight work before returning", async () => {
  const started: number[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let inFlightFinished = false;
  const operation = runWithConcurrency([0, 1, 2, 3], 2, async (item) => {
    started.push(item);
    if (item === 0) throw new Error("source unavailable");
    await gate;
    inFlightFinished = true;
    return item;
  });
  await Promise.resolve();
  release();
  await assert.rejects(operation, /source unavailable/);
  assert.equal(inFlightFinished, true);
  assert.deepEqual(started, [0, 1]);
});
