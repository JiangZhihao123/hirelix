"use client";

import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { useLanguage } from "@/components/LanguageProvider";

export default function RetrySignInPage() {
  const { locale } = useLanguage();
  const zh = locale === "zh";
  return <main className="min-h-screen flex items-center justify-center bg-stone-50 px-6 py-12">
    <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <Link href="/" className="font-semibold text-xl text-emerald-900">Hirelix</Link>
      <h1 className="mt-6 text-2xl font-semibold">{zh ? "请重新登录" : "Please sign in again"}</h1>
      <p className="mt-3 mb-6 text-sm leading-6 text-stone-600" role="status">
        {zh ? "这次登录未能完成。登录链接可能已过期、已使用，或是在另一个浏览器中打开。请在当前浏览器重新开始登录，不要刷新或重复使用旧的 Google 回跳链接。" : "This sign-in could not be completed. The link may have expired, already been used, or opened in a different browser. Start again in this browser instead of refreshing or reusing the old Google callback link."}
      </p>
      <LoginForm redirectPath="/app" />
    </section>
  </main>;
}
