"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Loader2, LogOut } from "lucide-react";
import { ProductAnalyticsDashboard } from "../ops/ceo/ProductAnalyticsDashboard";
import { OpsDashboardClient } from "../ops/[secret]/OpsDashboardClient";

export function AdminClient({ initialUsername }: { initialUsername: string }) {
  const [account, setAccount] = useState(initialUsername);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(false);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "登录失败，请重试");
      setPassword(""); setAccount(result.username);
    } catch (e) { setError(e instanceof Error ? e.message : "网络连接失败，请重试"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw Error("退出失败，请重试");
      setAccount(""); setPassword(""); setLegacy(false);
    } catch (e) { setError(e instanceof Error ? e.message : "退出失败，请重试"); }
    finally { setBusy(false); }
  }
  if (!account) return (
    <main lang="zh-CN" className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 py-12 text-slate-950">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-semibold text-emerald-800">Hirelix</Link>
        <LockKeyhole className="mb-5 mt-8 h-7 w-7 text-emerald-800" aria-hidden />
        <h1 className="text-2xl font-semibold">管理员登录</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">查看网站流量、产品使用和运营数据。</p>
        <form onSubmit={login} className="mt-7 space-y-5">
          <div><label htmlFor="admin-username" className="mb-2 block text-sm font-medium">用户名</label>
            <input id="admin-username" name="username" autoComplete="username" required maxLength={128} value={username} onChange={e => setUsername(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" /></div>
          <div><label htmlFor="admin-password" className="mb-2 block text-sm font-medium">密码</label>
            <input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={512} value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" /></div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? "正在登录…" : "登录"}</button>
        </form>
      </section>
    </main>
  );
  return <div lang="zh-CN">
    <header className="flex items-center justify-between gap-4 border-b bg-white px-6 py-3 text-sm">
      <span className="font-semibold text-emerald-900">Hirelix 管理后台</span>
      <nav aria-label="管理导航" className="flex items-center gap-5">
        <button onClick={() => setLegacy(!legacy)} className="text-slate-600">{legacy ? "流量与产品分析" : "历史运营看板"}</button>
        <span className="text-slate-500">{account}</span>
        <button disabled={busy} onClick={logout} className="flex items-center gap-1.5 text-slate-700"><LogOut className="h-4 w-4" aria-hidden />退出登录</button>
      </nav>
    </header>
    {error && <p role="alert" className="bg-red-50 p-3 text-center text-sm text-red-700">{error}</p>}
    {legacy ? <OpsDashboardClient /> : <ProductAnalyticsDashboard />}
  </div>;
}
