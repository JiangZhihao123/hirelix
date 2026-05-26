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

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    conversions: false,
    emailPrefix: "2026-05-25-",
    limit: 50,
    summary: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--limit" && args[i + 1]) {
      options.limit = Number(args[i + 1]);
      i += 1;
    } else if (args[i].startsWith("--limit=")) {
      options.limit = Number(args[i].split("=")[1]);
    } else if (args[i] === "--email-prefix" && args[i + 1]) {
      options.emailPrefix = args[i + 1];
      i += 1;
    } else if (args[i].startsWith("--email-prefix=")) {
      options.emailPrefix = args[i].split("=")[1];
    } else if (args[i] === "--summary") {
      options.summary = true;
    } else if (args[i] === "--conversions") {
      options.conversions = true;
    }
  }
  return options;
}

const { conversions, emailPrefix, limit, summary } = parseArgs();
const env = {
  ...loadDotEnv(".env"),
  ...loadDotEnv(".env.local"),
  ...process.env,
};
const connectionString = env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const sql = postgres(connectionString, {
  prepare: false,
  ssl: shouldRequireSsl(connectionString) ? "require" : false,
  max: 1,
});

try {
  if (conversions) {
    const rows = await sql`
      SELECT
        created_at,
        event_type,
        email_id,
        batch_id,
        recipient,
        company,
        metadata->>'reply_email' AS reply_email,
        metadata->>'role_preview' AS role_preview,
        metadata->>'role_length' AS role_length,
        CASE
          WHEN event_type = 'preview_request_submit'
            AND metadata->>'reply_email' ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
            AND length(coalesce(metadata->>'role_preview', '')) >= 12
            THEN 'verified_preview_request'
          WHEN event_type = 'preview_request_submit'
            THEN 'unverified_preview_request'
          ELSE event_type
        END AS conversion_quality
      FROM public.hirelix_growth_landing_events
      WHERE event_type IN (
        'preview_request_submit',
        'book_feedback_click',
        'reply_email_click',
        'pricing_plan_select'
      )
        AND email_id LIKE ${`${emailPrefix}%`}
      ORDER BY created_at DESC
      LIMIT ${Number.isFinite(limit) ? limit : 50}
    `;
    console.table(rows);
    process.exit(0);
  }

  if (summary) {
    const rows = await sql`
        SELECT
          event_type,
          COUNT(*)::int AS events,
          COUNT(DISTINCT email_id)::int AS email_ids,
          COUNT(DISTINCT session_id)::int AS sessions,
          MIN(created_at) AS first_event,
          MAX(created_at) AS last_event
        FROM public.hirelix_growth_landing_events
        WHERE email_id LIKE ${`${emailPrefix}%`}
        GROUP BY event_type
        ORDER BY event_type
      `;
    console.table(rows);
    process.exit(0);
  }

  const rows = await sql`
      SELECT
        created_at,
        event_type,
        email_id,
        batch_id,
        recipient,
        company,
        ip_address,
        user_agent,
        metadata
      FROM public.hirelix_growth_landing_events
      ORDER BY created_at DESC
      LIMIT ${Number.isFinite(limit) ? limit : 50}
    `;
  console.table(rows);
} finally {
  await sql.end({ timeout: 5 });
}
