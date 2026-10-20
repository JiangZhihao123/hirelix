import assert from "node:assert/strict";
import { test } from "node:test";
import { acquirePaddleCheckout, loadPaddle } from "../src/lib/paddle";

test("Paddle checkout is single-flight and can retry after load or checkout failure", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const scripts: Array<{ onload: () => void }> = [];
  let fail = true;
  let eventCallback: ((event: unknown) => void) | undefined;
  const sdk = {
    Initialize(options: { eventCallback?: (event: unknown) => void }) {
      if (fail) throw new Error("SDK initialization failed");
      eventCallback = options.eventCallback;
    },
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
  let loaded = 0;
  let settled = 0;
  let errors = 0;
  const firstLease = acquirePaddleCheckout({ onLoaded: () => loaded++, onSettled: () => settled++, onError: () => errors++ });
  assert.ok(firstLease);
  assert.equal(acquirePaddleCheckout({}), null, "a second button cannot start a concurrent checkout");
  const first = loadPaddle("fixture-token", "production");
  const rejected = assert.rejects(first, /SDK initialization failed/);
  assert.doesNotThrow(() => scripts[0].onload());
  await rejected;
  firstLease.release();
  fail = false;
  const retry = loadPaddle("fixture-token", "production");
  assert.equal(scripts.length, 2);
  scripts[1].onload();
  assert.equal(await retry, sdk);
  assert.equal(loaded, 0, "Loading the SDK is not loading the checkout");
  eventCallback?.({name: "checkout.customer.updated"});
  assert.equal(loaded, 0);
  const checkoutLease = acquirePaddleCheckout({ onLoaded: () => loaded++, onSettled: () => settled++, onError: () => errors++ });
  assert.ok(checkoutLease);
  assert.equal(acquirePaddleCheckout({}), null, "single-flight remains held while the checkout overlay is open");
  eventCallback?.({name: "checkout.loaded"});
  assert.equal(loaded, 1, "checkout.loaded ends the waiting UI");
  assert.equal(settled, 0, "checkout.loaded does not release the active checkout");
  assert.equal(acquirePaddleCheckout({}), null);
  eventCallback?.({name: "checkout.payment.failed"});
  assert.equal(errors, 1);
  assert.equal(settled, 1);
  const retryAfterFailure = acquirePaddleCheckout({ onSettled: () => settled++ });
  assert.ok(retryAfterFailure, "a failed checkout releases the lease for retry");
  retryAfterFailure.release();
  const retryAfterClose = acquirePaddleCheckout({ onSettled: () => settled++ });
  assert.ok(retryAfterClose);
  eventCallback?.({name: "checkout.completed"});
  assert.equal(settled, 2);
  assert.equal(errors, 1);
});
