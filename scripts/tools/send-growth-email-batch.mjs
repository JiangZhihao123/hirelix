#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const ADDRESS_PLACEHOLDER = "{{MAILING_ADDRESS_REQUIRED_BEFORE_SEND}}";
const DEFAULT_PRODUCT_URL = "https://hirelix.online";
const DEFAULT_PROVIDER = "resend";
const ZOHO_SMTP_PROVIDER = "zoho_smtp";
const DEFAULT_SMTP_HOST = "smtp.zoho.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SEND_INTERVAL_MS = 3000;
const DEFAULT_FOUNDER_SIGNATURE = "Noah Jiang\nFounder, Hirelix\nhttps://hirelix.online";

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
  node scripts/tools/send-growth-email-batch.mjs <batch.json> --send --yes [--force-resend]
  node scripts/tools/send-growth-email-batch.mjs --check-config

Required for --send:
  OUTREACH_EMAIL_PROVIDER  resend (default) or zoho_smtp
  OUTREACH_FROM_EMAIL      e.g. "Noah Jiang <founder@hirelix.online>"
  OUTREACH_REPLY_TO        e.g. "founder@hirelix.online"
  OUTREACH_POSTAL_ADDRESS  valid physical postal address or registered mailbox

Provider credentials:
  Resend:     RESEND_API_KEY
  Zoho SMTP: ZOHO_SMTP_USER, ZOHO_SMTP_APP_PASSWORD

Optional:
  ZOHO_SMTP_HOST           defaults to smtp.zoho.com
  ZOHO_SMTP_PORT           defaults to 465 (SSL)
  OUTREACH_SEND_INTERVAL_MS
                            defaults to 3000 for zoho_smtp; use 0 to disable
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

function readSentEmailIds(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return new Set();
  const lines = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return new Set();
  const headers = parseCsvLine(lines[0]);
  const emailIdIndex = headers.indexOf("email_id");
  const statusIndex = headers.indexOf("status");
  if (emailIdIndex < 0 || statusIndex < 0) return new Set();
  const sent = new Set();
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    if (values[statusIndex] === "sent" && values[emailIdIndex]) {
      sent.add(values[emailIdIndex]);
    }
  }
  return sent;
}

function renderBody(body, postalAddress) {
  return body.replaceAll(ADDRESS_PLACEHOLDER, postalAddress);
}

