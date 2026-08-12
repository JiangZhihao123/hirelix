#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import postgres from "postgres";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function argValue(args, name, fallback = null) {
  const direct = args.indexOf(name);
  if (direct >= 0) return args[direct + 1] ?? fallback;
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function generateCode() {
  const token = Array.from(randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return `HIRELIX-BETA-${token.slice(0, 4)}-${token.slice(4)}`;
}

function hashCode(code) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/tools/create-redemption-codes.mjs --count 20 --campaign recruiter-beta-2026-08 [--days 30] [--expires-days 45] [--created-by email]");
  process.exit(0);
}

const count = Number.parseInt(argValue(args, "--count", "1"), 10);
const durationDays = Number.parseInt(argValue(args, "--days", "30"), 10);
const expiresDays = Number.parseInt(argValue(args, "--expires-days", "45"), 10);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("--count must be 1-1000.");
if (!Number.isInteger(durationDays) || durationDays < 1) throw new Error("--days must be positive.");
if (!Number.isInteger(expiresDays) || expiresDays < 1) throw new Error("--expires-days must be positive.");

const env = { ...loadDotEnv(".env"), ...loadDotEnv(".env.local"), ...process.env };
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: /[?&]sslmode=disable\b/i.test(env.DATABASE_URL) ? false : "require",
  max: 1,
});

const campaign = argValue(args, "--campaign", "manual-beta");
const createdBy = argValue(args, "--created-by");
const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
const rows = [];
try {
  while (rows.length < count) {
    const code = generateCode();
    try {
      await sql`
        INSERT INTO hirelix_redemption_codes (
          code_hash, code_prefix, campaign, benefit_plan, duration_days,
          max_redemptions, redemption_count, status, expires_at, created_by
        ) VALUES (
          ${hashCode(code)}, ${code.slice(0, -5)}, ${campaign}, 'starter_monthly',
          ${durationDays}, 1, 0, 'active', ${expiresAt}, ${createdBy}
        )
      `;
      rows.push({ code, campaign, duration_days: durationDays, expires_at: expiresAt.toISOString() });
    } catch (error) {
      if (error?.code === "23505") continue;
      throw error;
    }
  }
  console.log("code,campaign,duration_days,expires_at");
  for (const row of rows) console.log(`${row.code},${row.campaign},${row.duration_days},${row.expires_at}`);
} finally {
  await sql.end({ timeout: 5 });
}
