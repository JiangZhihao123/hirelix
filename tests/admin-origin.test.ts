import assert from "node:assert/strict";
import test from "node:test";
import { adminOriginAllowed } from "../src/lib/admin-origin";
const request = (url: string, origin?: string, extra: Record<string, string> = {}) => new Request(url, { headers: { ...(origin === undefined ? {} : { origin }), ...extra } });
test("production admin trusts canonical HTTPS origin independently of proxy URL", () => {
  for (const target of ["https://hirelix.online", "http://localhost:3000", "https://deployment.vercel.app"]) {
    assert.equal(adminOriginAllowed(request(target, "https://hirelix.online", { "sec-fetch-site": "same-origin" }), true), true);
  }
});
test("production rejects absent, opaque, wrong protocol, port, sibling and forged origins", () => {
  for (const origin of [undefined, "", "null", "http://hirelix.online", "https://hirelix.online:444", "https://www.hirelix.online", "https://hirelix.online.evil.invalid", "https://evil.invalid", "https://hirelix.online/", "https://hirelix.online, https://evil.invalid"]) {
    assert.equal(adminOriginAllowed(request("https://evil.invalid", origin, { host: "evil.invalid", "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "https", forwarded: "host=evil.invalid;proto=https" }), true), false, String(origin));
  }
  assert.equal(adminOriginAllowed(request("https://hirelix.online", "https://hirelix.online", { "sec-fetch-site": "cross-site" }), true), false);
});
test("development uses exact origin and ignores proxy header spoofing", () => {
  assert.equal(adminOriginAllowed(request("http://localhost:3000", "http://localhost:3000"), false), true);
  assert.equal(adminOriginAllowed(request("http://localhost:3000", "https://hirelix.online", { "x-forwarded-host": "hirelix.online", "x-forwarded-proto": "https" }), false), false);
  assert.equal(adminOriginAllowed(request("http://localhost:3000", "http://localhost:3001"), false), false);
  assert.equal(adminOriginAllowed(request("http://localhost:3000", undefined), false), false);
});
