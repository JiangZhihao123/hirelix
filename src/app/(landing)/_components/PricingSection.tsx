import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { BILLING_PLANS, CONTACT_PACK, SEARCH_PACK } from "@/lib/billing";
import type { User } from "@supabase/supabase-js";

// Show these plans on the landing page (Pro Annual featured, Pro Monthly in settings only).
const SHOWCASE_PLANS = ["free", "pro_annual", "business_monthly", "agency_monthly"] as const;

const planCtaLabels: Record<string, string> = {
  free: "Start free",
  pro_annual: "Start annual",
  business_monthly: "Start Business",
  agency_monthly: "Contact us",
};

const shortlistCopy: Record<string, string> = {
  free: "Qualified candidates ranked by fit",
  pro_annual: "Qualified candidates ranked by fit and outreach priority",
  business_monthly: "Higher volume, team workspace, priority support",
  agency_monthly: "Unlimited sourcing, API access, white-label export",
};

export function PricingSection({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  const proAnnual = BILLING_PLANS.pro_annual;
  const proMonthly = BILLING_PLANS.pro_monthly;
  const annualMonthlyEquivalent = proAnnual ? proAnnual.priceCents / 12 : 0;
  const annualSavingsPercent =
    proMonthly && proAnnual && proMonthly.priceCents > 0
      ? Math.round(((proMonthly.priceCents - annualMonthlyEquivalent) / proMonthly.priceCents) * 100)
      : 0;

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-slate-200 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Pricing
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Start free. Upgrade when sourcing gets busy.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Run your first two searches without a credit card. Paid plans add more searches,
            contact unlocks, exports, and outreach drafts.
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

        <div className="mt-14 grid gap-5 lg:grid-cols-4 lg:items-stretch">
          {SHOWCASE_PLANS.map((code) => {
            const plan = BILLING_PLANS[code];
            const isProAnnual = plan.code === "pro_annual";
            const isFree = plan.code === "free";
            const isAgency = plan.code === "agency_monthly";
            const isRecommended = isProAnnual;

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
                {isProAnnual && annualSavingsPercent > 0 ? (
                  <span className="absolute -top-3 right-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Save {annualSavingsPercent}%
                  </span>
                ) : null}

                {isFree ? (
                  <span className="absolute -top-3 right-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Free
                  </span>
                ) : null}

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{plan.name}</p>
                    <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                      {plan.description}
                    </p>
                  </div>
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

                {isProAnnual ? (
                  <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                    Billed ${Math.round(plan.priceCents / 100).toLocaleString()} annually. Monthly
                    billing available ($299/mo) in settings.
                  </p>
                ) : null}

                <ul className="mt-7 space-y-3 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      <strong className="text-slate-950">
                        {plan.searchesPerMonth >= 9999 ? "Unlimited" : plan.searchesPerMonth}
                      </strong>{" "}
                      sourcing runs / month
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{shortlistCopy[plan.code]}</span>
                  </li>
                  {plan.enrichesPerMonth >= 99999 ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        <strong className="text-slate-950">Unlimited</strong> contact unlocks
                      </span>
                    </li>
                  ) : plan.enrichesPerMonth > 0 ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        <strong className="text-slate-950">
                          {plan.enrichesPerMonth.toLocaleString()}
                        </strong>{" "}
                        contact unlocks with outreach drafts / month
                      </span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-slate-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                      <span>Upgrade for more contact unlocks and outreach drafts</span>
                    </li>
                  )}
                  {plan.exportEnabled ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        {isAgency ? "White-label CSV export + API access" : "CSV export included"}
                      </span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-slate-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                      <span>Upgrade for CSV export</span>
                    </li>
                  )}
                  {isAgency ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>Dedicated onboarding and priority support</span>
                    </li>
                  ) : null}
                </ul>

                <div className="mt-auto pt-7">
                  {isAgency ? (
                    <a
                      href="mailto:support@hirelix.online?subject=Agency%20Plan%20Inquiry"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-slate-800"
                    >
                      {planCtaLabels[plan.code]}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ) : user ? (
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
                {SEARCH_PACK.credits} extra sourcing runs for heavier sourcing weeks.
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
                {CONTACT_PACK.credits} extra contact unlocks with outreach drafts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
