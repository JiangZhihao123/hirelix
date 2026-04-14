"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Download, Loader2, Lock, Mail, Search } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import { SettingsPageSkeleton } from "@/components/ProductSkeletons";
import { supabase } from "@/lib/supabase";
import {
  BILLING_PLANS,
  CONTACT_PACK,
  SEARCH_PACK,
  getPlanStatusCopy,
  type BillingSummary,
} from "@/lib/billing";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useBilling } from "@/lib/use-billing";

interface HeadhunterProfile {
  recruiter_name: string;
  firm_name: string;
  specialization: string;
  bio: string;
}

type MessageState = { type: "success" | "error"; text: string } | null;
type SettingsSectionId = "account" | "billing" | "profile";

const EMPTY_PROFILE: HeadhunterProfile = {
  recruiter_name: "",
  firm_name: "",
  specialization: "",
  bio: "",
};

function SettingsSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: SettingsSectionId;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white">
      <div className="border-b border-slate-200/80 px-6 py-4 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
      <div className="px-6 py-4 sm:px-7">{children}</div>
    </section>
  );
}

function SettingsFieldGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-slate-200/80 pt-5 first:border-t-0 first:pt-0">
      <div className="max-w-2xl">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MessageBanner({ message }: { message: MessageState }) {
  if (!message) return null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        message.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {message.text}
    </div>
  );
}

function formatDateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getUsageWidth(used: number, limit: number) {
  return `${Math.min((used / Math.max(limit, 1)) * 100, 100)}%`;
}

