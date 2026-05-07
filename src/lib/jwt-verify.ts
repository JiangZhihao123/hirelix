/**
 * Local Supabase JWT verification.
 *
 * Supabase Auth issues HS256-signed JWTs for every authenticated user. We
 * verify them locally using the project's JWT secret (found in Supabase
 * Dashboard → Project Settings → API → JWT Settings → JWT Secret).
 *
 * Verifying locally avoids a round-trip to `${SUPABASE_URL}/auth/v1/user`
 * for every API call and is the standard pattern recommended by Supabase
 * for backends that don't share a database with Supabase Auth.
 *
 * The returned payload structure mirrors what Supabase puts in JWTs:
 *   - sub: user UUID
 *   - email: user email
 *   - role: 'authenticated' | 'service_role' | 'anon'
 *   - app_metadata, user_metadata: opaque JSON
 *   - aal, session_id, etc.
 */

import jwt from "jsonwebtoken";

export type SupabaseJwtPayload = {
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  session_id?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  // Allow extra fields without losing type safety on known ones.
  [key: string]: unknown;
};

function readJwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is required for local JWT verification. " +
        "Find it in Supabase Dashboard → Project Settings → API → JWT Settings.",
    );
  }
  return secret;
}

/**
 * Verify a Supabase-issued JWT and return its decoded payload.
 * Returns null if the token is invalid, expired, or the signature doesn't match.
 */
export function verifySupabaseJwt(token: string): SupabaseJwtPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, readJwtSecret(), {
      algorithms: ["HS256"],
    });
    if (typeof decoded === "string") return null;
    if (typeof decoded.sub !== "string") return null;
    return decoded as SupabaseJwtPayload;
  } catch (error) {
    // Common cases: expired, malformed, wrong signature. Swallow and return null
    // so callers can treat it like "no user".
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[jwt-verify] verification failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
    return null;
  }
}
