import { ArrowRight, CheckCircle2 } from "lucide-react";
import { BILLING_PLANS } from "@/lib/billing";

export function PricingSection({ onStart }: { onStart: () => void }) {
  const freePlan = BILLING_PLANS.free;
  const annualPlan = BILLING_PLANS.starter_annual;
  const monthlyPlan = BILLING_PLANS.starter_monthly;
  const plans = [
    {
      key: "free",
      name: "Free first run",
      price: freePlan.priceLabel,
      cadence: "one complete shortlist",
      description: "Run one complete 25-profile shortlist before you pay.",
      cta: "Try for free",
      featured: false,
      bullets: [
        "Ranked 25-profile shortlist",
        "Fit evidence and risks",
        "Personalized outreach drafts",
      ],
    },
    {
      key: "annual",
      name: "Annual",
      price: annualPlan.priceLabel,
      cadence: annualPlan.cadenceLabel,
      description: "Everything unlocked at the best monthly rate.",
      cta: annualPlan.ctaLabel,
      featured: true,
      bullets: [
        `${annualPlan.searchesPerMonth} shortlist builds per month`,
        `${annualPlan.enrichesPerMonth} email lookups per month`,
        "Export and client-ready briefs included",
      ],
    },
    {
      key: "monthly",
      name: "Monthly",
      price: monthlyPlan.priceLabel,
      cadence: monthlyPlan.cadenceLabel,
      description: "Everything unlocked, paid month to month.",
      cta: monthlyPlan.ctaLabel,
      featured: false,
      bullets: [
        `${monthlyPlan.searchesPerMonth} shortlist builds per month`,
        `${monthlyPlan.enrichesPerMonth} email lookups per month`,
        "Export and client-ready briefs included",
      ],
    },
  ];

  return (
    <section id="pricing" data-growth-section="定价" className="scroll-mt-24 border-t border-slate-200 bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Pricing
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Start with one complete shortlist.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Upgrade when you are ready to work the candidate pool across active client roles.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`relative rounded-lg border p-6 shadow-[0_12px_34px_rgba(15,23,42,0.055)] ${
                plan.featured
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-950"
              }`}
            >
              {plan.featured ? (
                <span className="absolute right-5 top-5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-950">
                  Recommended
                </span>
              ) : null}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className={`mt-2 text-sm leading-6 ${plan.featured ? "text-slate-300" : "text-slate-600"}`}>
                {plan.description}
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                <p className={`mt-1 text-sm ${plan.featured ? "text-slate-300" : "text-slate-500"}`}>
                  {plan.cadence}
                </p>
              </div>
              <div className="mt-6 grid gap-3 text-sm">
                {plan.bullets.map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? "text-emerald-300" : "text-emerald-600"}`} />
                    <span className={plan.featured ? "text-slate-200" : "text-slate-700"}>{item}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={onStart}
                className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                  plan.featured
                    ? "bg-white text-slate-950 hover:bg-indigo-50"
                    : "bg-slate-950 text-white hover:bg-slate-800"
                }`}
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-7 max-w-2xl text-center text-sm leading-6 text-slate-600">
          Start with one complete shortlist. Upgrade when you are ready to work the candidate pool.
        </p>
      </div>
    </section>
  );
}
