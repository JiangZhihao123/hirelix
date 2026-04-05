import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  global: { fetch: fetchWithTimeout },
});
