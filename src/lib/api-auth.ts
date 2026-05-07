import type { NextRequest } from "next/server";

import { verifySupabaseJwt } from "./jwt-verify";

/**
 * Minimal authenticated user shape used by API routes. Mirrors the subset of
 * `@supabase/supabase-js`'s `User` that callers actually consume (`id`,
 * `email`). We intentionally don't re-export the full Supabase `User` type so
 * the rest of the codebase stays decoupled from the Supabase JS SDK for data
 * access purposes.
 */
export type ApiAuthUser = {
  id: string;
  email?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve the authenticated user from a Supabase-issued JWT in the
 * `Authorization: Bearer <token>` header.
 *
 * Verifies the JWT locally using `SUPABASE_JWT_SECRET`. This avoids a
 * round-trip to `${SUPABASE_URL}/auth/v1/user` for every API call, which is
 * critical for keeping Supabase Auth egress low after we move data hosting
 * off Supabase.
 */
export async function getUserFromApiRequest(
  req: NextRequest,
): Promise<ApiAuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const payload = verifySupabaseJwt(token);
  if (!payload) return null;

  return {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
    app_metadata:
      typeof payload.app_metadata === "object" && payload.app_metadata !== null
        ? (payload.app_metadata as Record<string, unknown>)
        : undefined,
    user_metadata:
      typeof payload.user_metadata === "object" && payload.user_metadata !== null
        ? (payload.user_metadata as Record<string, unknown>)
        : undefined,
  };
}
