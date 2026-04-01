"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromParams,
  trackEvent,
} from "@/lib/analytics";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useBilling } from "@/lib/use-billing";
import { ArrowRight, Loader2, Send, Sparkles } from "lucide-react";

const FIXED_CANDIDATE_COUNT = 20;

type ClarifyResponse = {
  parsed_requirements: Record<string, unknown>;
  summary: {
    title: string;
    requiredSkills: string[];
    niceToHaveSkills: string[];
    experienceYearsMin: number | null;
    workModel: string;
    locationScope: string | null;
  };
  clarification: {
    message: string;
    ready_to_launch: boolean;
  };
};

type Stage =
  | { type: "input" }
  | { type: "analyzing" }
  | { type: "clarifying"; response: ClarifyResponse; reply: string }
  | { type: "launching" }
  | { type: "error"; message: string };

export default function NewSearchPage() {
  const { billing, refresh } = useBilling();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jdText, setJdText] = useState("");
  const [stage, setStage] = useState<Stage>({ type: "input" });
  const [isNavigating, startTransition] = useTransition();
  const replyInputRef = useRef<HTMLInputElement>(null);
  const hasTrackedViewRef = useRef(false);
  const analyticsContext = getAnalyticsContextFromParams(searchParams);

  useEffect(() => {
    const prefill = searchParams.get("jd");
    if (prefill) setJdText(prefill);
  }, [searchParams]);

  useEffect(() => {
    if (hasTrackedViewRef.current) return;
    hasTrackedViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.newSearchView, {
      ...analyticsContext,
      has_prefilled_jd: Boolean(searchParams.get("jd")),
    });
  }, [analyticsContext, searchParams]);

  useEffect(() => {
    if (stage.type === "clarifying") {
      replyInputRef.current?.focus();
    }
  }, [stage.type]);

  const isOutOfSearches = billing?.usage.searchesRemaining === 0 && billing.plan.code === "free";

  async function handleStart() {
    if (jdText.trim().length < 50) return;
    if (isOutOfSearches) return;

    setStage({ type: "analyzing" });

    trackEvent(ANALYTICS_EVENTS.primaryProductCtaClick, {
      ...analyticsContext,
      jd_word_count: jdText.trim().split(/\s+/).filter(Boolean).length,
      cta_surface: "new_search_start",
    });

    try {
      const res = await fetchWithUserSession("/api/search/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jdText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to analyze JD");
      }

      const data = (await res.json()) as ClarifyResponse;

      if (data.clarification.ready_to_launch) {
        await launchSearch(data, "");
      } else {
        setStage({ type: "clarifying", response: data, reply: "" });
      }
    } catch (error) {
      setStage({
        type: "error",
        message: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  }

  async function handleReply() {
    if (stage.type !== "clarifying") return;
    await launchSearch(stage.response, stage.reply.trim());
  }

  async function launchSearch(clarifyData: ClarifyResponse, userClarification: string) {
    setStage({ type: "launching" });

    try {
      const res = await fetchWithUserSession("/api/search/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_text: jdText.trim(),
          candidate_count: FIXED_CANDIDATE_COUNT,
          parsed_requirements_override: clarifyData.parsed_requirements,
          ...(userClarification ? { user_clarification: userClarification } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) void refresh();
        throw new Error(data.error || "Failed to create sourcing task");
      }

      const { id } = await res.json();
      void refresh();
      trackEvent(ANALYTICS_EVENTS.searchCreateSuccess, {
        ...analyticsContext,
        candidate_count: FIXED_CANDIDATE_COUNT,
        search_id: id,
        had_clarification: Boolean(userClarification),
      });
      startTransition(() => {
        router.push(`/app/search/${id}`);
      });
    } catch (error) {
      setStage({
        type: "error",
        message: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  }

  const canStart = jdText.trim().length >= 50 && !isOutOfSearches;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
          New sourcing run
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Paste the JD and start sourcing.
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Hirelix reads the JD, may ask one quick question, then sources and ranks candidates with outreach drafts ready to send.
        </p>
      </div>

      {/* JD input — always visible */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <textarea
          value={jdText}
          onChange={(e) => {
            setJdText(e.target.value);
            if (stage.type !== "input") setStage({ type: "input" });
          }}
          rows={14}
          placeholder="Paste the full job description here..."
          disabled={stage.type === "analyzing" || stage.type === "launching" || isNavigating}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white disabled:opacity-60"
        />

        {isOutOfSearches && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-900">
                You&apos;ve used all sourcing runs for this billing cycle. Upgrade to continue.
              </p>
              <PaddleCheckoutButton
                checkout={{ type: "plan", planCode: "pro_monthly" }}
                label="Upgrade plan"
                onError={(message) =>
                  setStage({ type: "error", message })
                }
                className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 sm:w-auto"
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {jdText.trim().length > 0
              ? `${jdText.trim().split(/\s+/).filter(Boolean).length} words`
              : "Tip: the fuller the JD, the better the results."}
          </p>
          {stage.type === "input" || stage.type === "error" ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={!canStart}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Start sourcing
            </button>
          ) : null}
        </div>

        {stage.type === "error" && (
          <p className="mt-3 text-sm text-red-500">{stage.message}</p>
        )}
      </div>

      {/* Chat area — shown after JD submitted */}
      {(stage.type === "analyzing" || stage.type === "clarifying" || stage.type === "launching" || isNavigating) && (
        <div className="mt-6 space-y-4">
          {/* AI bubble */}
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
              {stage.type === "analyzing" ? (
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reading JD...
                </span>
              ) : stage.type === "clarifying" ? (
                <p className="text-sm leading-relaxed text-slate-800">
                  {stage.response.clarification.message}
                </p>
              ) : (
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isNavigating ? "Opening workbench..." : "Launching search..."}
                </span>
              )}
            </div>
          </div>

          {/* Reply input or launch button */}
          {stage.type === "clarifying" && (
            <div className="ml-11">
              <div className="flex gap-2">
                <input
                  ref={replyInputRef}
                  type="text"
                  value={stage.reply}
                  onChange={(e) =>
                    setStage({ ...stage, reply: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleReply();
                    }
                  }}
                  placeholder="Reply here, or leave blank and launch..."
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400/20"
                />
                <button
                  type="button"
                  onClick={() => void handleReply()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {stage.reply.trim() ? (
                    <>
                      <Send className="h-4 w-4" />
                      Send
                    </>
                  ) : (
                    <>
                      Launch
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Press Enter or click Launch to start sourcing immediately.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
