import test from "node:test";
import assert from "node:assert/strict";
import {
  getFetchDispatcherForUrl,
  shouldBypassOutboundProxyForUrl,
} from "../src/lib/server-outbound-proxy";

test("shouldBypassOutboundProxyForUrl bypasses loopback hosts", () => {
  assert.equal(shouldBypassOutboundProxyForUrl("http://localhost:3000"), true);
  assert.equal(shouldBypassOutboundProxyForUrl("http://127.0.0.1:3000"), true);
  assert.equal(shouldBypassOutboundProxyForUrl("http://0.0.0.0:3000"), true);
  assert.equal(shouldBypassOutboundProxyForUrl("http://[::1]:3000"), true);
});

test("shouldBypassOutboundProxyForUrl keeps external hosts on the default path", () => {
  assert.equal(shouldBypassOutboundProxyForUrl("https://hirelix.online"), false);
  assert.equal(shouldBypassOutboundProxyForUrl("https://api.supabase.com"), false);
  assert.equal(shouldBypassOutboundProxyForUrl("not-a-url"), false);
});

test("getFetchDispatcherForUrl returns a direct dispatcher only for loopback hosts", () => {
  assert.ok(getFetchDispatcherForUrl("http://localhost:3000"));
  assert.equal(getFetchDispatcherForUrl("https://hirelix.online"), undefined);
});
