/**
 * better-auth client (browser-side helper).
 *
 * Used by `LoginForm`, `AuthProvider`, and any other client component that
 * needs to start a sign-in flow, observe the current session, or sign out.
 */

"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { authTransportFetch } from "./auth-status";
import { syncAcquisitionCookie } from "./analytics";

export const authClient = createAuthClient({
  // Same-origin: API routes are served at `/api/auth/*` on whichever host is
  // serving the SPA, so we don't need to set baseURL explicitly.
  plugins: [emailOTPClient()],
  fetchOptions: { customFetchImpl: (input, init) => {
    if (typeof window !== "undefined" && window.__hirelixGrowthIdentity) {
      syncAcquisitionCookie(window.__hirelixGrowthIdentity);
    }
    return authTransportFetch(input, init);
  } },
});

export const {
  useSession,
  signIn,
  signOut,
  signUp,
  getSession,
} = authClient;
