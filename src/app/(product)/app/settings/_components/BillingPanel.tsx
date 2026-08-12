"use client";

import { useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ScanSearch,
  Sparkles,
  TicketCheck,
} from "lucide-react";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import { fetchWithUserSession } from "@/lib/client-auth";
import {
  BILLING_PLANS,
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

export function BillingPanel({
  billing,
  onBillingChange,
}: {
  billing: BillingSummary;
  onBillingChange: (billing: BillingSummary) => void;
}) {
  const [billingMessage, setBillingMessage] = useState<MessageState>(null);
  const isPaddleSubscription = billing.access.source === "paddle";
  const isRedemptionAccess = billing.access.source === "redemption";
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
    return billing.access.source === "paddle" && billing.subscription.planCode === planCode;
  }

  function isCurrentTier(annualPlanCode: PaidBillingPlanCode, monthlyPlanCode: PaidBillingPlanCode) {
    return isCurrentPlan(annualPlanCode) || isCurrentPlan(monthlyPlanCode);
  }

  return (
    <SettingsSection
      id="billing"
      eyebrow="Billing"
      title="Billing and usage"
      description="Usage is based on AI sourcing budget and candidate research runs you choose to start."
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
                    {isRedemptionAccess ? "Beta access" : billing.plan.priceLabel}
                  </p>
                  <p className="text-sm text-slate-500">
                    {isRedemptionAccess ? "No charge" : billing.plan.cadenceLabel}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 border-t border-slate-200/80 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Access
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-950">
                    {isRedemptionAccess
                      ? "Starter beta access"
                      : billing.subscription.status === "active"
                      ? "Subscription active"
                      : billing.subscription.status}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {isRedemptionAccess ? "Ends" : "Renewal"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {formatDateLabel(billing.subscription.renewsAt)}
                  </p>
                </div>
              </div>
              {isRedemptionAccess ? (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                  This 30-day Starter access does not renew automatically.
                </div>
              ) : null}
              {isPaddleSubscription ? (
                <div className="border-t border-slate-200/80 pt-4">
                  {billing.checkout.paddlePortalConfigured ? (
                    <BillingPortalButton
                      onError={(message) => setBillingMessage({ type: "error", text: message })}
                    />
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Billing portal is not configured yet. Email{" "}
                      <a
                        className="font-medium underline decoration-amber-400 underline-offset-2"
                        href="mailto:support@hirelix.online"
                      >
                        support@hirelix.online
                      </a>{" "}
                      for plan changes or invoices.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </SettingsFieldGroup>

        {billing.access.source === "free" ? (
          <RedeemBetaCode
            onSuccess={(nextBilling, message) => {
              onBillingChange(nextBilling);
              setBillingMessage({ type: "success", text: message });
            }}
            onError={(message) => setBillingMessage({ type: "error", text: message })}
          />
        ) : null}

        <SettingsFieldGroup
          title="Usage"
          description="Track this billing cycle across the work that creates real product cost."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <BriefcaseBusiness className="h-4 w-4 text-slate-400" />
                  Client roles
                </span>
                <span className="text-slate-500">
                  {billing.usage.clientRolesUsed}/{billing.usage.clientRolesLimit}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{
                    width: getUsageWidth(billing.usage.clientRolesUsed, billing.usage.clientRolesLimit),
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {billing.usage.clientRolesRemaining} client roles left this cycle
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <ScanSearch className="h-4 w-4 text-slate-400" />
                  Targeted profile scan budget
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
                  <Sparkles className="h-4 w-4 text-slate-400" />
                  Candidate research
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
                {billing.usage.publicEvidenceDeepDivesRemaining} research runs left this cycle
              </p>
            </div>
          </div>
        </SettingsFieldGroup>

        <SettingsFieldGroup
          title="Subscription"
          description="Choose a client-role tier. Annual gives you the lower monthly rate."
        >
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Hirelix is built for technical headhunters. For billing issues, missing credits, or candidate pool problems, email{" "}
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
                      `${profileScans} targeted profile scan budget per month`,
                      "AI can split scans across sourcing angles",
                      "Useful profiles are deduped and ranked",
                      "LinkedIn outreach drafts for recommended candidates",
                      `${evidenceDeepDives} candidate research runs per month`,
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

function RedeemBetaCode({
  onSuccess,
  onError,
}: {
  onSuccess: (billing: BillingSummary, message: string) => void;
  onError: (message: string) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function redeem() {
    setLoading(true);
    try {
      const response = await fetchWithUserSession("/api/billing/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({})) as {
        billing?: BillingSummary;
        endsAt?: unknown;
        error?: unknown;
      };
      if (!response.ok || !data.billing) {
        onError(typeof data.error === "string" ? data.error : "Unable to redeem this beta code.");
        return;
      }
      setCode("");
      onSuccess(
        data.billing,
        `Starter beta access is active until ${formatDateLabel(
          typeof data.endsAt === "string" ? data.endsAt : data.billing.access.expiresAt,
        )}. It will not renew automatically.`,
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to redeem this beta code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsFieldGroup
      title="Redeem beta access"
      description="Use a private beta code to unlock Starter for 30 days. No card required."
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
        <label htmlFor="beta-redemption-code" className="text-sm font-medium text-slate-900">
          Beta code
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="beta-redemption-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="HIRELIX-BETA-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <button
            type="button"
            onClick={redeem}
            disabled={loading || code.trim().length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TicketCheck className="h-4 w-4" />}
            {loading ? "Redeeming..." : "Redeem"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          One redemption per account. Access ends automatically after 30 days.
        </p>
      </div>
    </SettingsFieldGroup>
  );
}

function BillingPortalButton({ onError }: { onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const response = await fetchWithUserSession("/api/billing", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({})) as {
        portalUrl?: unknown;
        error?: unknown;
      };

      if (!response.ok) {
        onError(
          typeof data.error === "string" && data.error
            ? data.error
            : "Unable to open the billing portal.",
        );
        return;
      }

      if (typeof data.portalUrl !== "string" || !data.portalUrl) {
        onError("Billing portal did not return a URL.");
        return;
      }

      window.location.assign(data.portalUrl);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to open the billing portal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openPortal}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening billing...
        </>
      ) : (
        <>
          <ExternalLink className="h-4 w-4" />
          Manage billing
        </>
      )}
    </button>
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