export default function SettingsPage() {
  const { session, user } = useAuth();
  const { billing: sharedBilling, refresh: refreshBilling } = useBilling();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [headhunterProfile, setHeadhunterProfile] = useState<HeadhunterProfile>(EMPTY_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<MessageState>(null);
  const [billingMessage, setBillingMessage] = useState<MessageState>(null);
  const [passwordMessage, setPasswordMessage] = useState<MessageState>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [billing, setBilling] = useState<BillingSummary | null>(sharedBilling);
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
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
    if (sharedBilling) {
      setBilling(sharedBilling);
    }
  }, [sharedBilling]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      setBillingMessage({
        type: "success",
        text: "Checkout completed. Your plan should update as soon as Paddle sends the webhook.",
      });
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
          <SettingsSection
            id="account"
            eyebrow="Account"
            title="Account security"
            description="Use password login only as a durable backup. Google sign-in and email codes remain the recommended default."
          >
            <div className="space-y-5">
              <SettingsFieldGroup
                title="Password login"
                description={
                  hasPasswordLogin
                    ? "Password backup is enabled for this account."
                    : "No password is set yet for this account."
                }
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                            hasPasswordLogin
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {hasPasswordLogin ? "Enabled" : "Not set"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {user?.email || "Unknown email"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {hasPasswordLogin
                          ? "Update it here without affecting Google sign-in or one-time codes."
                          : "Add a password only if you want a backup login method for the same account."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      New password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.password}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, password: e.target.value })
                      }
                      placeholder="At least 8 characters"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          confirmPassword: e.target.value,
                        })
                      }
                      placeholder="Repeat your password"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-xl text-sm text-slate-600">
                    This only changes login access. Billing and company settings stay the same.
                  </p>
                  <button
                    type="button"
                    onClick={handleSavePassword}
                    disabled={savingPassword}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {savingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    {hasPasswordLogin ? "Update password" : "Add password login"}
                  </button>
                </div>
              </SettingsFieldGroup>

              <MessageBanner message={passwordMessage} />
            </div>
          </SettingsSection>

          <SettingsSection
            id="billing"
            eyebrow="Billing"
            title="Billing and usage"
            description="Manage your plan, monitor this cycle's limits, and upgrade only when you actually need more capacity."
          >
            {billing && (
              <div className="space-y-5">
                <SettingsFieldGroup
                  title="Current plan"
                  description="This is the active plan and renewal state for your account."
                >
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                    <div className="space-y-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xl font-semibold text-slate-950">{billing.plan.name}</p>
                          <p className="mt-1 text-sm text-slate-600">{billing.plan.description}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-lg font-semibold text-slate-950">
                            {billing.plan.priceLabel}
                          </p>
                          <p className="text-sm text-slate-500">{billing.plan.cadenceLabel}</p>
                        </div>
                      </div>
                      <div className="grid gap-4 border-t border-slate-200/80 pt-4 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Subscription
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-950">
                            {billing.subscription.status === "active"
                              ? "Subscription active"
                              : billing.subscription.status}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Renewal
                          </p>
                          <p className="mt-2 text-sm text-slate-600">
                            {formatDateLabel(billing.subscription.renewsAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsFieldGroup>

                <SettingsFieldGroup
                  title="Usage"
                  description="Track the limits that matter for the current billing cycle."
                >
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                          <Search className="h-4 w-4 text-slate-400" />
                          Searches
                        </span>
                        <span className="text-slate-500">
                          {billing.usage.searchesUsed}/{billing.usage.searchesLimit}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{
                            width: getUsageWidth(
                              billing.usage.searchesUsed,
                              billing.usage.searchesLimit,
                            ),
                          }}
                        />
                      </div>
                      <p className="mt-3 text-sm text-slate-600">
                        {billing.usage.searchesRemaining} searches left this cycle
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                          <Mail className="h-4 w-4 text-slate-400" />
                          Contact enriches
                        </span>
                        <span className="text-slate-500">
                          {billing.usage.enrichesUsed}/{billing.usage.enrichesLimit}
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-700"
                          style={{
                            width: getUsageWidth(
                              billing.usage.enrichesUsed,
                              billing.usage.enrichesLimit,
                            ),
                          }}
                        />
                      </div>
                      <p className="mt-3 text-sm text-slate-600">
                        {billing.usage.enrichesRemaining} enriches left this cycle
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <p className="text-sm font-medium text-slate-800">Candidate depth</p>
                      <p className="mt-3 text-2xl font-semibold text-slate-950">
                        {billing.usage.candidateLimitPerSearch}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">Candidates per search</p>
                    </div>
                  </div>
                </SettingsFieldGroup>

                <SettingsFieldGroup
                  title="Plans and add-ons"
                  description="Upgrade the base plan or add one-off credits when you need extra capacity."
                >
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Hirelix is built for US technical recruiters and headhunters. For billing issues, missing credits, or shortlist problems, email{" "}
                    <a className="font-medium underline decoration-amber-400 underline-offset-2" href="mailto:support@hirelix.online">
                      support@hirelix.online
                    </a>
                    .
                  </div>
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Plans
                    </p>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-3">
                    {Object.values(BILLING_PLANS).map((plan) => {
                      const isCurrent = billing.subscription.planCode === plan.code;
                      const isPaidPlan = plan.code !== "free";

                      return (
                        <div
                          key={plan.code}
                          className={`rounded-xl border p-5 ${
                            plan.featured
                              ? "border-primary/25 bg-primary/5"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-base font-semibold text-slate-950">{plan.name}</h3>
                              <p className="mt-1 text-sm text-slate-600">{plan.description}</p>
                            </div>
                            {plan.featured ? (
                              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Popular
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-5">
                            <p className="text-2xl font-bold text-slate-950">{plan.priceLabel}</p>
                            <p className="text-xs text-slate-500">{plan.cadenceLabel}</p>
                          </div>

                          <div className="mt-5 space-y-2 text-sm text-slate-600">
                            <p>{plan.searchesPerMonth} {plan.searchesPerMonth === 1 ? "search" : "searches"} / month</p>
                            <p>{plan.candidateLimitPerSearch} candidates / search</p>
                            <p>{plan.enrichesPerMonth} {plan.enrichesPerMonth === 1 ? "contact enrich" : "contact enriches"} / month</p>
                            <p className="inline-flex items-center gap-1.5">
                              <Download className="h-3.5 w-3.5" />
                              {plan.exportEnabled ? "CSV export included" : "CSV export locked"}
                            </p>
                          </div>

                          <div className="mt-5">
                            {!isPaidPlan ? (
                              <button
                                type="button"
                                disabled
                                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-500"
                              >
                                {isCurrent ? "Current plan" : "Free plan"}
                              </button>
                            ) : isCurrent ? (
                              <button
                                type="button"
                                disabled
                                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-500"
                              >
                                Current plan
                              </button>
                            ) : (
                              <PaddleCheckoutButton
                                checkout={{
                                  type: "plan",
                                  planCode: plan.code as "pro_monthly" | "pro_annual",
                                }}
                                label={plan.ctaLabel}
                                onError={(message) =>
                                  setBillingMessage({ type: "error", text: message })
                                }
                                className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Add-ons
                    </p>
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-950">{SEARCH_PACK.name}</p>
                      <p className="mt-1 text-sm text-slate-600">{SEARCH_PACK.description}</p>
                      <p className="mt-4 text-2xl font-semibold text-slate-950">
                        {SEARCH_PACK.priceLabel}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Adds {SEARCH_PACK.credits} searches to this billing period.
                      </p>
                      <div className="mt-5">
                        <PaddleCheckoutButton
                          checkout={{ type: "add_on", addOn: "search_pack" }}
                          label={
                            billing.plan.code === "free"
                              ? "Upgrade plan to buy search pack"
                              : "Buy search pack"
                          }
                          disabled={billing.plan.code === "free"}
                          onError={(message) =>
                            setBillingMessage({ type: "error", text: message })
                          }
                          className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-semibold text-slate-950">{CONTACT_PACK.name}</p>
                      <p className="mt-1 text-sm text-slate-600">{CONTACT_PACK.description}</p>
                      <p className="mt-4 text-2xl font-semibold text-slate-950">
                        {CONTACT_PACK.priceLabel}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Adds {CONTACT_PACK.credits} enriches to this billing period.
                      </p>
                      <div className="mt-5">
                        <PaddleCheckoutButton
                          checkout={{ type: "add_on", addOn: "contact_pack" }}
                          label={
                            billing.plan.code === "free"
                              ? "Upgrade plan to buy contact pack"
                              : "Buy contact pack"
                          }
                          disabled={billing.plan.code === "free"}
                          onError={(message) =>
                            setBillingMessage({ type: "error", text: message })
                          }
                          className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                </SettingsFieldGroup>

                <MessageBanner message={billingMessage} />
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            id="profile"
            eyebrow="Profile"
            title="Recruiter profile"
            description="Your profile as a headhunter. Hirelix uses this to personalize outreach — candidates will see your name and firm, not your client's."
          >
            <div className="space-y-5">
              <SettingsFieldGroup
                title="Identity"
                description="How you present yourself to candidates. Your client's name stays confidential."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={headhunterProfile.recruiter_name}
                      onChange={(e) =>
                        setHeadhunterProfile({ ...headhunterProfile, recruiter_name: e.target.value })
                      }
                      placeholder="e.g. Sarah Chen"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Firm / agency name
                    </label>
                    <input
                      type="text"
                      value={headhunterProfile.firm_name}
                      onChange={(e) =>
                        setHeadhunterProfile({ ...headhunterProfile, firm_name: e.target.value })
                      }
                      placeholder="e.g. Apex Search Partners (optional)"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </SettingsFieldGroup>

              <SettingsFieldGroup
                title="Focus area"
                description="Your recruiting specialization. Helps Hirelix frame outreach from a credible, relevant angle."
              >
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Specialization
                    </label>
                    <input
                      type="text"
                      value={headhunterProfile.specialization}
                      onChange={(e) =>
                        setHeadhunterProfile({ ...headhunterProfile, specialization: e.target.value })
                      }
                      placeholder="e.g. Senior engineering roles at Series A–C startups"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-800">
                      Short bio
                    </label>
                    <textarea
                      value={headhunterProfile.bio}
                      onChange={(e) =>
                        setHeadhunterProfile({ ...headhunterProfile, bio: e.target.value })
                      }
                      placeholder="A sentence or two about your background — used to make outreach feel personal and credible."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </SettingsFieldGroup>

              <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl text-sm text-slate-600">
                  Outreach drafts will sign off with your name. Client company details remain confidential.
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save profile
                </button>
              </div>

              <MessageBanner message={profileMessage} />
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await fetchWithUserSession("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ company_profile: headhunterProfile }),
      });
      if (res.ok) {
        setProfileMessage({ type: "success", text: "Profile saved." });
        void refreshBilling();
      } else {
        const data = await res.json().catch(() => ({}));
        setProfileMessage({
          type: "error",
          text:
            typeof data.error === "string" && data.error.length > 0
              ? data.error
              : "Failed to save profile.",
        });
      }
    } catch {
      setProfileMessage({ type: "error", text: "Network error while saving profile." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSavePassword() {
    if (!user) return;

    if (passwordForm.password.length < 8) {
      setPasswordMessage({ type: "error", text: "Use at least 8 characters for your password." });
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: "error", text: "Your password confirmation does not match." });
      return;
    }

    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.password,
        data: {
          ...user.user_metadata,
          password_login_enabled: true,
        },
      });

      if (error) throw error;

      setPasswordForm({ password: "", confirmPassword: "" });
      setPasswordMessage({
        type: "success",
        text: hasPasswordLogin ? "Password updated." : "Password login added.",
      });
      void refreshBilling();
    } catch (err) {
      setPasswordMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not update your password.",
      });
    } finally {
      setSavingPassword(false);
    }
  }
}
