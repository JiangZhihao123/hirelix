import { NextRequest, NextResponse } from "next/server";
import { adminClientKey, adminConfigured, adminCookieName, adminCookieOptions, adminSameOrigin, checkAdminCredentials, consumeAdminLoginAttempt, createAdminSession, readAdminSession, revokeAdminSession } from "@/lib/admin-auth";
import { getLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const session = await readAdminSession(req.cookies.get(adminCookieName())?.value);
  return session ? reply(session) : reply({ error: "未登录" }, 401);
}
export async function POST(req: NextRequest) {
  if (!adminSameOrigin(req)) return reply({ error: "请求来源无效" }, 403);
  if (!adminConfigured()) return reply({ error: "管理员登录暂不可用" }, 503);
  try {
    if (Number(req.headers.get("content-length")) > 2048) return reply({ error: "请求过大" }, 413);
    const body = await req.text();
    if (Buffer.byteLength(body) > 2048) return reply({ error: "请求过大" }, 413);
    let data;
    try { data = JSON.parse(body); } catch { return reply({ error: "请求格式无效" }, 400); }
    if (!data || typeof data.username !== "string" || typeof data.password !== "string" || data.username.length > 128 || data.password.length > 512)
      return reply({ error: "请输入用户名和密码" }, 400);
    const retry = await consumeAdminLoginAttempt(adminClientKey(req));
    if (retry) {
      const response = reply({ error: "尝试次数过多，请稍后再试" }, 429);
      response.headers.set("Retry-After", String(retry));
      return response;
    }
    if (!await checkAdminCredentials(data.username, data.password)) return reply({ error: "用户名或密码错误" }, 401);
    await revokeAdminSession(req.cookies.get(adminCookieName())?.value);
    const token = await createAdminSession();
    const response = reply({ username: process.env.ADMIN_USERNAME });
    response.cookies.set(adminCookieName(), token, adminCookieOptions());
    return response;
  } catch {
    getLogger({ component: "admin_auth" }).error("Admin login failed");
    return reply({ error: "登录暂时失败，请重试" }, 503);
  }
}
export async function DELETE(req: NextRequest) {
  if (!adminSameOrigin(req)) return reply({ error: "请求来源无效" }, 403);
  try {
    await revokeAdminSession(req.cookies.get(adminCookieName())?.value);
    const response = reply({ ok: true });
    response.cookies.set(adminCookieName(), "", { ...adminCookieOptions(), maxAge: 0 });
    return response;
  } catch {
    return reply({ error: "退出失败，请重试" }, 503);
  }
}
