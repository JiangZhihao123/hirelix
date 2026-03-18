import { createClient } from "@supabase/supabase-js";
import { fetch as undiciFetch, ProxyAgent } from "undici";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const proxyUrl =
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  global:
    process.env.NODE_ENV === "development" && proxyUrl
      ? {
          fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
            const requestInit = (init ?? {}) as Record<string, unknown>;
            return undiciFetch(input as never, {
              ...requestInit,
              dispatcher: new ProxyAgent(proxyUrl),
            } as never) as unknown as Promise<Response>;
          }) as typeof fetch,
        }
      : undefined,
});
