import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 带超时的 fetch 封装，防止 VPS 网络抖动时 TCP 连接永久挂起导致 worker 卡死。
 * Supabase JS client 默认不设置任何请求超时，一旦底层 TCP 连接进入
 * 无限等待状态，调用方会永久阻塞——在调度器中会导致所有 worker 全部卡死。
 */
const SUPABASE_REQUEST_TIMEOUT_MS = 30_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Supabase request timed out after ${SUPABASE_REQUEST_TIMEOUT_MS}ms`));
  }, SUPABASE_REQUEST_TIMEOUT_MS);

  // 如果调用方已传入 signal，将其与超时 signal 合并
  const existingSignal = init?.signal;
  if (existingSignal) {
    existingSignal.addEventListener("abort", () => controller.abort(existingSignal.reason), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

let cachedSupabaseAdmin: SupabaseClient | null = null;

function requireSupabaseServerEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export function getSupabaseAdminClient() {
  if (cachedSupabaseAdmin) return cachedSupabaseAdmin;

  const { supabaseUrl, serviceRoleKey } = requireSupabaseServerEnv();
  cachedSupabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    global: { fetch: fetchWithTimeout },
  });

  return cachedSupabaseAdmin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdminClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
