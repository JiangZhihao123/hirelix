import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedSupabaseClient: SupabaseClient | null = null;

function requireSupabaseClientEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  }
  if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getSupabaseClient() {
  if (cachedSupabaseClient) return cachedSupabaseClient;

  const { supabaseUrl, supabaseAnonKey } = requireSupabaseClientEnv();
  cachedSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return cachedSupabaseClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
