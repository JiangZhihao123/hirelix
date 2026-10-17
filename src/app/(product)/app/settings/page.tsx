"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SettingsPageSkeleton } from "@/components/ProductSkeletons";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useBilling } from "@/lib/use-billing";
import { useT } from "@/components/LanguageProvider";
import { MailboxConnections } from "@/components/workspace/mailbox-connections";
import { AccountSection } from "./_components/AccountSection";
import { BillingPanel } from "./_components/BillingPanel";
import { type SettingsSectionId } from "./_components/shared";

const SETTINGS_SECTION_IDS = ["account", "billing"] as const satisfies readonly SettingsSectionId[];

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSectionId);
}

export default function SettingsPage() {
  const t = useT();
  const { user } = useAuth();
  const { billing, refresh: refreshBilling } = useBilling();
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
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    searchParams.get("section") === "billing" ? "billing" : "account",
  );
  const settingsRequest = useRef<Promise<void> | null>(null);
  const [signInMethods, setSignInMethods] = useState<string[]>([]);
  const sectionNav = [
    {
      id: "account" as const,
      label: t("Account"),
    },
    {
      id: "billing" as const,
      label: t("Subscription and usage"),
    },
  ];

  const fetchSettings = useCallback(async () => {
    if (!user?.id) return;
    if (settingsRequest.current) return settingsRequest.current;
    const request = (async () => {
      try {
        const res = await fetchWithUserSession("/api/settings");
        if (res.ok) {
          const data = await res.json();
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
        settingsRequest.current = null;
      }
    })();
    settingsRequest.current = request;
    return request;
  }, [user?.id]);

  useEffect(() => {
    if (activeSection === "account" && loading) void fetchSettings();
  }, [fetchSettings, activeSection, loading]);

  useEffect(() => {
    if (!["success", "pending"].includes(searchParams.get("checkout") || "")) return;
    // A redirect is not proof of payment; refresh until the signed webhook updates access.
    const timers = [0, 3000, 8000, 15000, 30000].map((delay) => window.setTimeout(() => {
      void refreshBilling();
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [refreshBilling, searchParams]);

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
          onBillingChange={() => {
            void refreshBilling();
          }}
        />
      ) : (
        <SettingsPageSkeleton />
      );
    }

    return (
      <>
      <MailboxConnections oauthError={searchParams.get("error")} />
              <AccountSection
        signInMethods={signInMethods}
        onPasswordSet={() => {
          setSignInMethods((prev) =>
            prev.includes("credential") ? prev : [...prev, "credential"],
          );
          void fetchSettings();
        }}
      />
      </>
    );
  })();

  if (loading && activeSection === "account") {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="ws-settings-page">
      <header className="ws-page-header"><div><h1>{t("Settings")}</h1><p>{t("Manage your login, subscription, and AI usage.")}</p></div></header>
      <nav className="ws-tabs ws-settings-tabs" aria-label={t("Settings")}>
        {sectionNav.map((item) => (
          <button key={item.id} type="button" aria-current={activeSection === item.id ? "page" : undefined} onClick={() => selectSection(item.id)}>{item.label}</button>
        ))}
      </nav>
      <div className="ws-settings-content">{selectedSection}</div>
    </div>
  );
}
