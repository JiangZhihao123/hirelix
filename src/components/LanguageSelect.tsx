"use client";

import { useState } from "react";
import { useLanguage, useT } from "./LanguageProvider";
import type { Locale } from "@/lib/locale";

export function LanguageSelect({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLanguage();
  const t = useT();
  const [pending, setPending] = useState<Locale | null>(null);
  const [error, setError] = useState("");

  async function change(next: Locale) {
    if (next === locale) return;
    setPending(next);
    setError("");
    try {
      await setLocale(next);
    } catch {
      setError(t("Could not save language preference"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={className}>
      <select
        aria-label={t("Interface language")}
        value={pending ?? locale}
        disabled={pending !== null}
        onChange={(event) => void change(event.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
