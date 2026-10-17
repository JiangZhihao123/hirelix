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

test("Next auth handler reports missing runtime configuration without leaking settings", () => {
  isolatedAuth(`
    const { GET } = require('./src/app/api/auth/[...all]/route.ts');
    const { AUTH_UNAVAILABLE_CODE, AUTH_UNAVAILABLE_MESSAGE } = require('./src/lib/auth-status.ts');
    (async () => {
      const response = await GET(new Request('http://localhost/api/auth/get-session'));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      const body = await response.json();
      assert.equal(body.code, AUTH_UNAVAILABLE_CODE);
      assert.equal(body.message, AUTH_UNAVAILABLE_MESSAGE);
      assert.equal(JSON.stringify(body).includes('DATABASE_URL'), false);
    })()
      .catch(error => { console.error(error); process.exitCode = 1; });
  `);
});

test("workspace routes reject missing auth configuration before their business handler", () => {
  isolatedAuth(`
    const { workspaceApi } = require('./src/lib/workspace/http.ts');
    const { NextRequest } = require('next/server');
    (async () => {
      let invoked = false;
      const response = await workspaceApi(new NextRequest('http://localhost/api/workspace/people'), async () => { invoked = true; });
      assert.equal(invoked, false);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'AUTH_SERVICE_UNAVAILABLE');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
});
