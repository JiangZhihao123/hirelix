"use client";

import { useState } from "react";
import { Download, Mail, Search } from "lucide-react";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  BILLING_PLANS,
  CONTACT_PACK,
  SEARCH_PACK,
  type BillingSummary,
} from "@/lib/billing";
import {
  formatDateLabel,
  getUsageWidth,
  MessageBanner,
  MessageState,
  SettingsFieldGroup,
  SettingsSection,
} from "./shared";

export function BillingPanel({ billing }: { billing: BillingSummary }) {
  const [billingMessage, setBillingMessage] = useState<MessageState>(null);

  return (
    <SettingsSection
      id="billing"
      eyebrow="Billing"
      title="Billing and usage"
      description="Manage your plan, monitor this cycle's limits, and upgrade only when you actually need more capacity."
    >
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
                    width: getUsageWidth(billing.usage.searchesUsed, billing.usage.searchesLimit),
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
                    width: getUsageWidth(billing.usage.enrichesUsed, billing.usage.enrichesLimit),
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
            Hirelix is built for technical recruiters and headhunters. For billing issues, missing credits, or shortlist problems, email{" "}
            <a
              className="font-medium underline decoration-amber-400 underline-offset-2"
              href="mailto:support@hirelix.online"
            >
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
                    <p>
                      {plan.searchesPerMonth}{" "}
                      {plan.searchesPerMonth === 1 ? "search" : "searches"} / month
                    </p>
                    <p>{plan.candidateLimitPerSearch} candidates / search</p>
                    <p>
                      {plan.enrichesPerMonth}{" "}
                      {plan.enrichesPerMonth === 1 ? "contact enrich" : "contact enriches"} / month
                    </p>
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
                  onError={(message) => setBillingMessage({ type: "error", text: message })}
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
                  onError={(message) => setBillingMessage({ type: "error", text: message })}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </SettingsFieldGroup>

        <MessageBanner message={billingMessage} />
      </div>
    </SettingsSection>
  );
}
