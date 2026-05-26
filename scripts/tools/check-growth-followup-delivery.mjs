#!/usr/bin/env node

import fs from "node:fs";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_SEND_LOG_PATH = "docs/growth/cold-email-followup-send-log-2026-05-26.csv";
const DEFAULT_DELIVERY_STATUS_PATH =
  "docs/growth/cold-email-followup-delivery-status-2026-05-26.csv";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function writeDeliveryStatus(filePath, rows) {
  const header = ["checked_at", "email_id", "to", "company", "resend_id", "last_event", "notes"];
  const lines = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    deliveryStatusPath:
      process.env.GROWTH_DELIVERY_STATUS_PATH || DEFAULT_DELIVERY_STATUS_PATH,
    dryRun: args.includes("--dry-run"),
    sendLogPath: process.env.OUTREACH_LOG_PATH || DEFAULT_SEND_LOG_PATH,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/tools/check-growth-followup-delivery.mjs [--dry-run]

Optional:
  --send-log=<path>          defaults to ${DEFAULT_SEND_LOG_PATH}
  --delivery-status=<path>   defaults to ${DEFAULT_DELIVERY_STATUS_PATH}

Required unless --dry-run:
  RESEND_API_KEY
`);
      process.exit(0);
    } else if (arg.startsWith("--send-log=")) {
      options.sendLogPath = arg.split("=")[1];
    } else if (arg.startsWith("--delivery-status=")) {
      options.deliveryStatusPath = arg.split("=")[1];
    }
  }
  return options;
}

async function fetchResendEmail(apiKey, resendId) {
  const response = await fetch(`${RESEND_ENDPOINT}/${encodeURIComponent(resendId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.raw || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

const options = parseArgs();
const env = {
  ...loadDotEnv(".env"),
  ...loadDotEnv(".env.local"),
  ...process.env,
};
const sentRows = readCsv(options.sendLogPath).filter((row) => row.status === "sent");

if (!sentRows.length) {
  console.log(`No sent emails found in ${options.sendLogPath}.`);
  process.exit(0);
}

if (!options.dryRun && !env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is required.");
}

const existingRows = readCsv(options.deliveryStatusPath);
const existingByEmailId = new Map(existingRows.map((row) => [row.email_id, row]));
const checkedAt = new Date().toISOString();
const outputByEmailId = new Map(existingRows.map((row) => [row.email_id, row]));
const report = [];

for (const row of sentRows) {
  const base = {
    checked_at: checkedAt,
    email_id: row.email_id,
    to: row.to,
    company: row.company,
    resend_id: row.resend_id,
  };

  if (!row.resend_id) {
    const next = { ...base, last_event: "missing_resend_id", notes: "Send log has no resend_id." };
    outputByEmailId.set(row.email_id, next);
    report.push(next);
    continue;
  }

  if (options.dryRun) {
    const previous = existingByEmailId.get(row.email_id);
    const next = {
      ...base,
      last_event: previous?.last_event || "dry_run_not_checked",
      notes: previous?.notes || "Dry run: Resend was not queried.",
    };
    report.push(next);
    continue;
  }

  try {
    const email = await fetchResendEmail(env.RESEND_API_KEY, row.resend_id);
    const lastEvent = typeof email.last_event === "string" ? email.last_event : "unknown";
    const next = {
      ...base,
      last_event: lastEvent,
      notes: lastEvent === "bounced"
        ? "Bounced in Resend. Suppress this address before any future send."
        : "Fetched from Resend email last_event.",
    };
    outputByEmailId.set(row.email_id, next);
    report.push(next);
  } catch (error) {
    const next = {
      ...base,
      last_event: "check_error",
      notes: error instanceof Error ? error.message : String(error),
    };
    outputByEmailId.set(row.email_id, next);
    report.push(next);
  }
}

if (!options.dryRun) {
  writeDeliveryStatus(options.deliveryStatusPath, [...outputByEmailId.values()]);
}

console.table(report.map((row) => ({
  email_id: row.email_id,
  to: row.to,
  company: row.company,
  resend_id: row.resend_id,
  last_event: row.last_event,
})));
console.log(
  options.dryRun
    ? `Dry run complete. Delivery status not written.`
    : `Wrote ${outputByEmailId.size} rows to ${options.deliveryStatusPath}.`,
);
