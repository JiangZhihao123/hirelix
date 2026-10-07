"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SettingsPageSkeleton } from "@/components/ProductSkeletons";
import { type BillingSummary } from "@/lib/billing";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useBilling } from "@/lib/use-billing";
import { useT } from "@/components/LanguageProvider";
import { AccountSection } from "./_components/AccountSection";
import { BillingPanel } from "./_components/BillingPanel";
import { RecruiterProfileSection } from "./_components/RecruiterProfileSection";
import { EMPTY_PROFILE, type HeadhunterProfile, type SettingsSectionId } from "./_components/shared";

const SETTINGS_SECTION_IDS = ["account", "billing", "profile"] as const satisfies readonly SettingsSectionId[];

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSectionId);
}

export default function SettingsPage() {
  const t = useT();
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
    },
    {
      id: "billing" as const,
      label: t("Billing"),
    },
    {
      id: "profile" as const,
      label: t("Outreach identity"),
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
    <div className="ws-settings-page">
      <header className="ws-page-header"><div><h1>{t("Settings")}</h1><p>{t("Manage your login, plan, usage, and outreach identity.")}</p></div></header>
      <nav className="ws-tabs ws-settings-tabs" aria-label={t("Settings")}>
        {sectionNav.map((item) => (
          <button key={item.id} type="button" aria-current={activeSection === item.id ? "page" : undefined} onClick={() => selectSection(item.id)}>{item.label}</button>
        ))}
      </nav>
      <div className="ws-settings-content">{selectedSection}</div>
    </div>
  );
}
