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
      <div className="rounded-md bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="mt-2 h-3.5 w-32 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  const containerClassName =
    copy.state === "warning"
      ? "bg-amber-50/80"
      : copy.state === "unavailable"
        ? "bg-slate-50"
        : "bg-slate-50";

  return (
    <div className={`rounded-md px-3 py-2 ${containerClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{copy.title}</p>
            {copy.state === "warning" ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                Limit reached
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-600">{copy.usageLabel}</p>
        </div>
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
          className="shrink-0 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          Manage
        </Link>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
        {copy.capabilityLabel}
        {copy.renewalLabel ? ` · ${copy.renewalLabel}` : ""}
      </p>
    </div>
  );
}
