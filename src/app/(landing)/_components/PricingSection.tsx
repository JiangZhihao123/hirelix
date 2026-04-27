import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BILLING_PLANS, CONTACT_PACK, SEARCH_PACK } from "@/lib/billing";
import type { User } from "@supabase/supabase-js";

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
    <section id="pricing" className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Pricing
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Start free. Upgrade when sourcing volume justifies it.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            One high-conviction shortlist per month on Free. Upgrade for weekly throughput, CSV exports, and outreach drafts.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-800">
              Built for recruiters and search firms
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700">
              Self-serve signup and billing
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
              No credit card required
            </span>
          </div>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {Object.values(BILLING_PLANS).map((plan) => {
            const isAnnual = plan.code === "pro_annual";
            return (
              <div
                key={plan.code}
                className={`relative flex flex-col rounded-3xl border p-7 transition-all ${
                  plan.featured
                    ? "border-amber-300 bg-[linear-gradient(180deg,#fff7df_0%,#fff2c7_100%)] shadow-[0_24px_80px_rgba(251,191,36,0.18)] lg:scale-[1.02]"
                    : "border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_45px_rgba(14,165,233,0.12)]"
                }`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-950 shadow-[0_8px_20px_rgba(251,191,36,0.36)]">
                    Most popular
                  </span>
                )}
                {isAnnual && annualSavingsPercent > 0 && (
                  <span className="absolute -top-3 right-5 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_8px_20px_rgba(16,185,129,0.32)]">
                    Save {annualSavingsPercent}%
                  </span>
                )}

                <div>
                  <p className="text-lg font-semibold text-slate-950">{plan.name}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{plan.description}</p>
                </div>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold tracking-tight text-slate-950">{plan.priceLabel}</span>
                  {plan.priceCents > 0 && (
                    <span className="text-sm font-medium text-slate-500">/mo</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">{plan.cadenceLabel}</p>

                <ul className="mt-7 space-y-2.5 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    <span>
                      <strong className="text-slate-950">{plan.searchesPerMonth}</strong>{" "}
                      {plan.searchesPerMonth === 1 ? "search" : "searches"} each month
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    <span>
                      <strong className="text-slate-950">{plan.candidateLimitPerSearch}</strong>{" "}
                      candidates per search
                    </span>
                  </li>
                  {plan.enrichesPerMonth > 0 && (
                    <li className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>
                        <strong className="text-slate-950">{plan.enrichesPerMonth}</strong> email +
                        draft {plan.enrichesPerMonth === 1 ? "enrich" : "enriches"}
                      </span>
                    </li>
                  )}
                  {plan.exportEnabled && (
                    <li className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>CSV export included</span>
                    </li>
                  )}
                </ul>

                <div className="mt-auto pt-7">
                  {user ? (
                    <Link
                      href="/app/settings#billing"
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                        plan.featured
                          ? "bg-amber-400 text-slate-950 shadow-[0_8px_24px_rgba(251,191,36,0.32)] hover:bg-amber-300"
                          : "border border-slate-200 bg-slate-50 text-slate-950 hover:border-sky-300 hover:bg-white"
                      }`}
                    >
                      Open billing
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignIn}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                        plan.featured
                          ? "bg-amber-400 text-slate-950 shadow-[0_8px_24px_rgba(251,191,36,0.32)] hover:bg-amber-300"
                          : "border border-slate-200 bg-slate-50 text-slate-950 hover:border-sky-300 hover:bg-white"
                      }`}
                    >
                      Sign in to choose plan
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{SEARCH_PACK.name}</p>
              <span className="text-base font-bold text-slate-950">{SEARCH_PACK.priceLabel}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {SEARCH_PACK.credits} extra searches for heavy months. One-time pack.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{CONTACT_PACK.name}</p>
              <span className="text-base font-bold text-slate-950">{CONTACT_PACK.priceLabel}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {CONTACT_PACK.credits} extra email + draft enriches. One-time pack.
            </p>
          </div>
        </div>

        <details className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.06)] open:bg-slate-50">
          <summary className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-950">
            <ShieldCheck className="h-5 w-5 shrink-0 text-sky-600" />
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
