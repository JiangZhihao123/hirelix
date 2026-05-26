#!/usr/bin/env node

import fs from "node:fs";
import postgres from "postgres";

const DEFAULT_BATCH_PATH = "docs/growth/cold-email-followup-clicked-2026-05-26.json";
const DEFAULT_SEND_LOG_PATH = "docs/growth/cold-email-followup-send-log-2026-05-26.csv";
const DEFAULT_DELIVERY_STATUS_PATH =
  "docs/growth/cold-email-followup-delivery-status-2026-05-26.csv";
const DEFAULT_EMAIL_PREFIX = "2026-05-26-followup-";
const BOUNCE_STOP_RATE = 0.05;

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

function shouldRequireSsl(connectionString) {
  if (/[?&]sslmode=disable\b/i.test(connectionString)) return false;
  if (process.env.DATABASE_SSL === "false") return false;
  if (/@(localhost|127\.0\.0\.1)[:/]/i.test(connectionString)) {
    return process.env.DATABASE_SSL === "true";
  }
  return true;
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

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    allowPendingSend: false,
    batchPath: DEFAULT_BATCH_PATH,
    deliveryStatusPath: process.env.GROWTH_DELIVERY_STATUS_PATH || DEFAULT_DELIVERY_STATUS_PATH,
    emailPrefix: process.env.GROWTH_EMAIL_PREFIX || DEFAULT_EMAIL_PREFIX,
    sendLogPath: process.env.OUTREACH_LOG_PATH || DEFAULT_SEND_LOG_PATH,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/tools/audit-growth-followup-results.mjs [batch.json]

Optional:
  --allow-pending-send      exit 0 when the only issue is that the follow-up has not been sent yet
  --send-log=<path>          defaults to ${DEFAULT_SEND_LOG_PATH}
  --delivery-status=<path>   defaults to ${DEFAULT_DELIVERY_STATUS_PATH}
  --email-prefix=<prefix>    defaults to ${DEFAULT_EMAIL_PREFIX}
`);
      process.exit(0);
    } else if (arg.startsWith("--send-log=")) {
      options.sendLogPath = arg.split("=")[1];
    } else if (arg.startsWith("--delivery-status=")) {
      options.deliveryStatusPath = arg.split("=")[1];
    } else if (arg.startsWith("--email-prefix=")) {
      options.emailPrefix = arg.split("=")[1];
    } else if (arg === "--allow-pending-send") {
      options.allowPendingSend = true;
    } else if (!arg.startsWith("--")) {
      options.batchPath = arg;
    }
  }
  return options;
}

function percentage(numerator, denominator) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function statusCount(rows, status) {
  return rows.filter((row) => row.status === status).length;
}

function deliveryCount(rows, event) {
  return rows.filter((row) => row.last_event === event).length;
}

const options = parseArgs();
const env = {
  ...loadDotEnv(".env"),
  ...loadDotEnv(".env.local"),
  ...process.env,
};

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const batch = JSON.parse(fs.readFileSync(options.batchPath, "utf8"));
const batchEmails = Array.isArray(batch.emails) ? batch.emails : [];
const batchIds = new Set(batchEmails.map((email) => email.id).filter(Boolean));
const sendRows = readCsv(options.sendLogPath).filter((row) => batchIds.has(row.email_id));
const sentRows = sendRows.filter((row) => row.status === "sent");
const sentIds = new Set(sentRows.map((row) => row.email_id));
const deliveryRows = readCsv(options.deliveryStatusPath).filter((row) => sentIds.has(row.email_id));
const checkedDelivery = deliveryRows.filter((row) => row.last_event);
const bounced = deliveryCount(checkedDelivery, "bounced");
const delivered = deliveryCount(checkedDelivery, "delivered");

const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: shouldRequireSsl(env.DATABASE_URL) ? "require" : false,
  max: 1,
});

try {
  const clickRows = await sql`
    with classified as (
      select
        *,
        (
          coalesce(user_agent, '') ~* '(virustotal|appengine-google|python-requests|go-http-client|urlscan|googleimageproxy|proofpoint|mimecast|barracuda|mandrill|sendgrid|mailchimp|linkexpand|preview|crawler|spider|bot)'
        ) as likely_scanner,
        (
          coalesce(company, '') ~* '(^|/)(_next/static|static/|assets/|favicon\\.|robots\\.txt|sitemap\\.xml)|\\.(js|css|map|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$'
          or coalesce(recipient, '') !~ '^[^@]+@[^@]+\\.[^@]+$'
        ) as malformed_context
      from hirelix_growth_outreach_clicks
      where email_id like ${`${options.emailPrefix}%`}
    )
    select
      count(*) filter (where not likely_scanner and not malformed_context)::int as qualified_clicks,
      count(distinct email_id) filter (where not likely_scanner and not malformed_context)::int
        as qualified_clicked_emails,
      count(*) filter (where likely_scanner or malformed_context)::int as noisy_clicks
    from classified
  `;
  const conversionRows = await sql`
    select
      count(*) filter (
        where event_type = 'preview_request_submit'
          and metadata->>'reply_email' ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
          and length(coalesce(metadata->>'role_preview', '')) >= 12
      )::int as verified_preview_requests,
      count(*) filter (where event_type = 'book_feedback_click')::int as feedback_clicks,
      count(*) filter (where event_type = 'reply_email_click')::int as reply_email_clicks,
      count(*) filter (where event_type = 'pricing_plan_select')::int as pricing_selects
    from hirelix_growth_landing_events
    where email_id like ${`${options.emailPrefix}%`}
  `;

  const clicks = clickRows[0] || {};
  const conversions = conversionRows[0] || {};
  const checkedCount = checkedDelivery.length;
  const bounceRate = checkedCount ? bounced / checkedCount : 0;
  const verifiedPreviewRequests = Number(conversions.verified_preview_requests || 0);
  const feedbackClicks = Number(conversions.feedback_clicks || 0);
  const replyEmailClicks = Number(conversions.reply_email_clicks || 0);
  const pricingSelects = Number(conversions.pricing_selects || 0);
  const hardConversionSignals = verifiedPreviewRequests + feedbackClicks + replyEmailClicks;
  const issues = [];

  if (!sentRows.length) issues.push("pending_send:no_followup_emails_sent");
  if (statusCount(sendRows, "error") > 0) issues.push("send_errors_present");
  if (checkedCount > 0 && bounceRate > BOUNCE_STOP_RATE) {
    issues.push(`stop:bounce_rate_${percentage(bounced, checkedCount)}_exceeds_5%`);
  }
  if (sentRows.length > 0 && checkedCount < sentRows.length) {
    issues.push(`pending_delivery:${sentRows.length - checkedCount}_unchecked`);
  }
  if (sentRows.length > 0 && checkedCount === sentRows.length && hardConversionSignals === 0) {
    issues.push("no_verified_conversion_yet");
  }

  const summary = {
    batch: batch.batch || options.batchPath,
    planned_recipients: batchEmails.length,
    sent: sentRows.length,
    delivered,
    bounced,
    checked_delivery: checkedCount,
    bounce_rate: percentage(bounced, checkedCount),
    qualified_clicks: Number(clicks.qualified_clicks || 0),
    qualified_clicked_emails: Number(clicks.qualified_clicked_emails || 0),
    noisy_clicks: Number(clicks.noisy_clicks || 0),
    verified_preview_requests: verifiedPreviewRequests,
    feedback_clicks: feedbackClicks,
    reply_email_clicks: replyEmailClicks,
    pricing_selects: pricingSelects,
    decision: issues.length ? "hold" : "continue_small_batch",
    issues: issues.join(";") || "none",
  };

  const blockingIssues = options.allowPendingSend
    ? issues.filter((issue) => issue !== "pending_send:no_followup_emails_sent")
    : issues;

  console.table([summary]);
  if (blockingIssues.some((issue) => issue.startsWith("stop:") || issue.startsWith("send_errors"))) {
    process.exit(2);
  }
  if (blockingIssues.length) process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
