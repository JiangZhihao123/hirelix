#!/usr/bin/env node

import fs from "node:fs";
import postgres from "postgres";

const SCANNER_USER_AGENT_PATTERN =
  /virustotal|appengine-google|python-requests|go-http-client|urlscan|googleimageproxy|proofpoint|mimecast|barracuda|mandrill|sendgrid|mailchimp|linkexpand|preview|crawler|spider|bot/i;
const STATIC_ASSET_PATTERN =
  /(?:^|\/)(?:_next\/static|static\/|assets\/|favicon\.|robots\.txt|sitemap\.xml)|\.(?:js|css|map|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/i;

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
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function isValidEmail(email) {
  return /^[^@]+@[^@]+\.[^@]+$/.test(email);
}

function isStaticAssetValue(value) {
  return Boolean(value && STATIC_ASSET_PATTERN.test(value));
}

function usage() {
  console.log(`Usage:
  node scripts/tools/validate-growth-followup-batch.mjs <followup-batch.json>

Required:
  DATABASE_URL

Optional:
  GROWTH_DELIVERY_STATUS_PATH  defaults to docs/growth/cold-email-delivery-status-2026-05-25.csv
`);
}

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(args.length ? 0 : 1);
}

const batchPath = args[0];
const env = {
  ...loadDotEnv(".env"),
  ...loadDotEnv(".env.local"),
  ...process.env,
};

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const deliveryStatusPath =
  env.GROWTH_DELIVERY_STATUS_PATH || "docs/growth/cold-email-delivery-status-2026-05-25.csv";
const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
const emails = Array.isArray(batch.emails) ? batch.emails : [];
if (!emails.length) throw new Error("Batch has no emails.");

const deliveryRows = readCsv(deliveryStatusPath);
const deliveryByEmailId = new Map(deliveryRows.map((row) => [row.email_id, row]));
const originalIds = emails.map((email) => email.original_email_id).filter(Boolean);

const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: shouldRequireSsl(env.DATABASE_URL) ? "require" : false,
  max: 1,
});

try {
  const clickRows = await sql`
    select
      email_id,
      count(*)::int as raw_clicks,
      count(*) filter (
        where not (coalesce(user_agent, '') ~* '(virustotal|appengine-google|python-requests|go-http-client|urlscan|googleimageproxy|proofpoint|mimecast|barracuda|mandrill|sendgrid|mailchimp|linkexpand|preview|crawler|spider|bot)')
      )::int as non_scanner_clicks,
      count(*) filter (
        where not (coalesce(user_agent, '') ~* '(virustotal|appengine-google|python-requests|go-http-client|urlscan|googleimageproxy|proofpoint|mimecast|barracuda|mandrill|sendgrid|mailchimp|linkexpand|preview|crawler|spider|bot)')
          and coalesce(company, '') !~ '(^|/)(_next/static|static/|assets/|favicon\\.|robots\\.txt|sitemap\\.xml)|\\.(js|css|map|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$'
          and coalesce(recipient, '') ~ '^[^@]+@[^@]+\\.[^@]+$'
      )::int as qualified_clicks,
      bool_or(coalesce(user_agent, '') ~* '(virustotal|appengine-google|python-requests|go-http-client|urlscan|googleimageproxy|proofpoint|mimecast|barracuda|mandrill|sendgrid|mailchimp|linkexpand|preview|crawler|spider|bot)') as has_scanner_clicks
    from hirelix_growth_outreach_clicks
    where email_id = any(${originalIds})
    group by email_id
  `;
  const landingRows = await sql`
    select
      email_id,
      count(*) filter (where event_type = 'page_view')::int as page_views,
      count(*) filter (where event_type = 'engaged_10s')::int as engaged_10s,
      count(*) filter (where event_type = 'sample_view')::int as sample_views,
      count(*) filter (where event_type = 'signin_view')::int as signin_views,
      count(*) filter (where event_type = 'pricing_plan_select')::int as pricing_selects
    from hirelix_growth_landing_events
    where email_id = any(${originalIds})
    group by email_id
  `;

  const clicksByEmailId = new Map(clickRows.map((row) => [row.email_id, row]));
  const landingByEmailId = new Map(landingRows.map((row) => [row.email_id, row]));
  const seenIds = new Set();
  const seenRecipients = new Set();
  const report = [];

  for (const email of emails) {
    const issues = [];
    if (!email.id || seenIds.has(email.id)) issues.push("missing_or_duplicate_followup_id");
    seenIds.add(email.id);

    if (!email.original_email_id) issues.push("missing_original_email_id");
    if (!isValidEmail(email.to || "")) issues.push("invalid_recipient_email");
    if (seenRecipients.has(String(email.to).toLowerCase())) issues.push("duplicate_recipient");
    seenRecipients.add(String(email.to).toLowerCase());

    if (!email.body?.includes('reply "opt out"')) issues.push("missing_opt_out");
    if (!email.body?.includes("{{MAILING_ADDRESS_REQUIRED_BEFORE_SEND}}")) {
      issues.push("missing_mailing_address_placeholder");
    }
    if (!email.body || !/(JD|role|preview|shortlist)/i.test(email.body)) {
      issues.push("missing_preview_request_language");
    }
    if (isStaticAssetValue(email.company) || isStaticAssetValue(email.to)) {
      issues.push("static_asset_context");
    }

    const delivery = deliveryByEmailId.get(email.original_email_id);
    if (!delivery) {
      issues.push("missing_delivery_status");
    } else if (delivery.last_event !== "delivered") {
      issues.push(`not_delivered:${delivery.last_event || "unknown"}`);
    }

    const clicks = clicksByEmailId.get(email.original_email_id) || {};
    const landing = landingByEmailId.get(email.original_email_id) || {};
    const qualifiedClicks = Number(clicks.qualified_clicks || 0);
    const engagedEvents = Number(landing.engaged_10s || 0);
    const deeperActions =
      Number(landing.sample_views || 0) +
      Number(landing.signin_views || 0) +
      Number(landing.pricing_selects || 0);

    if (qualifiedClicks < 1 && engagedEvents < 1 && deeperActions < 1) {
      issues.push("no_qualified_click_or_engagement");
    }
    if (qualifiedClicks < 1 && clicks.has_scanner_clicks && engagedEvents < 1 && deeperActions < 1) {
      issues.push("scanner_only_activity");
    }

    report.push({
      id: email.id,
      original_email_id: email.original_email_id,
      to: email.to,
      company: email.company,
      delivery: delivery?.last_event || "missing",
      raw_clicks: Number(clicks.raw_clicks || 0),
      qualified_clicks: qualifiedClicks,
      engaged_10s: engagedEvents,
      deeper_actions: deeperActions,
      status: issues.length ? "blocked" : "eligible",
      issues,
    });
  }

  console.table(report.map((row) => ({
    id: row.id,
    original_email_id: row.original_email_id,
    delivery: row.delivery,
    qualified_clicks: row.qualified_clicks,
    engaged_10s: row.engaged_10s,
    deeper_actions: row.deeper_actions,
    status: row.status,
    issues: row.issues.join(";"),
  })));

  const blocked = report.filter((row) => row.status === "blocked");
  if (blocked.length) {
    console.error(`Blocked ${blocked.length} of ${report.length} follow-up emails.`);
    process.exit(1);
  }
  console.log(`Eligible follow-up emails: ${report.length}`);
} finally {
  await sql.end({ timeout: 5 });
}
