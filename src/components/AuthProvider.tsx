"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

import { authClient, useSession } from "@/lib/auth-client";
import { consumeRecentGrowthGoogleSignInStarted, trackGrowthEvent } from "@/lib/growth-client";

/**
 * Subset of the better-auth user shape that the rest of the app reads.
 * Kept structurally compatible with the previous Supabase `User` shape so
 * call sites that already access `user.id`, `user.email`, and
 * `user.user_metadata.{name,avatar_url}` keep working unchanged.
 */
type AppUser = {
  id: string;
  email?: string;
  user_metadata: {
    name?: string | null;
    avatar_url?: string | null;
    auth_provider?: string;
  };
};

type AuthState = {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const trackedUserIdRef = useRef<string | null>(null);

  const user: AppUser | null = data?.user
    ? {
        id: data.user.id,
        email: data.user.email ?? undefined,
        user_metadata: {
          name: data.user.name ?? null,
          avatar_url: data.user.image ?? null,
          auth_provider: "better-auth",
        },
      }
    : null;

  useEffect(() => {
    if (isPending || !user?.id || trackedUserIdRef.current === user.id) return;
    if (!consumeRecentGrowthGoogleSignInStarted()) return;
    trackedUserIdRef.current = user.id;
    void trackGrowthEvent("signup_success", {
      route: window.location.pathname,
      has_email: Boolean(user.email),
      auth_result: "google_oauth_callback",
      invite_code: window.__hirelixGrowthIdentity?.invite_code ?? null,
    });
  }, [isPending, user?.email, user?.id]);

  const signOut = async () => {
    if (typeof window !== "undefined") {
      for (const key of Object.keys(window.sessionStorage)) {
        if (key.startsWith("hirelix:search-page:")) {
          window.sessionStorage.removeItem(key);
        }
      }
    }
    await authClient.signOut();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: isPending,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
