#!/usr/bin/env node

import fs from "node:fs";
import postgres from "postgres";

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

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

const args = process.argv.slice(2);
const format = args.includes("--csv") ? "csv" : "table";
const includeRaw = args.includes("--raw");
const showSummary = args.includes("--summary");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = Number.parseInt(limitArg?.split("=")[1] || "50", 10);
const env = {
  ...loadDotEnv(".env"),
  ...loadDotEnv(".env.local"),
  ...process.env,
};

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: shouldRequireSsl(env.DATABASE_URL) ? "require" : false,
  max: 1,
});

try {
  if (showSummary) {
    const rows = await sql`
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
        where email_id like '2026-05-25-%'
      )
      select
        coalesce(batch_id, 'unknown') as batch_id,
        count(*)::int as raw_clicks,
        count(distinct email_id)::int as raw_clicked_emails,
        count(*) filter (where not likely_scanner and not malformed_context)::int as qualified_clicks,
        count(distinct email_id) filter (where not likely_scanner and not malformed_context)::int as qualified_clicked_emails,
        count(*) filter (where likely_scanner or malformed_context)::int as noisy_clicks
      from classified
      group by coalesce(batch_id, 'unknown')
      order by coalesce(batch_id, 'unknown')
    `;
    console.table(rows);
    process.exit(0);
  }

  const rows = await sql`
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
    )
    select
      created_at,
      email_id,
      batch_id,
      recipient,
      company,
      ip_address,
      user_agent,
      destination_url,
      likely_scanner,
      malformed_context,
      case
        when likely_scanner then 'scanner'
        when malformed_context then 'malformed_context'
        else 'qualified'
      end as click_quality
    from classified
    where ${includeRaw} or (not likely_scanner and not malformed_context)
    order by created_at desc
    limit ${Number.isFinite(limit) && limit > 0 ? limit : 50}
  `;

  if (format === "csv") {
    console.log([
      "created_at",
      "email_id",
      "batch_id",
      "recipient",
      "company",
      "ip_address",
      "user_agent",
      "destination_url",
      "click_quality",
    ].join(","));
    for (const row of rows) {
      console.log([
        row.created_at?.toISOString?.() || row.created_at,
        row.email_id,
        row.batch_id,
        row.recipient,
        row.company,
        row.ip_address,
        row.user_agent,
        row.destination_url,
        row.click_quality,
      ].map(csvEscape).join(","));
    }
  } else {
    console.table(rows.map((row) => ({
      created_at: row.created_at?.toISOString?.() || row.created_at,
      email_id: row.email_id,
      batch_id: row.batch_id,
      recipient: row.recipient,
      company: row.company,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      click_quality: row.click_quality,
    })));
  }
} finally {
  await sql.end({ timeout: 5 });
}
