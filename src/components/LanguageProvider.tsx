"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { fetchWithUserSession } from "@/lib/client-auth";
import { isLocale, type Locale } from "@/lib/locale";
import { uiZh } from "@/lib/ui-zh";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  setLocale: async () => {},
});

const storageKey = "hirelix:ui-language";
const languageChangeEvent = "hirelix:language-change";
function readLocale(): Locale {
  const value = window.localStorage.getItem(storageKey);
  return isLocale(value) ? value : "en";
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(languageChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(languageChangeEvent, callback);
  };
}
function saveLocale(value: Locale) {
  window.localStorage.setItem(storageKey, value);
  window.dispatchEvent(new Event(languageChangeEvent));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const locale = useSyncExternalStore(subscribe, readLocale, () => "en" as Locale);
  const preferenceVersion = useRef(0);

  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    const version = preferenceVersion.current;
    void fetchWithUserSession("/api/settings/language", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (controller.signal.aborted || version !== preferenceVersion.current || !isLocale(result.ui_locale)) return;
        saveLocale(result.ui_locale);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [user?.id]);

  useEffect(() => {
    if (pathname === "/") {
      document.documentElement.lang = "en";
      document.title = "Hirelix | Your Personal AI Agent for Headhunting";
      return;
    }
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    if (pathname.startsWith("/app")) {
      document.title = locale === "zh"
        ? "Hirelix｜专业猎头的私人助理"
        : "Hirelix | Private AI Agent for Professional Headhunters";
    }
  }, [locale, pathname]);

  const setLocale = useCallback(async (next: Locale) => {
    preferenceVersion.current += 1;
    const response = await fetchWithUserSession("/api/settings/language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui_locale: next }),
    });
    if (!response.ok) throw new Error("Could not save language preference");
    saveLocale(next);
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT() {
  const { locale } = useLanguage();
  return useCallback((english: string) => {
    if (locale === "en") return english;
    return uiZh[english] || english;
  }, [locale]);
}
