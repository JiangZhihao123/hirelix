"use client";

import { useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  BILLING_PLANS,
  CUSTOMER_BILLING_PLAN_CODES,
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
      description="Your first complete shortlist is free. Continue with a monthly or annual subscription."
    >
      <div className="space-y-5">
        <SettingsFieldGroup
          title="Current plan"
          description="This is the active plan and renewal state for your account."
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
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
          description="Track this billing cycle and whether the full product is unlocked."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <Search className="h-4 w-4 text-slate-400" />
                  Shortlist builds
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
                {billing.usage.searchesRemaining} shortlist builds left this cycle
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-sm font-medium text-slate-800">Product access</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">
                {billing.plan.code === "free" ? "Trial" : "Unlocked"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {billing.plan.code === "free"
                  ? "One complete 25-candidate shortlist is included, with email lookup available when needed."
                  : "25-candidate shortlists, email lookup, export, outreach, and briefs are included."}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-sm font-medium text-slate-800">Candidate package</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">
                {billing.usage.candidateLimitPerSearch}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                candidates per completed shortlist.
              </p>
            </div>
          </div>
        </SettingsFieldGroup>

        <SettingsFieldGroup
          title="Subscription"
          description="Two choices, same benefits. Annual just gives you the lower rate."
        >
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Hirelix is built for technical headhunters. For billing issues, missing credits, or shortlist problems, email{" "}
            <a
              className="font-medium underline decoration-amber-400 underline-offset-2"
              href="mailto:support@hirelix.online"
            >
              support@hirelix.online
            </a>
            .
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {CUSTOMER_BILLING_PLAN_CODES.map((planCode) => {
              const plan = BILLING_PLANS[planCode];
              const isCurrent = billing.subscription.planCode === plan.code;

              return (
                <div
                  key={plan.code}
                  className={`rounded-lg border p-4 ${
                    plan.featured
                      ? "border-primary/25 bg-primary/5"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">{plan.name}</h3>
                      <p className="mt-1 text-xs text-slate-600">{plan.description}</p>
                    </div>
                    {plan.featured ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Popular
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <p className="text-xl font-bold text-slate-950">{plan.priceLabel}</p>
                    <p className="text-xs text-slate-500">{plan.cadenceLabel}</p>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                    {[
                      `${plan.searchesPerMonth} shortlist builds per month`,
                      `Final ${plan.candidateLimitPerSearch}-candidate shortlist every time`,
                      "Email lookup, export, outreach, and client-ready briefs included",
                      "Same product access as every paid plan",
                    ].map((item) => (
                      <p key={item} className="inline-flex items-start gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </p>
                    ))}
                  </div>

                  <div className="mt-5">
                    {isCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-500"
                      >
                        Current plan
                      </button>
                    ) : (
                      <PaddleCheckoutButton
                        checkout={{
                          type: "plan",
                          planCode: plan.code as Exclude<import("@/lib/billing").BillingPlanCode, "free">,
                        }}
                        label={plan.ctaLabel}
                        onError={(message) =>
                          setBillingMessage({ type: "error", text: message })
                        }
                        className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsFieldGroup>

        <MessageBanner message={billingMessage} />
      </div>
    </SettingsSection>
  );
}
