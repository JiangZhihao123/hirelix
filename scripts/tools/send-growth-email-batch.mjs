#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const ADDRESS_PLACEHOLDER = "{{MAILING_ADDRESS_REQUIRED_BEFORE_SEND}}";
const DEFAULT_PRODUCT_URL = "https://hirelix.online";

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

function usage() {
  console.log(`Usage:
  node scripts/tools/send-growth-email-batch.mjs <batch.json> [--dry-run]
  node scripts/tools/send-growth-email-batch.mjs <batch.json> --send --yes
  node scripts/tools/send-growth-email-batch.mjs --check-config

Required for --send:
  RESEND_API_KEY
  OUTREACH_FROM_EMAIL      e.g. "Noah Jiang <founder@hirelix.online>"
  OUTREACH_REPLY_TO        e.g. "founder@hirelix.online"
  OUTREACH_POSTAL_ADDRESS  valid physical postal address or registered mailbox

Optional:
  OUTREACH_LOG_PATH        defaults to docs/growth/cold-email-send-log-2026-05-25.csv
  OUTREACH_TRACKING_BASE   defaults to https://hirelix.online
  OUTREACH_INFER_SENDER_FROM_LOG=true
                            infer OUTREACH_FROM_EMAIL and OUTREACH_REPLY_TO from the latest
                            successful Resend message in the send logs
`);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function appendLog(logPath, row) {
  const line = [
    new Date().toISOString(),
    row.email_id,
    row.to,
    row.company,
    row.status,
    row.resend_id || "",
    row.error || "",
    row.notes || "",
  ]
    .map(csvEscape)
    .join(",");
  fs.appendFileSync(logPath, `${line}\n`);
}

function renderBody(body, postalAddress) {
  return body.replaceAll(ADDRESS_PLACEHOLDER, postalAddress);
}

function buildTrackingUrl(email, batch, trackingBase) {
  const base = (trackingBase || DEFAULT_PRODUCT_URL).replace(/\/+$/, "");
  const params = new URLSearchParams();
  const batchId = batch.tracking_batch_id || batch.batch || batch.date || "";
  if (batchId) params.set("batch", String(batchId));
  params.set("campaign", batch.tracking_campaign || "founder_outreach");
  if (email.to) params.set("to", email.to);
  if (email.company) params.set("company", email.company);
  return `${base}/go/${encodeURIComponent(email.id)}?${params.toString()}`;
}

function renderTrackedBody(email, batch, env) {
  const postalAddress = env.OUTREACH_POSTAL_ADDRESS || ADDRESS_PLACEHOLDER;
  const trackingUrl = buildTrackingUrl(email, batch, env.OUTREACH_TRACKING_BASE);
  const productUrls = new Set([batch.product_url || DEFAULT_PRODUCT_URL, DEFAULT_PRODUCT_URL]);
  let body = renderBody(email.body, postalAddress);
  for (const productUrl of productUrls) {
    body = body.replaceAll(productUrl, trackingUrl);
  }
  return body;
}

function readLatestResendIdFromLogs(paths) {
  for (const logPath of paths) {
    if (!logPath || !fs.existsSync(logPath)) continue;
    const lines = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(1).reverse()) {
      const columns = line.split(",");
      const status = columns[4];
      const resendId = columns[5];
      if (status === "sent" && resendId) return resendId;
    }
  }
  return null;
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

async function inferSenderConfig(env) {
  if (env.OUTREACH_FROM_EMAIL && env.OUTREACH_REPLY_TO) {
    return { env, inferred: false };
  }
  if (env.OUTREACH_INFER_SENDER_FROM_LOG !== "true") {
    return { env, inferred: false };
  }
  if (!env.RESEND_API_KEY) {
    return { env, inferred: false };
  }

  const resendId = readLatestResendIdFromLogs([
    env.OUTREACH_LOG_PATH,
    "docs/growth/cold-email-send-log-2026-05-25.csv",
    "docs/growth/cold-email-send-log-batch12-2026-05-25.csv",
  ]);
  if (!resendId) return { env, inferred: false };

  const email = await fetchResendEmail(env.RESEND_API_KEY, resendId);
  const replyTo = Array.isArray(email.reply_to) ? email.reply_to[0] : email.reply_to;
  return {
    env: {
      ...env,
      OUTREACH_FROM_EMAIL: env.OUTREACH_FROM_EMAIL || email.from,
      OUTREACH_REPLY_TO: env.OUTREACH_REPLY_TO || replyTo,
    },
    inferred: Boolean(email.from || replyTo),
    resendId,
  };
}

function getSendConfigIssues(env) {
  const issues = [];
  const requiredKeys = [
    "RESEND_API_KEY",
    "OUTREACH_FROM_EMAIL",
    "OUTREACH_REPLY_TO",
    "OUTREACH_POSTAL_ADDRESS",
  ];
  for (const key of requiredKeys) {
    if (!env[key]) issues.push(`Missing required send config: ${key}`);
  }
  if (
    env.OUTREACH_POSTAL_ADDRESS === ADDRESS_PLACEHOLDER ||
    /\{\{.*\}\}/.test(env.OUTREACH_POSTAL_ADDRESS || "")
  ) {
    issues.push("OUTREACH_POSTAL_ADDRESS must be a real physical postal address or registered mailbox.");
  }
  if (env.OUTREACH_FROM_EMAIL && /notifications@hirelix\.online/i.test(env.OUTREACH_FROM_EMAIL)) {
    issues.push("Refusing to send outreach from notifications@hirelix.online.");
  }
  return issues;
}

function validateSendConfig(env) {
  const issues = getSendConfigIssues(env);
  if (issues.length) throw new Error(issues.join(" "));
}

function printSendConfigCheck(env, options = {}) {
  const keys = [
    "RESEND_API_KEY",
    "OUTREACH_FROM_EMAIL",
    "OUTREACH_REPLY_TO",
    "OUTREACH_POSTAL_ADDRESS",
  ];
  console.log("OUTREACH send config:");
  if (options.inferred) {
    console.log(`- inferred sender from Resend log: ${options.resendId || "yes"}`);
  }
  for (const key of keys) {
    console.log(`- ${key}: ${env[key] ? "set" : "missing"}`);
  }
  const issues = getSendConfigIssues(env);
  if (issues.length) {
    console.error("\nBlocked:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }
  console.log("\nReady to send. No config values printed.");
}

async function sendEmail({ apiKey, from, replyTo, email, body }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      reply_to: replyTo,
      subject: email.subject,
      text: body,
    }),
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

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(args.length ? 0 : 1);
}

const checkConfig = args.includes("--check-config");
const batchPath = args.find((arg) => !arg.startsWith("--"));
const shouldSend = args.includes("--send");
const confirmed = args.includes("--yes");
const env = {
  ...loadDotEnv(path.resolve(".env")),
  ...loadDotEnv(path.resolve(".env.local")),
  ...process.env,
};
const senderConfig = await inferSenderConfig(env);
const sendEnv = senderConfig.env;

if (checkConfig) {
  printSendConfigCheck(sendEnv, senderConfig);
  process.exit(0);
}

if (!batchPath) {
  usage();
  process.exit(1);
}

if (shouldSend && !confirmed) {
  throw new Error("Use --yes with --send after confirming the recipient list and copy.");
}

const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
const emails = Array.isArray(batch.emails) ? batch.emails : [];
if (!emails.length) throw new Error("Batch has no emails.");

if (!shouldSend) {
  console.log(`DRY RUN: ${emails.length} emails in ${batchPath}`);
  for (const email of emails) {
    console.log("\n---");
    console.log(`To: ${email.to}`);
    console.log(`Subject: ${email.subject}`);
    console.log(renderTrackedBody(email, batch, sendEnv));
  }
  console.log("\nNo emails sent. Add --send --yes to send after final approval.");
  process.exit(0);
}

validateSendConfig(sendEnv);

const logPath = sendEnv.OUTREACH_LOG_PATH || "docs/growth/cold-email-send-log-2026-05-25.csv";
for (const email of emails) {
  const body = renderTrackedBody(email, batch, sendEnv);
  try {
    const result = await sendEmail({
      apiKey: sendEnv.RESEND_API_KEY,
      from: sendEnv.OUTREACH_FROM_EMAIL,
      replyTo: sendEnv.OUTREACH_REPLY_TO,
      email,
      body,
    });
    appendLog(logPath, {
      email_id: email.id,
      to: email.to,
      company: email.company,
      status: "sent",
      resend_id: result?.id || "",
    });
    console.log(`sent ${email.to} ${result?.id || ""}`);
  } catch (error) {
    appendLog(logPath, {
      email_id: email.id,
      to: email.to,
      company: email.company,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`error ${email.to}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
