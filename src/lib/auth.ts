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
import { refreshAccessToken } from "better-auth/oauth2";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { randomUUID } from "node:crypto";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AuthConfigurationError, AUTH_UNAVAILABLE_PAYLOAD, missingAuthSettings } from "./auth-status";
import { getLogger } from "./logger";

const authLogger = getLogger({ component: "auth_configuration" });

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for better-auth.`);
  return v;
}

function getOtpFromEmail() {
  return process.env.AUTH_OTP_FROM_EMAIL ||
    process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL ||
    "Hirelix <notifications@hirelix.online>";
}

function getTrustedOrigins() {
  const configuredOrigins = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];

  return Array.from(
    new Set(
      [
        ...configuredOrigins,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ].filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmailOtp({ email, otp }: { email: string; otp: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getOtpFromEmail();
  if (!apiKey || !from) {
    throw new Error("Email OTP is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Hirelix sign-in code",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <p>Use this code to sign in to Hirelix:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:0.18em">${escapeHtml(otp)}</p>
          <p style="color:#475569;font-size:14px">This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>
        </div>
      `,
      text: `Your Hirelix sign-in code is ${otp}. It expires in 5 minutes.`,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = typeof data?.message === "string"
      ? data.message
      : `Resend failed with status ${response.status}`;
    throw new Error(message);
  }
}

function createAuth() {
  const missing = missingAuthSettings(process.env);
  if (missing.length) throw new AuthConfigurationError(missing);
  return betterAuth({
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
    trustedOrigins: getTrustedOrigins(),
    // Missing/consumed OAuth state must start a fresh flow, never skip validation.
    onAPIError: { errorURL: "/auth/retry" },
    // Manual linking requires the active Hirelix session and OAuth state. Never
    // implicitly merge users by email, including Microsoft unverified claims.
    account: { encryptOAuthTokens: true, accountLinking: { allowDifferentEmails: true, disableImplicitLinking: true, trustedProviders: ["microsoft"] } },
    socialProviders: {
      ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET ? { microsoft: { clientId: process.env.MICROSOFT_CLIENT_ID, clientSecret: process.env.MICROSOFT_CLIENT_SECRET, tenantId: "common", refreshAccessToken: (refreshToken: string) => refreshAccessToken({refreshToken,options:{clientId:process.env.MICROSOFT_CLIENT_ID!,clientSecret:process.env.MICROSOFT_CLIENT_SECRET!},tokenEndpoint:"https://login.microsoftonline.com/common/oauth2/v2.0/token"}) } } : {}),
      google: {
        clientId: readEnv("GOOGLE_CLIENT_ID"),
        clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
        accessType: "offline",
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    plugins: [
      emailOTP({
        expiresIn: 60 * 5,
        otpLength: 6,
        async sendVerificationOTP({ email, otp }) {
          await sendEmailOtp({ email, otp });
        },
      }),
    ],
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
}

let instance: ReturnType<typeof createAuth> | undefined;
function getAuth() {
  return (instance ??= createAuth());
}

// Route collection must not require backend credentials. Real requests still
// initialize the same auth configuration and fail if required settings are absent.
export const auth = {
  get api() {
    return getAuth().api;
  },
  async handler(request: Request) {
    try {
      return await getAuth().handler(request);
    } catch (error) {
      if (!(error instanceof AuthConfigurationError)) throw error;
      authLogger.error({ missing_settings: error.missing }, "Authentication configuration is incomplete");
      return Response.json(AUTH_UNAVAILABLE_PAYLOAD, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
  },
};
