"use client";

import { useState } from "react";
import { CheckCircle2, Mail, ScanSearch, Sparkles } from "lucide-react";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  BILLING_PLANS,
  getPlanEmailLookupsPerMonth,
  getPlanProfileScansPerMonth,
  getPlanPublicEvidenceDeepDivesPerMonth,
  type BillingPlanCode,
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

type PaidBillingPlanCode = Exclude<BillingPlanCode, "free">;

export function BillingPanel({ billing }: { billing: BillingSummary }) {
  const [billingMessage, setBillingMessage] = useState<MessageState>(null);
  const subscriptionTiers = [
    {
      key: "starter",
      annualPlanCode: "starter_annual",
      monthlyPlanCode: "starter_monthly",
      note: "For a few active client roles.",
    },
    {
      key: "pro",
      annualPlanCode: "pro_annual",
      monthlyPlanCode: "pro_monthly",
      note: "For a larger client-role desk.",
    },
  ] satisfies Array<{
    key: string;
    annualPlanCode: PaidBillingPlanCode;
    monthlyPlanCode: PaidBillingPlanCode;
    note: string;
  }>;

  function isCurrentPlan(planCode: PaidBillingPlanCode) {
    return billing.subscription.planCode === planCode;
  }

  function isCurrentTier(annualPlanCode: PaidBillingPlanCode, monthlyPlanCode: PaidBillingPlanCode) {
    return isCurrentPlan(annualPlanCode) || isCurrentPlan(monthlyPlanCode);
  }

  return (
    <SettingsSection
      id="billing"
      eyebrow="Billing"
      title="Billing and usage"
      description="Usage is based on targeted profiles sourced for each role, then email lookup and public evidence when you need them."
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
          description="Track this billing cycle across the work that creates real product cost."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <ScanSearch className="h-4 w-4 text-slate-400" />
                  Targeted profile scans
                </span>
                <span className="text-slate-500">
                  {billing.usage.profileScansUsed}/{billing.usage.profileScansLimit}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{
                    width: getUsageWidth(billing.usage.profileScansUsed, billing.usage.profileScansLimit),
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {billing.usage.profileScansRemaining} targeted scans left this cycle
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <Mail className="h-4 w-4 text-slate-400" />
                  Email lookups
                </span>
                <span className="text-slate-500">
                  {billing.usage.emailLookupsUsed}/{billing.usage.emailLookupsLimit}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{
                    width: getUsageWidth(billing.usage.emailLookupsUsed, billing.usage.emailLookupsLimit),
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {billing.usage.emailLookupsRemaining} lookups left this cycle
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <Sparkles className="h-4 w-4 text-slate-400" />
                  Evidence deep dives
                </span>
                <span className="text-slate-500">
                  {billing.usage.publicEvidenceDeepDivesUsed}/{billing.usage.publicEvidenceDeepDivesLimit}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{
                    width: getUsageWidth(
                      billing.usage.publicEvidenceDeepDivesUsed,
                      billing.usage.publicEvidenceDeepDivesLimit,
                    ),
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {billing.usage.publicEvidenceDeepDivesRemaining} deep dives left this cycle
              </p>
            </div>
          </div>
        </SettingsFieldGroup>

        <SettingsFieldGroup
          title="Subscription"
          description="Choose a client-role tier. Annual gives you the lower monthly rate."
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
            {subscriptionTiers.map((tier) => {
              const plan = BILLING_PLANS[tier.annualPlanCode];
              const monthlyPlan = BILLING_PLANS[tier.monthlyPlanCode];
              const annualPlanCode = tier.annualPlanCode;
              const monthlyPlanCode = tier.monthlyPlanCode;
              const tierIsCurrent = isCurrentTier(annualPlanCode, monthlyPlanCode);
              const profileScans = getPlanProfileScansPerMonth(plan).toLocaleString("en-US");
              const emailLookups = getPlanEmailLookupsPerMonth(plan).toLocaleString("en-US");
              const evidenceDeepDives = getPlanPublicEvidenceDeepDivesPerMonth(plan).toLocaleString("en-US");

              return (
                <div
                  key={tier.key}
                  className={`rounded-lg border p-4 ${
                    plan.featured
                      ? "border-primary/25 bg-primary/5"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">{plan.name}</h3>
                      <p className="mt-1 text-xs text-slate-600">{tier.note}</p>
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
                    <p className="mt-1 text-xs text-slate-500">
                      Or {monthlyPlan.priceLabel} month to month
                    </p>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                    {[
                      `${plan.searchesPerMonth} client roles per month`,
                      `${profileScans} targeted profile scans per month`,
                      "500 scans in each default discovery pass",
                      "Expand any candidate pool with remaining scans",
                      `${emailLookups} contact lookups per month`,
                      `${evidenceDeepDives} public evidence deep dives per month`,
                      "CSV export and client-ready briefs",
                    ].map((item) => (
                      <p key={item} className="inline-flex items-start gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </p>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <PlanCheckoutAction
                      planCode={annualPlanCode}
                      label={isCurrentPlan(annualPlanCode) ? "Current annual" : plan.ctaLabel}
                      isCurrent={isCurrentPlan(annualPlanCode)}
                      onError={(message) => setBillingMessage({ type: "error", text: message })}
                      primary={!tierIsCurrent || isCurrentPlan(annualPlanCode)}
                    />
                    <PlanCheckoutAction
                      planCode={monthlyPlanCode}
                      label={isCurrentPlan(monthlyPlanCode) ? "Current monthly" : monthlyPlan.ctaLabel}
                      isCurrent={isCurrentPlan(monthlyPlanCode)}
                      onError={(message) => setBillingMessage({ type: "error", text: message })}
                      primary={isCurrentPlan(monthlyPlanCode)}
                    />
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

function PlanCheckoutAction({
  planCode,
  label,
  isCurrent,
  onError,
  primary,
}: {
  planCode: Exclude<BillingPlanCode, "free">;
  label: string;
  isCurrent: boolean;
  onError: (message: string) => void;
  primary: boolean;
}) {
  if (isCurrent) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-500"
      >
        {label}
      </button>
    );
  }

  return (
    <PaddleCheckoutButton
      checkout={{
        type: "plan",
        planCode,
      }}
      label={label}
      onError={onError}
      className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-primary text-white hover:bg-primary-hover"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    />
  );
}
