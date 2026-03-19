"use client";

import { useState, useEffect, FormEvent, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromParams,
  trackEvent,
} from "@/lib/analytics";
import { useBilling } from "@/lib/use-billing";
import {
  ArrowRight,
  Loader2,
  FileText,
  Clock3,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

const FIXED_CANDIDATE_COUNT = 25;

export default function NewSearchPage() {
  const { session } = useAuth();
  const { billing, refresh } = useBilling();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jdText, setJdText] = useState("");
  const [isNavigating, startTransition] = useTransition();
  const hasTrackedViewRef = useRef(false);
  const hasTrackedConfirmationViewRef = useRef(false);
  const analyticsContext = getAnalyticsContextFromParams(searchParams);
  const prefilledJd = searchParams.get("jd")?.trim() || "";
  const isFocusedFlow = analyticsContext.entry_mode === "landing" && Boolean(prefilledJd);

  useEffect(() => {
    const prefill = searchParams.get("jd");
    if (prefill) setJdText(prefill);
  }, [searchParams]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (hasTrackedViewRef.current) return;

    hasTrackedViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.newSearchView, {
      ...analyticsContext,
      has_prefilled_jd: Boolean(prefilledJd),
    });
  }, [analyticsContext, prefilledJd]);

  useEffect(() => {
    if (!isFocusedFlow || hasTrackedConfirmationViewRef.current) return;

    hasTrackedConfirmationViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.searchConfirmationView, {
      ...analyticsContext,
      has_prefilled_jd: true,
      jd_word_count: prefilledJd.split(/\s+/).filter(Boolean).length,
    });
  }, [analyticsContext, isFocusedFlow, prefilledJd]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!jdText.trim() || !session) return;
    if (billing?.usage.searchesRemaining === 0) {
      setStatus("error");
      setErrorMsg("You have reached this month's shortlist limit. Upgrade to Pro or wait for the next billing cycle.");
      return;
    }

    trackEvent(ANALYTICS_EVENTS.primaryProductCtaClick, {
      ...analyticsContext,
      candidate_count: FIXED_CANDIDATE_COUNT,
      jd_word_count: jdText.trim().split(/\s+/).filter(Boolean).length,
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      cta_surface: isFocusedFlow ? "new_search_focused" : "new_search",
      primary_context: isFocusedFlow ? "confirmation" : "start",
    });

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/search/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ jd_text: jdText.trim(), candidate_count: FIXED_CANDIDATE_COUNT }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create shortlist");
      }

      const { id } = await res.json();
      void refresh();
      trackEvent(ANALYTICS_EVENTS.searchJobEnqueued, {
        ...analyticsContext,
        candidate_count: FIXED_CANDIDATE_COUNT,
        search_id: id,
      });
      trackEvent(ANALYTICS_EVENTS.searchCreateSuccess, {
        ...analyticsContext,
        candidate_count: FIXED_CANDIDATE_COUNT,
        jd_word_count: jdText.trim().split(/\s+/).filter(Boolean).length,
        search_id: id,
      });
      startTransition(() => {
        const nextPath =
          analyticsContext.entry_mode === "workspace"
            ? `/app/search/${id}`
            : `/app/search/${id}?entry=${analyticsContext.entry_mode}`;
        router.push(nextPath);
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong",
      );
    }
  }

  return (
    <div className={`mx-auto ${isFocusedFlow ? "max-w-4xl" : "max-w-3xl"}`}>
      <div className={`mb-8 ${isFocusedFlow ? "rounded-[32px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.28),_transparent_28%),linear-gradient(180deg,#fbfdff_0%,#f2f8ff_100%)] p-6 shadow-[0_22px_60px_rgba(14,165,233,0.10)] sm:p-8" : ""}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
          {isFocusedFlow ? "Shortlist confirmation" : "Create shortlist"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {isFocusedFlow
            ? "Your JD is ready. Build the shortlist."
            : "Search broadly. Review the best matches in minutes."}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {isFocusedFlow
            ? "You are still in the same flow from the landing page. Confirm the search settings below and Hirelix will move straight into ranked matches."
            : "Paste one full job description and Hirelix will search across LinkedIn profile data, compare candidate fit, and build a shortlist you can review before deciding on outreach."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
            Paid beta
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            US-only at launch
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Support: support@hirelix.online
          </span>
        </div>

        {isFocusedFlow ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">JD ready</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-950">
                  {jdText.split("\n").map((line) => line.trim()).find(Boolean) || "Full job description attached"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Expected time</p>
                <p className="mt-1 text-sm font-medium text-slate-950">Often ready in a few minutes</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {billing?.plan.code === "free" ? "Free plan remaining" : "Current plan"}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-950">
                  {billing
                    ? billing.plan.code === "free"
                      ? `${billing.usage.searchesRemaining} shortlist runs left`
                      : `${billing.plan.name} active`
                    : "Checking plan limits..."}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
              {["Read role", "Search pool", "Rank best matches", "Review shortlist"].map((step) => (
                <span key={step} className="rounded-full border border-sky-100 bg-white/75 px-3 py-1">
                  {step}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Clock3 className="h-3.5 w-3.5 text-primary" />
              Search across LinkedIn
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              AI narrows to strongest matches
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Review before you upgrade
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className={`rounded-xl border border-border bg-background p-6 ${isFocusedFlow ? "shadow-[0_18px_48px_rgba(15,23,42,0.06)]" : ""}`}>
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            {isFocusedFlow ? "Review the job description before launch" : "Job Description"}
          </div>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            {isFocusedFlow
              ? "Make any final edits here. We already preserved the JD you brought from the landing page."
              : "Paste the full role, not just the title, so Hirelix has enough signal to search broadly and rank the right candidates."}
          </p>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full job description here...&#10;&#10;For example:&#10;We are hiring a Senior Software Engineer to build backend services, APIs, and distributed systems for a B2B SaaS product..."
            rows={14}
            className="w-full resize-none rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed text-foreground placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          {billing?.usage.searchesRemaining === 0 && billing.plan.code === "free" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-900">
                  You&apos;ve used all shortlist runs for this billing cycle. Upgrade to continue now, or wait for the next reset.
                </p>
                <PaddleCheckoutButton
                  checkout={{ type: "plan", planCode: "pro_monthly" }}
                  label="Upgrade plan"
                  onClick={() =>
                    trackEvent(ANALYTICS_EVENTS.upgradeCtaClick, {
                      ...analyticsContext,
                      plan_code: billing.subscription.planCode,
                      upgrade_surface: "new_search_limit_banner",
                    })
                  }
                  onError={(message) => {
                    setStatus("error");
                    setErrorMsg(message);
                  }}
                  className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <p className="text-xs text-muted-light">
                {jdText.length > 0
                  ? `${jdText.split(/\s+/).filter(Boolean).length} words`
                  : "Tip: paste the full JD, not just the title, for stronger matches."}
              </p>
              <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                Paid beta: Free shows up to 10 strong candidates, Pro unlocks contact + outreach execution
              </p>
            </div>
            <button
              type="submit"
              disabled={status === "loading" || isNavigating || jdText.trim().length < 50 || billing?.usage.searchesRemaining === 0}
              className="inline-flex items-center gap-2 cursor-pointer rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {status === "loading" || isNavigating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isNavigating ? "Opening shortlist..." : "Building your shortlist..."}
                </>
              ) : (
                <>
                    {isFocusedFlow ? "Build the shortlist" : "Build shortlist"} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="text-sm text-slate-700">
                <p className="font-medium text-slate-900">What happens next</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  {["Read role", "Search Bright pool", "Keep only credible matches", "Unlock contact + outreach on Pro"].map((step) => (
                    <span key={step} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {step}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Hirelix reads the role, expands the candidate pool across LinkedIn, and only keeps credible matches in the free shortlist. Free shows up to 10 strong candidates; Pro unlocks contact details, export, and outreach execution when you are ready to act.
                </p>
              </div>
            </div>
          </div>
        </div>

        {status === "error" && (
          <p className="mt-4 text-sm text-red-500">{errorMsg}</p>
        )}
      </form>
    </div>
  );
}
