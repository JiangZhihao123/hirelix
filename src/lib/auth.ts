/**
 * better-auth server instance.
 *
 * Replaces self-hosted Zitadel + the legacy Supabase Auth integration. Auth
 * data lives in the same Postgres as the rest of Hirelix (see
 * `src/db/client.ts`), so there's no separate identity service to operate.
 *
 * Tables (`user`, `session`, `account`, `verification`) are created by
 * `supabase/migrations/20260508_add_better_auth_tables.sql`.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { randomUUID } from "node:crypto";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for better-auth.`);
  return v;
}

export const auth = betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
      // Match the snake_case column names we use in our SQL migrations and
      // existing hirelix_* tables. Without this, better-auth defaults to
      // camelCase column names (e.g. `userId`, `expiresAt`).
      usePlural: false,
    }),
    secret: readEnv("BETTER_AUTH_SECRET"),
    baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
    socialProviders: {
      google: {
        clientId: readEnv("GOOGLE_CLIENT_ID"),
        clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
      },
    },
    advanced: {
      database: {
        // Issue uuid-shaped ids so the existing `hirelix_*.user_id uuid`
        // columns continue to work — better-auth stores `user.id` as text but
        // the value is a valid UUID string.
        generateId: () => randomUUID(),
      },
      // We use HttpOnly cookie sessions across our own subdomains. Lax is
      // sufficient because we don't accept cross-site form posts.
      defaultCookieAttributes: {
        sameSite: "lax",
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh sliding window once per day
    },
  });
