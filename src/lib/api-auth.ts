import type { NextRequest } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-server";

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

  const authClients = [
    supabaseAdmin,
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
  ];

  for (const client of authClients) {
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);

    if (!error && user) {
      return user;
    }

    if (error) {
      console.error("[api-auth] Failed to resolve user:", error.message);
    }
  }
  return null;
}
