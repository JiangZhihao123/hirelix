#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
const DEFAULT_BASE_URL = "https://hirelix.online";

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
  node scripts/tools/create-beta-invite.mjs --email noah@example.com [--first-name Noah] [--company Acme] [--seat 1] [--batch batch1] [--campaign founder_outreach]

Creates one private beta invite and prints the invite link.
Required env:
  DATABASE_URL
Optional env:
  NEXT_PUBLIC_SITE_URL or APP_BASE_URL
`);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function generateCode(length = 18) {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(args.length ? 0 : 1);
}

const env = {
  ...loadDotEnv(path.resolve(".env")),
  ...loadDotEnv(path.resolve(".env.local")),
  ...process.env,
};

if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const email = argValue(args, "--email");
const seatRaw = argValue(args, "--seat");
const now = new Date();
const expiresAt = addDays(now, Number.parseInt(argValue(args, "--expires-days") || "14", 10));
const baseUrl = (env.APP_BASE_URL || env.NEXT_PUBLIC_SITE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: /[?&]sslmode=disable\b/i.test(env.DATABASE_URL) ? false : "require",
});

try {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateCode();
    try {
      await sql`
        INSERT INTO hirelix_beta_invites (
          invite_code,
          recipient_email,
          first_name,
          company,
          source,
          batch_id,
          campaign,
          status,
          seat_number,
          free_search_limit,
          referral_limit,
          expires_at,
          created_at,
          updated_at
        )
        VALUES (
          ${inviteCode},
          ${email ? email.trim().toLowerCase() : null},
          ${argValue(args, "--first-name")},
          ${argValue(args, "--company")},
          ${argValue(args, "--source") || "manual"},
          ${argValue(args, "--batch")},
          ${argValue(args, "--campaign") || "founder_outreach"},
          'reserved',
          ${seatRaw ? Number.parseInt(seatRaw, 10) : null},
          1,
          3,
          ${expiresAt},
          ${now},
          ${now}
        )
      `;
      console.log(`${baseUrl}/invite/${inviteCode}`);
      break;
    } catch (error) {
      if (error?.code === "23505" && attempt < 4) continue;
      throw error;
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
