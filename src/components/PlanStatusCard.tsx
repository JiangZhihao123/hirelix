"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BillingSummary } from "@/lib/billing";
import { getPlanStatusCopy } from "@/lib/billing";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromBrowser,
  trackEvent,
} from "@/lib/analytics";

type PlanStatusCardProps = {
  billing: BillingSummary | null;
  loading: boolean;
  href?: string;
};

const VIEW_SESSION_KEY = "hirelix.plan-status-card-viewed";

export function PlanStatusCard({
  billing,
  loading,
  href = "/app/settings#billing",
}: PlanStatusCardProps) {
  const pathname = usePathname();
  const copy = getPlanStatusCopy(billing);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    if (window.sessionStorage.getItem(VIEW_SESSION_KEY) === "true") return;

    window.sessionStorage.setItem(VIEW_SESSION_KEY, "true");
    trackEvent(ANALYTICS_EVENTS.planStatusCardView, {
      ...getAnalyticsContextFromBrowser(),
      route: pathname,
      plan_code: billing?.subscription.planCode ?? "unknown",
      subscription_status: billing?.subscription.status ?? "unknown",
      searches_remaining: billing?.usage.searchesRemaining ?? null,
      enriches_remaining: billing?.usage.enrichesRemaining ?? null,
    });
  }, [billing, loading, pathname]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
        <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-5 w-28 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3.5 w-full animate-pulse rounded bg-slate-200" />
        <div className="mt-1.5 h-3.5 w-4/5 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  const cardClassName =
    copy.state === "warning"
      ? "border-amber-200 bg-amber-50/70"
      : copy.state === "unavailable"
        ? "border-slate-200 bg-slate-50/70"
        : "border-sky-200 bg-sky-50/70";

  return (
    <div className={`rounded-lg border p-2.5 ${cardClassName}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Plan
        </p>
        <Link
          href={href}
          onClick={() => {
            trackEvent(ANALYTICS_EVENTS.planStatusCardClick, {
              ...getAnalyticsContextFromBrowser(),
              route: pathname,
              plan_code: billing?.subscription.planCode ?? "unknown",
              subscription_status: billing?.subscription.status ?? "unknown",
              searches_remaining: billing?.usage.searchesRemaining ?? null,
              enriches_remaining: billing?.usage.enrichesRemaining ?? null,
            });
          }}
          className="text-[11px] font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          {copy.actionLabel}
        </Link>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-slate-950">{copy.title}</p>
      <p className="mt-1 text-sm text-slate-700">{copy.usageLabel}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{copy.capabilityLabel}</p>
      {copy.renewalLabel ? (
        <p className="mt-1.5 text-[11px] text-slate-500">{copy.renewalLabel}</p>
      ) : null}
    </div>
  );
}
