"use client";


import { useLanguage, useT } from "@/components/LanguageProvider";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  BILLING_PLANS,
  getPlanProfileScansPerMonth,
  getPlanPublicEvidenceDeepDivesPerMonth,
  type BillingPlanCode,
} from "@/lib/billing";

type PaidBillingPlanCode = Exclude<BillingPlanCode, "free">;
type PricingCard = {
  key: string;
  name: string;
  price: string;
  cadence: string;
  description: string;
  cta: string;
  featured: boolean;
  planCode: PaidBillingPlanCode | null;
  monthlyPlanCode: PaidBillingPlanCode | null;
  monthlyPrice: string | null;
  bullets: string[];
};

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

export function PricingSection({
  onStart,
  onSelectPlan,
}: {
  onStart: () => void;
  onSelectPlan: (planCode: Exclude<BillingPlanCode, "free">) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const bullet = (value: string) => {
    if (locale === "zh") {
      const roles = value.match(/^(\d+) client roles per month$/);
      if (roles) return `每月 ${roles[1]} 个客户职位`;
      const scans = value.match(/^([\d,]+) targeted profile scan budget$/);
      if (scans) return `${scans[1]} 次定向人才画像扫描额度`;
      const research = value.match(/^([\d,]+) candidate research runs$/);
      if (research) return `${research[1]} 次候选人深度研究`;
    }
    return t(value);
  };
  const freePlan = BILLING_PLANS.free;
  const starterAnnualPlan = BILLING_PLANS.starter_annual;
  const starterMonthlyPlan = BILLING_PLANS.starter_monthly;
  const proAnnualPlan = BILLING_PLANS.pro_annual;
  const proMonthlyPlan = BILLING_PLANS.pro_monthly;
  const freeProfileScans = getPlanProfileScansPerMonth(freePlan);
  const plans: PricingCard[] = [
    {
      key: "free",
      name: "Free",
      price: freePlan.priceLabel,
      cadence: freePlan.cadenceLabel,
      description: "Run a real preview before you pay.",
      cta: "Try first role",
      featured: false,
      planCode: null,
      monthlyPlanCode: null,
      monthlyPrice: null,
      bullets: [
        "1 client role preview",
        `${formatCount(freeProfileScans)} targeted profile scan budget`,
        "AI-sourced ranked candidate pool",
        "Top recommendations with outreach drafts",
      ],
    },
    {
      key: "starter",
      name: "Starter",
      price: starterAnnualPlan.priceLabel,
      cadence: starterAnnualPlan.cadenceLabel,
      description: "For a technical headhunter covering a few active client roles.",
      cta: starterAnnualPlan.ctaLabel,
      featured: true,
      planCode: "starter_annual" satisfies PaidBillingPlanCode,
      monthlyPlanCode: "starter_monthly" satisfies PaidBillingPlanCode,
      monthlyPrice: starterMonthlyPlan.priceLabel,
      bullets: [
        `${starterAnnualPlan.searchesPerMonth} client roles per month`,
        `${formatCount(getPlanProfileScansPerMonth(starterAnnualPlan))} targeted profile scan budget`,
        "AI can split scans across sourcing angles",
        "Useful profiles are deduped and ranked",
        "LinkedIn outreach drafts for recommended candidates",
        `${formatCount(getPlanPublicEvidenceDeepDivesPerMonth(starterAnnualPlan))} candidate research runs`,
        "CSV export and client-ready briefs",
      ],
    },
    {
      key: "pro",
      name: "Pro",
      price: proAnnualPlan.priceLabel,
      cadence: proAnnualPlan.cadenceLabel,
      description: "For recruiters running a larger active client-role desk.",
      cta: proAnnualPlan.ctaLabel,
      featured: false,
      planCode: "pro_annual" satisfies PaidBillingPlanCode,
      monthlyPlanCode: "pro_monthly" satisfies PaidBillingPlanCode,
      monthlyPrice: proMonthlyPlan.priceLabel,
      bullets: [
        `${proAnnualPlan.searchesPerMonth} client roles per month`,
        `${formatCount(getPlanProfileScansPerMonth(proAnnualPlan))} targeted profile scan budget`,
        "AI can run more sourcing rounds per desk",
        "Useful profiles are deduped and ranked",
        "LinkedIn outreach drafts for recommended candidates",
        `${formatCount(getPlanPublicEvidenceDeepDivesPerMonth(proAnnualPlan))} candidate research runs`,
        "CSV export and client-ready briefs",
      ],
    },
  ];

  return (
    <section id="pricing" data-growth-section="定价" className="min-h-[calc(100vh-4.5rem)] scroll-mt-[4.5rem] border-t border-slate-200 bg-white pt-8 pb-16 sm:pt-8 sm:pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            {t("Pricing")}
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {t("Add sourcing capacity when you need it.")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
            {t("Your private AI assistant and candidate workspace are available after sign-in. These plans govern the existing profile search and research capacity.")}
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const monthlyPlanCode = plan.monthlyPlanCode;

            return (
              <div
                key={plan.key}
                className={`relative rounded-lg border p-6 shadow-[0_12px_34px_rgba(15,23,42,0.055)] ${
                  plan.featured
                    ? "border-indigo-200 bg-white text-slate-950 ring-1 ring-indigo-100"
                    : "border-slate-200 bg-white text-slate-950"
                }`}
              >
                {plan.featured ? (
                  <span className="absolute right-5 top-5 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
                    {t("Recommended")}
                  </span>
                ) : null}
                <h3 className="text-lg font-semibold">{t(plan.name)}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t(plan.description)}
                </p>
                <div className="mt-6">
                  <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                  <p className="mt-1 text-sm text-slate-500">
                    {t(plan.cadence)}
                  </p>
                </div>
                <div className="mt-6 grid gap-3 text-sm">
                  {plan.bullets.map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="text-slate-700">{bullet(item)}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (plan.planCode) {
                      onSelectPlan(plan.planCode);
                      return;
                    }
                    onStart();
                  }}
                  className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                    plan.featured
                      ? "bg-indigo-700 text-white hover:bg-indigo-600"
                      : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {t(plan.cta)}
                  <ArrowRight className="h-4 w-4" />
                </button>
                {monthlyPlanCode ? (
                  <button
                    type="button"
                    onClick={() => onSelectPlan(monthlyPlanCode)}
                    className={`mt-3 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                      plan.featured
                        ? "text-indigo-700 hover:bg-indigo-50"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    {t("Prefer monthly?")} {plan.monthlyPrice} {t("/ month")}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-7 max-w-2xl text-center text-sm leading-6 text-slate-600">
          {t("Targeted profile scans are AI sourcing budget, not a guaranteed final candidate count. Hirelix observes the pool, adjusts sourcing angles, dedupes useful profiles, and ranks the strongest candidates found within your plan budget.")}
        </p>
      </div>
    </section>
  );
}