function ensureFounderSignature(body) {
  if (body.includes(DEFAULT_FOUNDER_SIGNATURE)) return body;
  const complianceMarker = '\n\nIf this is not relevant, reply "opt out"';
  const complianceIndex = body.indexOf(complianceMarker);
  if (complianceIndex < 0) return `${body.trimEnd()}\n\n${DEFAULT_FOUNDER_SIGNATURE}`;
  return `${body.slice(0, complianceIndex).trimEnd()}\n\n${DEFAULT_FOUNDER_SIGNATURE}${body.slice(complianceIndex)}`;
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

function buildInviteUrl(email, batch, trackingBase) {
  const inviteCode = email.invite_code || email.inviteCode;
  if (!inviteCode) return null;
  const base = (trackingBase || DEFAULT_PRODUCT_URL).replace(/\/+$/, "");
  return `${base}/invite/${encodeURIComponent(inviteCode)}`;
}

function renderTrackedBody(email, batch, env) {
  const postalAddress = env.OUTREACH_POSTAL_ADDRESS || ADDRESS_PLACEHOLDER;
  const trackingUrl = buildTrackingUrl(email, batch, env.OUTREACH_TRACKING_BASE);
  const inviteUrl = buildInviteUrl(email, batch, env.OUTREACH_TRACKING_BASE);
  const primaryUrl = inviteUrl || trackingUrl;
  const productUrls = new Set([batch.product_url || DEFAULT_PRODUCT_URL, DEFAULT_PRODUCT_URL]);
  let body = ensureFounderSignature(renderBody(email.body, postalAddress));
  if (inviteUrl) {
    body = body
      .replaceAll("{{invite_link}}", inviteUrl)
      .replaceAll("{{INVITE_LINK}}", inviteUrl);
  }
  for (const productUrl of productUrls) {
    body = body.replaceAll(productUrl, primaryUrl);
  }
  return body;
}

function readLatestResendIdFromLogs(paths) {
  for (const logPath of paths) {
    if (!logPath || !fs.existsSync(logPath)) continue;
    const lines = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) continue;
    const headers = parseCsvLine(lines[0]);
    const statusIndex = headers.indexOf("status");
    const resendIdIndex = headers.indexOf("resend_id");
    if (statusIndex < 0 || resendIdIndex < 0) continue;
    for (const line of lines.slice(1).reverse()) {
      const columns = parseCsvLine(line);
      const status = columns[statusIndex];
      const resendId = columns[resendIdIndex];
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
  if (getEmailProvider(env) !== DEFAULT_PROVIDER || env.OUTREACH_INFER_SENDER_FROM_LOG !== "true") {
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

function getEmailProvider(env) {
  return (env.OUTREACH_EMAIL_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
}

function parseNonNegativeInteger(value, name, defaultValue, max = Number.MAX_SAFE_INTEGER) {
  const raw = value == null || value === "" ? String(defaultValue) : String(value).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new Error(`${name} must be a non-negative integer no greater than ${max}.`);
  }
  return parsed;
}

function getSendIntervalMs(env, provider) {
  if (provider !== ZOHO_SMTP_PROVIDER) return 0;
  return parseNonNegativeInteger(
    env.OUTREACH_SEND_INTERVAL_MS,
    "OUTREACH_SEND_INTERVAL_MS",
    DEFAULT_SEND_INTERVAL_MS,
  );
}

function getZohoSmtpConfig(env) {
  const port = parseNonNegativeInteger(
    env.ZOHO_SMTP_PORT,
    "ZOHO_SMTP_PORT",
    DEFAULT_SMTP_PORT,
    65535,
  );
  if (port === 0) {
    throw new Error("ZOHO_SMTP_PORT must be a valid TCP port.");
  }
  return {
    host: env.ZOHO_SMTP_HOST || DEFAULT_SMTP_HOST,
    port,
    secure: port === 465,
    user: env.ZOHO_SMTP_USER,
    pass: env.ZOHO_SMTP_APP_PASSWORD,
  };
}

function getSendConfigIssues(env) {
  const issues = [];
  const provider = getEmailProvider(env);
  const requiredKeys = ["OUTREACH_FROM_EMAIL", "OUTREACH_REPLY_TO", "OUTREACH_POSTAL_ADDRESS"];
  if (provider === DEFAULT_PROVIDER) {
    requiredKeys.unshift("RESEND_API_KEY");
  } else if (provider === ZOHO_SMTP_PROVIDER) {
    requiredKeys.unshift("ZOHO_SMTP_USER", "ZOHO_SMTP_APP_PASSWORD");
  } else {
    issues.push(`Unsupported OUTREACH_EMAIL_PROVIDER: ${provider}`);
  }
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
  if (
    provider === ZOHO_SMTP_PROVIDER &&
    env.ZOHO_SMTP_USER &&
    env.OUTREACH_FROM_EMAIL &&
    (env.OUTREACH_FROM_EMAIL.match(/<([^<>]+)>\s*$/)?.[1] || env.OUTREACH_FROM_EMAIL)
      .trim()
      .toLowerCase() !== env.ZOHO_SMTP_USER.trim().toLowerCase()
  ) {
    issues.push("OUTREACH_FROM_EMAIL must use the configured ZOHO_SMTP_USER address.");
  }
  if (provider === ZOHO_SMTP_PROVIDER) {
    try {
      getZohoSmtpConfig(env);
      getSendIntervalMs(env, provider);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  return issues;
}

function validateSendConfig(env) {
  const issues = getSendConfigIssues(env);
  if (issues.length) throw new Error(issues.join(" "));
}

function printSendConfigCheck(env, options = {}) {
  const provider = getEmailProvider(env);
  const keys = [
    "OUTREACH_FROM_EMAIL",
    "OUTREACH_REPLY_TO",
    "OUTREACH_POSTAL_ADDRESS",
  ];
  if (provider === DEFAULT_PROVIDER) {
    keys.splice(1, 0, "RESEND_API_KEY");
  } else if (provider === ZOHO_SMTP_PROVIDER) {
    keys.splice(1, 0, "ZOHO_SMTP_USER", "ZOHO_SMTP_APP_PASSWORD");
  }
  console.log("OUTREACH send config:");
  console.log(`- provider: ${provider}`);
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

async function sendResendEmail({ apiKey, from, replyTo, email, body }) {
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

async function createZohoTransport(env) {
  const nodemailer = await import("nodemailer");
  const config = getZohoSmtpConfig(env);
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

async function sendZohoEmail({ transport, from, replyTo, email, body }) {
  return transport.sendMail({
    from,
    to: email.to,
    replyTo,
    subject: email.subject,
    text: body,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
const forceResend = args.includes("--force-resend");
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
const alreadySent = readSentEmailIds(logPath);
const provider = getEmailProvider(sendEnv);
const zohoTransport = provider === ZOHO_SMTP_PROVIDER
  ? await createZohoTransport(sendEnv)
  : null;
const sendIntervalMs = getSendIntervalMs(sendEnv, provider);
let sentInThisRun = 0;
for (const email of emails) {
  if (!forceResend && alreadySent.has(email.id)) {
    console.log(`skip ${email.to}: already sent in ${logPath}`);
    continue;
  }

  const body = renderTrackedBody(email, batch, sendEnv);
  try {
    if (sentInThisRun > 0 && sendIntervalMs > 0) await sleep(sendIntervalMs);
    const result = provider === ZOHO_SMTP_PROVIDER
      ? await sendZohoEmail({
          transport: zohoTransport,
          from: sendEnv.OUTREACH_FROM_EMAIL,
          replyTo: sendEnv.OUTREACH_REPLY_TO,
          email,
          body,
        })
      : await sendResendEmail({
          apiKey: sendEnv.RESEND_API_KEY,
          from: sendEnv.OUTREACH_FROM_EMAIL,
          replyTo: sendEnv.OUTREACH_REPLY_TO,
          email,
          body,
        });
    const providerId = provider === ZOHO_SMTP_PROVIDER ? result?.messageId : result?.id;
    appendLog(logPath, {
      email_id: email.id,
      to: email.to,
      company: email.company,
      status: "sent",
      resend_id: provider === DEFAULT_PROVIDER ? providerId || "" : "",
      notes: provider === ZOHO_SMTP_PROVIDER
        ? `provider=zoho_smtp message_id=${providerId || "unknown"}`
        : "provider=resend",
    });
    alreadySent.add(email.id);
    sentInThisRun += 1;
    console.log(`sent ${email.to} via ${provider} ${providerId || ""}`);
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
