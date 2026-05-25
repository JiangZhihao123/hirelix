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
  const rows = await sql`
    select
      created_at,
      email_id,
      batch_id,
      recipient,
      company,
      ip_address,
      user_agent,
      destination_url
    from hirelix_growth_outreach_clicks
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
    })));
  }
} finally {
  await sql.end({ timeout: 5 });
}
