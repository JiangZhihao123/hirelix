import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { AUTH_UNAVAILABLE_CODE, AUTH_UNAVAILABLE_MESSAGE, authUnavailableMessage, missingAuthSettings } from "../src/lib/auth-status";

test("missing authentication settings include blank values without returning values", () => {
  assert.deepEqual(missingAuthSettings({ DATABASE_URL: "private-value", BETTER_AUTH_SECRET: "  " }), ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
});

test("SDK response and thrown server failures show a safe service message", () => {
  for (const error of [{ code: AUTH_UNAVAILABLE_CODE, message: "private detail" }, { status: 503 }, { error: { code: AUTH_UNAVAILABLE_CODE } }]) {
    assert.equal(authUnavailableMessage(error), AUTH_UNAVAILABLE_MESSAGE);
  }
  assert.equal(authUnavailableMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }), null);
  assert.equal(authUnavailableMessage({ status: 400, code: "INVALID_OTP" }), null);
  assert.equal(authUnavailableMessage(null), null);
  assert.equal(authUnavailableMessage(new TypeError("Unrelated programming error")), null);
});

test("real auth client classifies rejected fetch transport and preserves HTTP credentials errors and success", () => {
  const source = `
    const assert = require('node:assert/strict');
    require('node:net').Socket.prototype.connect = () => { throw Error('No network allowed'); };
    const { authClient } = require('./src/lib/auth-client.ts');
    const { authUnavailableMessage, AUTH_CONNECTION_MESSAGE } = require('./src/lib/auth-status.ts');
    (async () => {
      global.fetch = async () => { throw new TypeError('private transport detail'); };
      await assert.rejects(() => authClient.signIn.email({email:'fictional@example.test',password:'fixture-only-password'}), error => {
        assert.equal(authUnavailableMessage(error),AUTH_CONNECTION_MESSAGE);
        assert.equal(String(error).includes('private transport detail'),false);
        return true;
      });
      for (const status of [400,401]) {
        global.fetch = async () => Response.json({code:'INVALID_EMAIL_OR_PASSWORD',message:'Fixture credentials rejected'},{status});
        const result = await authClient.signIn.email({email:'fictional@example.test',password:'fixture-only-password'});
        assert.equal(result.error.status,status);
        assert.equal(authUnavailableMessage(result.error),null);
      }
      // SDK success transport contract only; this synthetic response does not
      // prove Google OAuth or a real authenticated session.
      global.fetch = async () => Response.json({redirect:false,user:{id:'fixture-user'}});
      const result = await authClient.signIn.email({email:'fictional@example.test',password:'fixture-only-password'});
      assert.equal(result.error,null);
      assert.equal(result.data.user.id,'fixture-user');
    })().catch(error => {console.error(error);process.exitCode=1;});
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", source], { cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost" }, encoding: "utf8", timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("real auth client preserves the unavailable response before any provider request", () => {
  const source = `
    const assert = require('node:assert/strict');
    require('node:net').Socket.prototype.connect = () => { throw Error('No network allowed'); };
    const { auth } = require('./src/lib/auth.ts');
    const { createAuthClient } = require('better-auth/client');
    const { authUnavailableMessage, AUTH_UNAVAILABLE_MESSAGE } = require('./src/lib/auth-status.ts');
    const client = createAuthClient({baseURL:'http://localhost',fetchOptions:{customFetchImpl:async (input, init) => auth.handler(new Request(String(input), init))}});
    (async () => {
      const result = await client.signIn.email({email:'fictional@example.test',password:'not-a-real-credential'});
      assert.equal(result.error.status,503);
      assert.equal(authUnavailableMessage(result.error),AUTH_UNAVAILABLE_MESSAGE);
    })().catch(error => {console.error(error);process.exitCode=1;});
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", source], { cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: "test" }, encoding: "utf8", timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("workspace startup diagnostic prints missing names and never injected values", () => {
  const run = (settings: Record<string, string> = {}, args: string[] = []) => spawnSync(process.execPath, ["--import", "tsx", "scripts/tools/check-workspace-runtime.ts", ...args], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: "test", ...settings }, encoding: "utf8", timeout: 10000,
  });
  const empty = run();
  assert.equal(empty.status, 1);
  assert.ok(JSON.parse(empty.stdout).missing_settings.includes("DATABASE_URL"));
  const sentinel = "must-never-print-this-value";
  const configured = run({ DATABASE_URL: `postgresql://qa:${sentinel}@127.0.0.1:1/qa`, BETTER_AUTH_SECRET: sentinel, GOOGLE_CLIENT_ID: sentinel, GOOGLE_CLIENT_SECRET: sentinel, DEEPSEEK_API_KEY: sentinel, SILICONFLOW_API_KEY: sentinel, BETTER_AUTH_URL: "http://localhost:3000" });
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(configured.stdout.includes(sentinel), false);
  const report = JSON.parse(configured.stdout);
  assert.equal(report.database.checked, false);
  assert.equal(report.worker.verified, false);
  const webSettings = { DATABASE_URL: "postgresql://qa@127.0.0.1:1/qa", BETTER_AUTH_SECRET: sentinel, GOOGLE_CLIENT_ID: sentinel, GOOGLE_CLIENT_SECRET: sentinel, BETTER_AUTH_URL: "http://localhost:3000" };
  assert.equal(run(webSettings).status, 0, "Web authentication does not require worker embedding credentials");
  const worker = run(webSettings, ["--worker"]);
  assert.equal(worker.status, 1);
  assert.ok(JSON.parse(worker.stdout).missing_settings.includes("SILICONFLOW_API_KEY"));
  const workerSettings = { DATABASE_URL: webSettings.DATABASE_URL, BETTER_AUTH_SECRET: sentinel, DEEPSEEK_API_KEY: sentinel, SILICONFLOW_API_KEY: sentinel, BETTER_AUTH_URL: webSettings.BETTER_AUTH_URL };
  assert.equal(run(workerSettings, ["--worker"]).status, 0, "Core worker checks do not demand optional Gmail credentials");
  const disabled = run({ ...workerSettings, PRIVATE_WORKSPACE_WORKER_ENABLED: "false" }, ["--worker"]);
  assert.equal(disabled.status, 1);
  assert.ok(JSON.parse(disabled.stdout).invalid_settings.includes("PRIVATE_WORKSPACE_WORKER_ENABLED"));
});
