import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  BILLING_PLANS,
  CONTACT_PACK,
  SEARCH_PACK,
  formatCountLabel,
  type BillingPlanCode,
} from "@/lib/billing";
type User = { id: string };

// Keep the public pricing focused on the solo technical recruiter path.
const SHOWCASE_PLANS = ["free", "starter_monthly", "pro_annual"] as const;

const planCtaLabels: Record<string, string> = {
  free: "Start free",
  starter_monthly: "Start Solo",
  starter_annual: "Start Solo annual",
  pro_annual: "Start annual Pro",
  pro_monthly: "Start Pro",
  business_monthly: "Start Business",
  agency_monthly: "Contact us",
};

const shortlistCopy: Record<string, string> = {
  free: "One real shortlist preview with fit evidence and risks",
  starter_monthly: "Evidence-backed shortlists, contact unlocks, and CSV export",
  starter_annual: "Lower annual rate for independent solo sourcing",
  pro_monthly: "Client-ready briefs, export, and deeper shortlist capacity",
  pro_annual: "Client-ready briefs, export, and deeper shortlist capacity",
  business_monthly: "Shared workspace, higher volume, priority support",
  agency_monthly: "High-volume search firm capacity, API access, white-label export",
};

export function PricingSection({
  user,
  onSignIn,
}: {
  user: User | null;
  onSignIn: (planCode: BillingPlanCode) => void;
}) {
  const proAnnual = BILLING_PLANS.pro_annual;
  const proMonthly = BILLING_PLANS.pro_monthly;
  const starterAnnual = BILLING_PLANS.starter_annual;
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
            Start with one real shortlist. Upgrade when it saves sourcing time.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Built for independent technical headhunters: prove one client role first, then
            choose Solo for monthly sourcing or Pro when you need client-ready briefs.
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
          {SHOWCASE_PLANS.map((code) => {
            const plan = BILLING_PLANS[code];
            const isProAnnual = plan.code === "pro_annual";
              const isStarter = plan.code === "starter_monthly";
              const isFree = plan.code === "free";
            const isRecommended = isProAnnual;
            const mobileOrder = isFree ? "order-1" : isProAnnual ? "order-2" : "order-3";

            return (
              <div
                key={plan.code}
                className={`relative ${mobileOrder} flex flex-col rounded-lg border p-6 shadow-[0_14px_40px_rgba(15,23,42,0.07)] transition-all lg:order-none ${
                  isRecommended
                    ? "border-blue-300 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_42%)] ring-1 ring-blue-100 lg:-mt-3 lg:mb-3"
                    : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_50px_rgba(37,99,235,0.11)]"
                }`}
              >
                {isRecommended && (
                  <span className="absolute -top-3 left-5 rounded-lg bg-blue-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)]">
                    Recommended
                  </span>
                )}
                {isStarter ? (
                  <span className="absolute -top-3 right-5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">
                    Solo
                  </span>
                ) : null}
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
                    billing available ($249/mo) in settings.
                  </p>
                ) : null}
                {isStarter ? (
                  <p className="mt-3 hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 sm:block">
                    Annual Solo available at ${Math.round(starterAnnual.priceCents / 1200).toLocaleString()}/mo,
                    billed ${Math.round(starterAnnual.priceCents / 100).toLocaleString()}/year.
                  </p>
                ) : null}

                <ul className="mt-7 space-y-3 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      <strong className="text-slate-950">{plan.searchesPerMonth}</strong>{" "}
                      {formatCountLabel(
                        plan.searchesPerMonth,
                        "shortlist build / month",
                        "shortlist builds / month",
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{shortlistCopy[plan.code]}</span>
                  </li>
                  {plan.enrichesPerMonth > 0 ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        <strong className="text-slate-950">
                          {plan.enrichesPerMonth.toLocaleString()}
                        </strong>{" "}
                        contact unlocks with outreach-ready context / month
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
                        CSV export included
                      </span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-slate-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                      <span>Upgrade for CSV export</span>
                    </li>
                  )}
                  {plan.clientBriefEnabled ? (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>Client-ready brief included</span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-slate-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                      <span>Upgrade to Pro for client-ready briefs</span>
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
                      onClick={() => onSignIn(plan.code)}
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

        <details className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5 lg:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-slate-950">
            Team volume and add-ons
          </summary>
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-950">Need team volume?</p>
              <p className="mt-1 text-slate-600">
                Business and agency plans are available for search firms that need shared workspace,
                white-label export, or high-volume sourcing.
              </p>
              <a
                href="mailto:support@hirelix.online?subject=Team%20Volume%20Inquiry"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Contact us
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-950">Need extra credits?</p>
              <p className="mt-1 text-slate-600">
                Search Pack and Contact Pack add-ons are available from billing after sign in.
              </p>
            </div>
          </div>
        </details>

        <div className="mt-6 hidden rounded-lg border border-slate-200 bg-slate-50 p-5 lg:block">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Need team volume?</p>
              <p className="mt-1 text-sm text-slate-600">
                Business and agency plans are available for search firms that need shared workspace,
                white-label export, or high-volume sourcing.
              </p>
            </div>
            <a
              href="mailto:support@hirelix.online?subject=Team%20Volume%20Inquiry"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 sm:w-auto"
            >
              Contact us
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mt-8 hidden rounded-lg border border-slate-200 bg-slate-50 p-5 lg:block">
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
                {SEARCH_PACK.credits} extra shortlist builds for heavier sourcing weeks.
              </p>
              {user ? (
                <PaddleCheckoutButton
                  checkout={{ type: "add_on", addOn: "search_pack" }}
                  label="Buy Search Pack"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:border-blue-300"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSignIn("free")}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:border-blue-300"
                >
                  Sign in to buy
                </button>
              )}
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
              {user ? (
                <PaddleCheckoutButton
                  checkout={{ type: "add_on", addOn: "contact_pack" }}
                  label="Buy Contact Pack"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:border-blue-300"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSignIn("free")}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:border-blue-300"
                >
                  Sign in to buy
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
