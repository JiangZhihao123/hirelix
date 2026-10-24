"use client";

import { createContext, useContext, type ReactNode } from "react";

import { authClient, useSession } from "@/lib/auth-client";
import { authUnavailableMessage } from "@/lib/auth-status";


/**
 * Subset of the better-auth user shape that the rest of the app reads.
 * Kept structurally compatible with the previous Supabase `User` shape so
 * call sites that already access `user.id`, `user.email`, and
 * `user.user_metadata.{name,avatar_url}` keep working unchanged.
 */
type AppUser = {
  id: string;
  email?: string;
  created_at?: string | Date;
  user_metadata: {
    name?: string | null;
    avatar_url?: string | null;
    auth_provider?: string;
  };
};

type AuthState = {
  user: AppUser | null;
  loading: boolean;
  unavailable: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  unavailable: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error } = useSession();

  const user: AppUser | null = data?.user
    ? {
        id: data.user.id,
        email: data.user.email ?? undefined,
        created_at: data.user.createdAt,
        user_metadata: {
          name: data.user.name ?? null,
          avatar_url: data.user.image ?? null,
          auth_provider: "better-auth",
        },
      }
    : null;

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
        unavailable: authUnavailableMessage(error),
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
