import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { BILLING_PLANS, CONTACT_PACK, SEARCH_PACK } from "@/lib/billing";
import type { User } from "@supabase/supabase-js";

const planCtaLabels = {
  free: "Start free",
  pro_monthly: "Start monthly",
  pro_annual: "Start annual",
} as const;

export function PricingSection({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  // Compute monthly-equivalent savings between Pro Monthly and Pro Annual.
  // pro_monthly.priceCents is per month; pro_annual.priceCents is per year.
  const monthlyPlan = BILLING_PLANS.pro_monthly;
  const annualPlan = BILLING_PLANS.pro_annual;
  const annualMonthlyEquivalent = annualPlan ? annualPlan.priceCents / 12 : 0;
  const annualSavingsPercent =
    monthlyPlan && annualPlan && monthlyPlan.priceCents > 0
      ? Math.round(((monthlyPlan.priceCents - annualMonthlyEquivalent) / monthlyPlan.priceCents) * 100)
      : 0;

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-slate-200 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Pricing
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Simple pricing for ranked sourcing runs.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Run your first shortlist free. Upgrade when you need more searches, contact enrichment,
            exports, and outreach drafts.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1 font-semibold text-blue-700">
              Annual saves {annualSavingsPercent}%
            </span>
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              No credit card to start
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
              Cancel anytime
            </span>
          </div>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3 lg:items-stretch">
          {Object.values(BILLING_PLANS).map((plan) => {
            const isAnnual = plan.code === "pro_annual";
            const isMonthly = plan.code === "pro_monthly";
            const isFree = plan.code === "free";
            const isRecommended = isAnnual;
            return (
              <div
                key={plan.code}
                className={`relative flex flex-col rounded-lg border p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all ${
                  isRecommended
                    ? "border-blue-300 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_42%)] ring-1 ring-blue-100 lg:-mt-3 lg:mb-3"
                    : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_50px_rgba(37,99,235,0.11)]"
                }`}
              >
                {isRecommended && (
                  <span className="absolute -top-3 left-5 rounded-lg bg-blue-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)]">
                    Best value
                  </span>
                )}
                {isAnnual && annualSavingsPercent > 0 ? (
                  <span className="absolute -top-3 right-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Save {annualSavingsPercent}%
                  </span>
                ) : null}

                {isMonthly ? (
                  <span className="absolute -top-3 right-5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                    Flexible
                  </span>
                ) : null}

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{plan.name}</p>
                    <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                      {plan.description}
                    </p>
                  </div>
                  {isFree ? (
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Free
                    </span>
                  ) : null}
                </div>

                <div className="mt-6 flex items-end gap-1.5">
                  <span className="text-5xl font-bold tracking-tight text-slate-950">
                    {plan.priceLabel}
                  </span>
                  {plan.priceCents > 0 ? (
                    <span className="pb-1.5 text-sm font-semibold text-slate-500">/mo</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{plan.cadenceLabel}</p>

                {isAnnual ? (
                  <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                    Billed ${Math.round(plan.priceCents / 100).toLocaleString()} annually.
                  </p>
                ) : null}

                <ul className="mt-7 space-y-3 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      <strong className="text-slate-950">{plan.searchesPerMonth}</strong>{" "}
                      {plan.searchesPerMonth === 1 ? "ranked search" : "ranked searches"} / month
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      <strong className="text-slate-950">{plan.candidateLimitPerSearch}</strong>{" "}
                      candidates per shortlist
                    </span>
                  </li>
                  {plan.enrichesPerMonth > 0 ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        <strong className="text-slate-950">{plan.enrichesPerMonth}</strong>{" "}
                        email + outreach draft enriches / month
                      </span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-slate-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                      <span>Upgrade for contact enrichment and outreach drafts</span>
                    </li>
                  )}
                  {plan.exportEnabled ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>CSV export included</span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-slate-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                      <span>Upgrade for CSV export</span>
                    </li>
                  )}
                </ul>

                <div className="mt-auto pt-7">
                  {user ? (
                    <Link
                      href="/app/settings#billing"
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all ${
                        isRecommended
                          ? "bg-blue-600 text-white shadow-[0_14px_32px_rgba(37,99,235,0.24)] hover:bg-blue-700"
                          : "border border-slate-200 bg-slate-50 text-slate-950 hover:border-blue-300 hover:bg-white"
                      }`}
                    >
                      Open billing
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignIn}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all ${
                        isRecommended
                          ? "bg-blue-600 text-white shadow-[0_14px_32px_rgba(37,99,235,0.24)] hover:bg-blue-700"
                          : "border border-slate-200 bg-slate-50 text-slate-950 hover:border-blue-300 hover:bg-white"
                      }`}
                    >
                      {planCtaLabels[plan.code]}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-950">Need more in a heavy month?</p>
              <p className="mt-1 text-sm text-slate-600">
                Add one-time credits without changing your subscription.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{SEARCH_PACK.name}</p>
                <span className="text-base font-bold text-slate-950">{SEARCH_PACK.priceLabel}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {SEARCH_PACK.credits} extra searches for heavier sourcing weeks.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{CONTACT_PACK.name}</p>
                <span className="text-base font-bold text-slate-950">
                  {CONTACT_PACK.priceLabel}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {CONTACT_PACK.credits} extra email + outreach draft enriches.
              </p>
            </div>
          </div>
        </div>

        <details className="mt-6 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.06)] open:bg-slate-50">
          <summary className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-950">
            <ShieldCheck className="h-5 w-5 shrink-0 text-blue-600" />
            <span>Billing terms, refunds, and cancellation</span>
            <span className="ml-auto text-xs text-slate-500">Click to expand</span>
          </summary>
          <div className="mt-4 space-y-2 pl-8 leading-7">
            <p>Hirelix is available today for recruiters, search firms, and hiring teams.</p>
            <p>Subscriptions renew automatically until canceled.</p>
            <p>Cancel anytime from billing settings or by emailing support@hirelix.online.</p>
            <p>Purchases made through Paddle are refundable within 14 days of the transaction date.</p>
            <p>For subscriptions, refunds are available within 14 days of the initial purchase or the most recent renewal.</p>
            <p>Taxes may apply depending on the customer location.</p>
          </div>
        </details>
      </div>
    </section>
  );
}
