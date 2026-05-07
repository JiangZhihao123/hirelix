import type { NextRequest } from "next/server";

import { auth } from "./auth";

/**
 * Minimal authenticated user shape used by API routes. Mirrors the subset of
 * better-auth's `User` that callers actually consume. We intentionally keep
 * the shape stable so the rest of the codebase doesn't need to know which
 * Auth library is currently in use.
 */
export type ApiAuthUser = {
  id: string;
  email?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

/**
 * Resolve the authenticated user from a better-auth session cookie.
 *
 * better-auth uses an HttpOnly cookie (`better-auth.session_token`) that is
 * sent automatically with same-origin requests. This function validates the
 * session against the `session` table in our Postgres without any external
 * network call.
 */
export async function getUserFromApiRequest(
  req: NextRequest,
): Promise<ApiAuthUser | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? undefined,
    user_metadata: {
      name: session.user.name,
      avatar_url: session.user.image,
    },
  };
}
