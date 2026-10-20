import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPaddle } from "../src/lib/paddle";

test("Paddle initialization failure rejects and permits a fresh attempt", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const scripts: Array<{ onload: () => void }> = [];
  let fail = true;
  const sdk = {
    Initialize() { if (fail) throw new Error("SDK initialization failed"); },
    Checkout: { open() {} },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { Paddle: sdk } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({}),
    head: { appendChild: (script: { onload: () => void }) => scripts.push(script) },
  } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const first = loadPaddle("fixture-token", "production");
  const rejected = assert.rejects(first, /SDK initialization failed/);
  assert.doesNotThrow(() => scripts[0].onload());
  await rejected;
  fail = false;
  const retry = loadPaddle("fixture-token", "production");
  assert.equal(scripts.length, 2);
  scripts[1].onload();
  assert.equal(await retry, sdk);
});
