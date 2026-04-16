"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
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
  const [loading, setLoading] = useState(true);
  const [headhunterProfile, setHeadhunterProfile] = useState<HeadhunterProfile>(EMPTY_PROFILE);
  const [billing, setBilling] = useState<BillingSummary | null>(sharedBilling);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("account");
  const isProgrammaticNavRef = useRef(false);
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
    const syncActiveSection = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "account" || hash === "billing" || hash === "profile") {
        setActiveSection(hash);
      }
    };

    syncActiveSection();
    window.addEventListener("hashchange", syncActiveSection);
    return () => window.removeEventListener("hashchange", syncActiveSection);
  }, []);

  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash.replace("#", "");
    if (hash !== "account" && hash !== "billing" && hash !== "profile") return;

    const section = document.getElementById(hash);
    if (!section) return;

    requestAnimationFrame(() => {
      section.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    const sections = ["account", "billing", "profile"]
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticNavRef.current) return;

        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        const next = visibleEntries[0]?.target.id as SettingsSectionId | undefined;
        if (!next || next === activeSection) return;

        setActiveSection(next);
      },
      {
        rootMargin: "-18% 0px -55% 0px",
        threshold: [0.15, 0.35, 0.6],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [activeSection, loading]);

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
            <Link
              key={item.id}
              href={`#${item.id}`}
              onClick={() => setActiveSection(item.id)}
              className={`inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
              }`}
            >
              {item.label}
            </Link>
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
                  <Link
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => {
                      isProgrammaticNavRef.current = true;
                      setActiveSection(item.id);
                      window.setTimeout(() => {
                        isProgrammaticNavRef.current = false;
                      }, 450);
                    }}
                    className={`block border-l-2 py-2 pl-3 pr-2 transition-colors ${
                      isActive
                        ? "border-primary text-slate-950"
                        : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950"
                    }`}
                  >
                    <p className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>

        <div className="space-y-8">
          <AccountSection
            user={user}
            hasPasswordLogin={hasPasswordLogin}
            onPasswordUpdated={() => void refreshBilling()}
          />

          {billing && <BillingPanel billing={billing} />}

          <RecruiterProfileSection
            initialProfile={headhunterProfile}
            onNameChange={(name) =>
              setHeadhunterProfile((prev) => ({ ...prev, recruiter_name: name }))
            }
            refreshBilling={refreshBilling}
          />
        </div>
      </div>
    </div>
  );
}
