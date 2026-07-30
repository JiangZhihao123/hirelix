import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = path.resolve("scripts/tools/send-growth-email-batch.mjs");

function checkConfig(overrides: Partial<NodeJS.ProcessEnv>) {
  const cwd = mkdtempSync(path.join(tmpdir(), "hirelix-outreach-config-"));
  try {
    return spawnSync(process.execPath, [scriptPath, "--check-config"], {
      cwd,
      encoding: "utf8",
      env: {
        NODE_ENV: process.env.NODE_ENV ?? "test",
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        OUTREACH_FROM_EMAIL: "Noah Jiang <noah@hirelix.online>",
        OUTREACH_REPLY_TO: "noah@hirelix.online",
        OUTREACH_POSTAL_ADDRESS: "1 Test Street, Test City",
        ...overrides,
      },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function dryRun(body: string, batchOverrides: Record<string, unknown> = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), "hirelix-outreach-dry-run-"));
  try {
    const batchPath = path.join(cwd, "batch.json");
    writeFileSync(batchPath, JSON.stringify({
      ...batchOverrides,
      emails: [{
        id: "signature-test",
        to: "recipient@example.com",
        subject: "Signature test",
        body,
      }],
    }));
    return spawnSync(process.execPath, [scriptPath, batchPath, "--dry-run"], {
      cwd,
      encoding: "utf8",
      env: {
        NODE_ENV: process.env.NODE_ENV ?? "test",
        PATH: process.env.PATH,
        HOME: process.env.HOME,
      },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("outreach config defaults to Resend without reporting a missing provider", () => {
  const result = checkConfig({ RESEND_API_KEY: "test-resend-key" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /provider: resend/);
  assert.doesNotMatch(result.stdout, /OUTREACH_EMAIL_PROVIDER: missing/);
});

test("outreach config accepts Zoho SMTP credentials", () => {
  const result = checkConfig({
    OUTREACH_EMAIL_PROVIDER: "zoho_smtp",
    ZOHO_SMTP_USER: "noah@hirelix.online",
    ZOHO_SMTP_APP_PASSWORD: "test-app-password",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /provider: zoho_smtp/);
});

test("outreach config rejects partially numeric SMTP values", () => {
  const base = {
    OUTREACH_EMAIL_PROVIDER: "zoho_smtp",
    ZOHO_SMTP_USER: "noah@hirelix.online",
    ZOHO_SMTP_APP_PASSWORD: "test-app-password",
  };
  const invalidPort = checkConfig({ ...base, ZOHO_SMTP_PORT: "465abc" });
  const invalidInterval = checkConfig({ ...base, OUTREACH_SEND_INTERVAL_MS: "3sec" });

  assert.notEqual(invalidPort.status, 0);
  assert.match(invalidPort.stderr, /ZOHO_SMTP_PORT must be a non-negative integer/);
  assert.notEqual(invalidInterval.status, 0);
  assert.match(invalidInterval.stderr, /OUTREACH_SEND_INTERVAL_MS must be a non-negative integer/);
});

test("outreach config requires the Zoho sender to match the authenticated mailbox", () => {
  const result = checkConfig({
    OUTREACH_EMAIL_PROVIDER: "zoho_smtp",
    OUTREACH_FROM_EMAIL: "Noah Jiang <other@hirelix.online>",
    ZOHO_SMTP_USER: "noah@hirelix.online",
    ZOHO_SMTP_APP_PASSWORD: "test-app-password",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTREACH_FROM_EMAIL must use the configured ZOHO_SMTP_USER/);
});

test("outreach dry run adds the founder signature before the opt-out footer", () => {
  const result = dryRun('Hi there.\n\nIf this is not relevant, reply "opt out".');

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Noah Jiang\nFounder, Hirelix\nhttps:\/\/hirelix\.online\/go\/signature-test\?.*\n\nIf this is not relevant/,
  );
});

test("outreach dry run does not duplicate an existing founder signature", () => {
  const result = dryRun("Hi there.\n\nNoah Jiang\nFounder, Hirelix\nhttps://hirelix.online");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.match(/Founder, Hirelix/g)?.length, 1);
});

test("outreach dry run can produce a linkless founder email", () => {
  const result = dryRun(
    'Hi there. Google "Hirelix" if you would like to take a look.\n\nIf this is not relevant, reply "opt out".',
    { include_product_url: false },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Noah Jiang\nFounder, Hirelix\n\nIf this is not relevant/);
  assert.doesNotMatch(result.stdout, /https?:\/\//);
});
