"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SettingsPageSkeleton } from "@/components/ProductSkeletons";
import { getPlanStatusCopy, type BillingSummary } from "@/lib/billing";
import { fetchWithUserSession } from "@/lib/client-auth";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromBrowser,
  trackEvent,
} from "@/lib/analytics";
import { useBilling } from "@/lib/use-billing";
import { AccountSection } from "./_components/AccountSection";
import { BillingPanel } from "./_components/BillingPanel";
import { RecruiterProfileSection } from "./_components/RecruiterProfileSection";
import { EMPTY_PROFILE, type HeadhunterProfile, type SettingsSectionId } from "./_components/shared";

export default function SettingsPage() {
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
  const sectionNav = [
    {
      id: "account" as const,
      label: "Account",
      detail: "Sign-in with Google",
    },
    {
      id: "billing" as const,
      label: "Billing",
      detail: billing ? getPlanStatusCopy(billing).title : "Plan and usage",
    },
    {
      id: "profile" as const,
      label: "Outreach identity",
      detail: headhunterProfile.recruiter_name || "Recruiter details",
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
    if (searchParams.get("checkout") === "success") {
      trackEvent(ANALYTICS_EVENTS.checkoutSuccess, {
        ...getAnalyticsContextFromBrowser(),
      });
      fetchSettings();
    }
  }, [fetchSettings, searchParams]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    if (settingsHash !== "account" && settingsHash !== "billing" && settingsHash !== "profile") {
      return;
    }

    setActiveSection(settingsHash);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [settingsHash]);

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
        <BillingPanel billing={billing} />
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

    return <AccountSection user={user} />;
  })();

  if (loading) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Manage account access, billing capacity, and the outreach identity used in candidate messages.
          </p>
        </div>
        {billing ? (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm shadow-slate-200/30">
            <span className="font-medium text-slate-950">{getPlanStatusCopy(billing).title}</span>
            <span className="ml-2 text-slate-500">{getPlanStatusCopy(billing).usageLabel}</span>
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
