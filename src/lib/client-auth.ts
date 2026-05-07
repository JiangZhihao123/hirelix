"use client";

/**
 * Client helper for calling our API with the current user's session.
 *
 * better-auth uses an HttpOnly session cookie that is sent automatically with
 * same-origin requests when `credentials: 'include'` is set. There is no
 * Bearer token to manage anymore — the previous Supabase-style refresh logic
 * is gone.
 */

export async function fetchWithUserSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
  });
}
