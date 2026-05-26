#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const DEFAULT_BATCH_PATH = "docs/growth/cold-email-followup-clicked-2026-05-26.json";
const DEFAULT_LOG_PATH = "docs/growth/cold-email-followup-send-log-2026-05-26.csv";
const DEFAULT_EMAIL_PREFIX = "2026-05-26-followup-";

function usage() {
  console.log(`Usage:
  node scripts/tools/preflight-growth-followup.mjs [batch.json]

Optional env:
  OUTREACH_LOG_PATH   defaults to ${DEFAULT_LOG_PATH}
  GROWTH_EMAIL_PREFIX defaults to ${DEFAULT_EMAIL_PREFIX}
`);
}

function runStep(label, command, args, env = {}) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const batchPath = args.find((arg) => !arg.startsWith("--")) || DEFAULT_BATCH_PATH;
const logPath = process.env.OUTREACH_LOG_PATH || DEFAULT_LOG_PATH;
const emailPrefix = process.env.GROWTH_EMAIL_PREFIX || DEFAULT_EMAIL_PREFIX;
const nodeBin = process.execPath;
const commonEnv = {
  OUTREACH_INFER_SENDER_FROM_LOG: process.env.OUTREACH_INFER_SENDER_FROM_LOG || "true",
  OUTREACH_LOG_PATH: logPath,
};

const steps = [
  [
    "Validate recipient eligibility",
    nodeBin,
    ["scripts/tools/validate-growth-followup-batch.mjs", batchPath],
    commonEnv,
  ],
  [
    "Check send configuration",
    nodeBin,
    ["scripts/tools/send-growth-email-batch.mjs", "--check-config"],
    commonEnv,
  ],
  [
    "Render dry-run copy",
    nodeBin,
    ["scripts/tools/send-growth-email-batch.mjs", batchPath, "--dry-run"],
    commonEnv,
  ],
  [
    "Report follow-up clicks",
    nodeBin,
    [
      "scripts/tools/report-growth-outreach-clicks.mjs",
      "--summary",
      `--email-prefix=${emailPrefix}`,
    ],
  ],
  [
    "Report follow-up landing conversions",
    nodeBin,
    [
      "scripts/tools/report-growth-landing-events.mjs",
      "--conversions",
      `--email-prefix=${emailPrefix}`,
    ],
  ],
  [
    "Audit follow-up result gates",
    nodeBin,
    [
      "scripts/tools/audit-growth-followup-results.mjs",
      batchPath,
      `--send-log=${logPath}`,
      `--email-prefix=${emailPrefix}`,
      "--allow-pending-send",
    ],
  ],
];

let firstFailure = 0;
for (const [label, command, stepArgs, env] of steps) {
  const status = runStep(label, command, stepArgs, env);
  if (status !== 0 && firstFailure === 0) firstFailure = status;
}

if (firstFailure) {
  console.error(
    `\nPreflight blocked for ${path.basename(batchPath)}. Fix the failed gate above before sending.`,
  );
  process.exit(firstFailure);
}

console.log(`\nPreflight passed for ${batchPath}.`);
