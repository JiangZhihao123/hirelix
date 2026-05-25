#!/usr/bin/env node

import { Client } from "pg";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { limit: 50 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--limit" && args[i + 1]) {
      options.limit = Number(args[i + 1]);
      i += 1;
    }
  }
  return options;
}

const { limit } = parseArgs();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const client = new Client({
  connectionString,
  ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  const result = await client.query(
    `
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
      LIMIT $1
    `,
    [Number.isFinite(limit) ? limit : 50],
  );
  console.table(result.rows);
} finally {
  await client.end();
}
