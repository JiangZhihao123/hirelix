/**
 * better-auth catch-all route.
 *
 * Mounts every better-auth endpoint under `/api/auth/*` (sign-in, sign-out,
 * OAuth callbacks, get-session, ...). See `src/lib/auth.ts` for the
 * configuration that determines which providers are available.
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
