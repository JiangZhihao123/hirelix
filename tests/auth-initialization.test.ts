import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function isolatedAuth(source: string) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", `
    const assert = require('node:assert/strict');
    const deny = () => { throw new Error('Unexpected network during auth initialization'); };
    require('node:net').Socket.prototype.connect = deny;
    require('node:tls').connect = deny;
    globalThis.fetch = deny;
    ${source}
  `], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("auth and Next route collection need no database or provider credentials", () => {
  isolatedAuth(`
    const { auth } = require('./src/lib/auth.ts');
    const { GET, POST } = require('./src/app/api/auth/[...all]/route.ts');
    assert.equal(typeof auth.handler, 'function');
    assert.equal(typeof GET, 'function');
    assert.equal(typeof POST, 'function');
  `);
});

test("real auth API access still rejects missing runtime configuration", () => {
  isolatedAuth(`
    const { auth } = require('./src/lib/auth.ts');
    assert.throws(() => auth.api, /DATABASE_URL is required/);
    // Failed initialization is not cached as a working auth service.
    assert.throws(() => auth.api, /DATABASE_URL is required/);
  `);
});

test("Next auth handler preserves the runtime configuration failure", () => {
  isolatedAuth(`
    const { GET } = require('./src/app/api/auth/[...all]/route.ts');
    assert.rejects(GET(new Request('http://localhost/api/auth/get-session')), /DATABASE_URL is required/)
      .catch(error => { console.error(error); process.exitCode = 1; });
  `);
});
