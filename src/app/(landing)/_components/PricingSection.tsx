import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BILLING_PLANS, CONTACT_PACK, SEARCH_PACK } from "@/lib/billing";
import type { User } from "@supabase/supabase-js";

export function PricingSection({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
  return (
    <section className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <div className="mb-4 flex justify-center gap-2 text-xs">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-800">
              Built for technical recruiters
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700">
              Self-serve signup and billing
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Pricing that protects speed, not complexity
          </h2>
          <p className="mt-3 text-base text-slate-600">
            Start free with one high-conviction shortlist per month, sourced from a Bright LinkedIn search and ranked into roughly 25 candidates. Upgrade when you need more weekly throughput, exports, and the fuller outreach workflow. Hirelix is built for technical recruiters and headhunters who need a faster path from JD to credible outreach.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {Object.values(BILLING_PLANS).map((plan) => (
            <div
              key={plan.code}
              className={`rounded-3xl border p-6 ${
                plan.featured
                  ? "border-amber-300/50 bg-[linear-gradient(180deg,#fff7df_0%,#fff2c7_100%)] shadow-[0_20px_80px_rgba(251,191,36,0.12)]"
                  : "border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{plan.name}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{plan.description}</p>
                </div>
                {plan.featured && (
                  <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-950">
                    Popular
                  </span>
                )}
              </div>

              <div className="mt-8">
                <p className="text-4xl font-bold text-slate-950">{plan.priceLabel}</p>
                <p className="mt-2 text-sm text-slate-500">{plan.cadenceLabel}</p>
              </div>

              <div className="mt-8 space-y-3 text-sm text-slate-700">
                <p>{plan.searchesPerMonth} {plan.searchesPerMonth === 1 ? "search" : "searches"} each month</p>
                <p>{plan.candidateLimitPerSearch} candidates per search</p>
                {plan.enrichesPerMonth > 0 && (
                  <p>{plan.enrichesPerMonth} {plan.enrichesPerMonth === 1 ? "email + draft enrich" : "email + draft enriches"}</p>
                )}
                {plan.exportEnabled && <p>CSV export included</p>}
              </div>

              {user ? (
                <Link
                  href="/app/settings#billing"
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                    plan.featured
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : "border border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100"
                  }`}
                >
                  Open billing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                    plan.featured
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : "border border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100"
                  }`}
                >
                  Sign in to choose plan
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-slate-950">{SEARCH_PACK.name}</p>
            <p className="mt-2 text-sm text-slate-600">{SEARCH_PACK.priceLabel} for {SEARCH_PACK.credits} extra searches in heavy months.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-slate-950">{CONTACT_PACK.name}</p>
            <p className="mt-2 text-sm text-slate-600">{CONTACT_PACK.priceLabel} for {CONTACT_PACK.credits} extra email + draft enriches.</p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
            <div className="space-y-2 leading-7">
              <p>Hirelix is available today for technical recruiters and headhunters.</p>
              <p>Subscriptions renew automatically until canceled.</p>
              <p>Cancel anytime from billing settings or by emailing support@hirelix.online.</p>
              <p>Purchases made through Paddle are refundable within 14 days of the transaction date.</p>
              <p>For subscriptions, refunds are available within 14 days of the initial purchase or the most recent renewal.</p>
              <p>Taxes may apply depending on the customer location.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
