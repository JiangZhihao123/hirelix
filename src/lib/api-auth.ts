import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { fetch as undiciFetch, ProxyAgent } from "undici";

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function getUserFromApiRequest(req: NextRequest): Promise<User | null> {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`;
  const proxyUrl =
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy;

  try {
    const response = process.env.NODE_ENV === "development" && proxyUrl
      ? await undiciFetch(authUrl, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
          dispatcher: new ProxyAgent(proxyUrl),
        })
      : await fetch(authUrl, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
        });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "[api-auth] Failed to resolve user:",
        `status=${response.status} body=${text.slice(0, 200)}`,
      );
      return null;
    }

    return (await response.json()) as User;
  } catch (error) {
    console.error(
      "[api-auth] Failed to resolve user:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
