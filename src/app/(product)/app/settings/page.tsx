"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SettingsPageSkeleton } from "@/components/ProductSkeletons";
import { getPlanStatusCopy, type BillingSummary } from "@/lib/billing";
import { useBilling } from "@/lib/use-billing";
import { AccountSection } from "./_components/AccountSection";
import { BillingPanel } from "./_components/BillingPanel";
import { RecruiterProfileSection } from "./_components/RecruiterProfileSection";
import { EMPTY_PROFILE, type HeadhunterProfile, type SettingsSectionId } from "./_components/shared";

export default function SettingsPage() {
  const { session, user } = useAuth();
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
  const hasPasswordLogin = user?.user_metadata?.password_login_enabled === true;

  const sectionNav = [
    {
      id: "account" as const,
      label: "Account",
      detail: hasPasswordLogin ? "Password enabled" : "Password optional",
    },
    {
      id: "billing" as const,
      label: "Billing",
      detail: billing ? getPlanStatusCopy(billing).title : "Plan details",
    },
    {
      id: "profile" as const,
      label: "Profile",
      detail: headhunterProfile.recruiter_name || "Profile details",
    },
  ];

  const fetchSettings = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
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
  }, [session?.access_token]);

  useEffect(() => {
    if (sharedBilling) setBilling(sharedBilling);
  }, [sharedBilling]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
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

    return (
      <AccountSection
        user={user}
        hasPasswordLogin={hasPasswordLogin}
        onPasswordUpdated={() => void refreshBilling()}
      />
    );
  })();

  if (loading) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Settings
        </p>
        <h1 className="mt-2 text-[32px] font-bold tracking-tight text-slate-950">
          Manage your account, billing, and recruiter profile.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Manage login access, this cycle&apos;s limits, and your recruiter profile Hirelix uses for
          personalizing outreach.
        </p>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {sectionNav.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
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

      <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <nav className="sticky top-8">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Sections
            </p>
            <div className="space-y-1">
              {sectionNav.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSection(item.id)}
                    className={`block w-full border-l-2 py-2 pl-3 pr-2 text-left transition-colors ${
                      isActive
                        ? "border-primary text-slate-950"
                        : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950"
                    }`}
                    >
                      <p className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
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
