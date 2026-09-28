"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SettingsPageSkeleton } from "@/components/ProductSkeletons";
import { getPlanStatusCopy, type BillingSummary } from "@/lib/billing";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useBilling } from "@/lib/use-billing";
import { useLanguage, useT } from "@/components/LanguageProvider";
import type { Locale } from "@/lib/locale";
import { AccountSection } from "./_components/AccountSection";
import { BillingPanel } from "./_components/BillingPanel";
import { RecruiterProfileSection } from "./_components/RecruiterProfileSection";
import { EMPTY_PROFILE, SettingsSection, type HeadhunterProfile, type SettingsSectionId } from "./_components/shared";

const SETTINGS_SECTION_IDS = ["account", "billing", "profile", "language"] as const satisfies readonly SettingsSectionId[];

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSectionId);
}

export default function SettingsPage() {
  const t = useT();
  const { locale } = useLanguage();
  const { user } = useAuth();
  const { billing: sharedBilling, refresh: refreshBilling } = useBilling();
  const searchParams = useSearchParams();
  const settingsHash = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("hashchange", onStoreChange);
      return () => window.removeEventListener("hashchange", onStoreChange);
    },
    () => {
      if (typeof window === "undefined") return "";
      return window.location.hash.replace("#", "");
    },
    () => "",
  );
  const [loading, setLoading] = useState(true);
  const [headhunterProfile, setHeadhunterProfile] = useState<HeadhunterProfile>(EMPTY_PROFILE);
  const [billing, setBilling] = useState<BillingSummary | null>(sharedBilling);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("account");
  const [signInMethods, setSignInMethods] = useState<string[]>([]);
  const sectionNav = [
    {
      id: "account" as const,
      label: t("Account"),
      detail: signInMethods.includes("credential") ? t("Password enabled") : t("Set password"),
    },
    {
      id: "billing" as const,
      label: t("Billing"),
      detail: billing ? getPlanStatusCopy(billing, locale).title : t("Plan and usage"),
    },
    {
      id: "profile" as const,
      label: t("Outreach identity"),
      detail: headhunterProfile.recruiter_name || t("Recruiter details"),
    },
    {
      id: "language" as const,
      label: t("Language"),
      detail: t("Choose your interface language"),
    },
  ];

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchWithUserSession("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.company_profile && typeof data.company_profile === "object") {
          setHeadhunterProfile({ ...EMPTY_PROFILE, ...data.company_profile });
        }
        if (data.billing) {
          setBilling(data.billing as BillingSummary);
        }
        if (Array.isArray(data.sign_in_methods)) {
          setSignInMethods(
            data.sign_in_methods.filter((method: unknown): method is string => typeof method === "string"),
          );
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (sharedBilling) setBilling(sharedBilling);
  }, [sharedBilling]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!["success", "pending"].includes(searchParams.get("checkout") || "")) return;
    // A redirect is not proof of payment; refresh until the signed webhook updates access.
    const timers = [0, 3000, 8000, 15000, 30000].map((delay) => window.setTimeout(() => {
      void fetchSettings(); void refreshBilling();
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fetchSettings, refreshBilling, searchParams]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    const sectionParam = searchParams.get("section");
    const requestedSection = settingsHash || sectionParam || "";
    if (!isSettingsSectionId(requestedSection)) {
      return;
    }

    setActiveSection(requestedSection);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [searchParams, settingsHash]);

  useEffect(() => {
    if (loading) return;

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [activeSection, loading]);

  function selectSection(id: SettingsSectionId) {
    setActiveSection(id);
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const selectedSection = (() => {
    if (activeSection === "language") return <LanguageSection />;
    if (activeSection === "billing") {
      return billing ? (
        <BillingPanel
          billing={billing}
          onBillingChange={(nextBilling) => {
            setBilling(nextBilling);
            void refreshBilling();
          }}
        />
      ) : (
        <SettingsPageSkeleton />
      );
    }

    if (activeSection === "profile") {
      return (
        <RecruiterProfileSection
          initialProfile={headhunterProfile}
          onNameChange={(name) =>
            setHeadhunterProfile((prev) => ({ ...prev, recruiter_name: name }))
          }
          refreshBilling={refreshBilling}
        />
      );
    }

    return (
      <AccountSection
        signInMethods={signInMethods}
        onPasswordSet={() => {
          setSignInMethods((prev) =>
            prev.includes("credential") ? prev : [...prev, "credential"],
          );
          void fetchSettings();
        }}
      />
    );
  })();

  if (loading) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {t("Workspace")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {t("Settings")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            {t("Manage your login, plan, usage, and outreach identity.")}
          </p>
        </div>
        {billing ? (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm shadow-slate-200/30">
            <span className="font-medium text-slate-950">{getPlanStatusCopy(billing, locale).title}</span>
            <span className="ml-2 text-slate-500">{getPlanStatusCopy(billing, locale).usageLabel}</span>
          </div>
        ) : null}
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {sectionNav.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`inline-flex shrink-0 items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,840px)] lg:gap-8">
        <aside className="hidden lg:block">
          <nav className="sticky top-8 rounded-lg border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/30">
            <div className="space-y-1">
              {sectionNav.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSection(item.id)}
                    className={`block w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                    >
                      <p className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                        {item.label}
                      </p>
                      <p className={`mt-1 text-xs ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                        {item.detail}
                      </p>
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>

        <div>{selectedSection}</div>
      </div>
    </div>
  );
}

function LanguageSection() {
  const { locale, setLocale } = useLanguage();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(next: Locale) {
    if (next === locale) return;
    setBusy(true);
    setError("");
    try {
      await setLocale(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save language preference");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsSection
      id="language"
      eyebrow={t("Language")}
      title={t("Language")}
      description={t("Choose the language used throughout your workspace. Candidate records and your own notes keep their original wording.")}
    >
      <div className="space-y-3" role="radiogroup" aria-label={t("Interface language")}>
        {(["en", "zh"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={locale === value}
            disabled={busy}
            onClick={() => void change(value)}
            className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors ${locale === value ? "border-slate-900 bg-slate-50 text-slate-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
          >
            <span>{value === "en" ? t("English") : "中文"}</span>
            <span className="text-xs text-slate-500">{locale === value ? t("Selected") : ""}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <p className="mt-4 text-sm text-slate-600">{t("Client drafts use this language by default. You can choose a different language when preparing each draft.")}</p>
    </SettingsSection>
  );
}
