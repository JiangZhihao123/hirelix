/**
 * better-auth client (browser-side helper).
 *
 * Used by `LoginForm`, `AuthProvider`, and any other client component that
 * needs to start a sign-in flow, observe the current session, or sign out.
 */

"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // Same-origin: API routes are served at `/api/auth/*` on whichever host is
  // serving the SPA, so we don't need to set baseURL explicitly.
  plugins: [emailOTPClient()],
});

export const {
  useSession,
  signIn,
  signOut,
  signUp,
  getSession,
} = authClient;
