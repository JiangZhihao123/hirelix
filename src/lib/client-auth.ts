"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 60;

async function getClientSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[client-auth] Failed to get session:", error.message);
    return null;
  }

  return data.session ?? null;
}

function isSessionExpiringSoon(session: Session | null) {
  if (!session?.expires_at) return false;
  return session.expires_at - Math.floor(Date.now() / 1000) <= ACCESS_TOKEN_REFRESH_BUFFER_SECONDS;
}

export async function getClientAccessToken(): Promise<string | null> {
  const session = await getClientSession();
  if (!session) {
    return null;
  }

  if (isSessionExpiringSoon(session)) {
    return refreshClientAccessToken();
  }

  return session.access_token ?? null;
}

export async function refreshClientAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    console.error("[client-auth] Failed to refresh session:", error.message);
    return null;
  }

  return data.session?.access_token ?? null;
}

export async function fetchWithUserSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await getClientAccessToken();
  if (!accessToken) {
    throw new Error("Your session expired. Please sign in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  let response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status !== 401) {
    return response;
  }

  const refreshedAccessToken = await refreshClientAccessToken();
  if (!refreshedAccessToken) {
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshedAccessToken}`);

  response = await fetch(input, {
    ...init,
    headers: retryHeaders,
  });

  return response;
}
