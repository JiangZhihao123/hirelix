"use client";

import { useState, useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromParams,
  trackEvent,
} from "@/lib/analytics";
import { getGrowthIdentity, getJdLengthBucket, trackGrowthEvent } from "@/lib/growth-client";
import {
  PUBLIC_SEARCH_ANALYZE_ERROR_MESSAGE,
  PUBLIC_SEARCH_CREATE_ERROR_MESSAGE,
} from "@/lib/public-errors";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useBilling } from "@/lib/use-billing";
import { ArrowRight, CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";

type ClarifyResponse = {
  parsed_requirements: Record<string, unknown>;
  summary: {
    title: string;
    requiredSkills: string[];
    niceToHaveSkills: string[];
    experienceYearsMin: number | null;
    workModel: string;
    locationScope: string | null;
    locationFlexibility?: "strict" | "moderate" | "flexible";
    relocationAllowed?: "yes" | "no" | "unknown";
    mustHaveConstraints?: string[];
    softConstraints?: string[];
    constraintReasoning?: string | null;
  };
  clarification: {
    message: string;
    ready_to_launch: boolean;
  };
};

type EditableBrief = {
  title: string;
  requiredSkillsText: string;
  experienceYearsMin: string;
  workModel: string;
  locationScope: string;
  hardFiltersText: string;
};

type Stage =
  | { type: "input" }
  | { type: "analyzing" }
  | { type: "confirming"; response: ClarifyResponse; brief: EditableBrief; reply: string }
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
    // Only prefill when the JD came from the user (typed in landing hero or
    // posted via API). Skip the canned sample so logged-in users always start
    // with a blank textarea — preventing accidentally submitting the demo JD
    // as a real search.
    if (searchParams.get("intent_path") === "sample") return;
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
    void trackGrowthEvent("new_search_view", {
      has_prefilled_jd: Boolean(searchParams.get("jd")),
      route: "/app/search/new",
    });
  }, [analyticsContext, searchParams]);

  const shouldFocusClarification =
    stage.type === "confirming" && !stage.response.clarification.ready_to_launch;

  useEffect(() => {
    if (shouldFocusClarification) {
      replyInputRef.current?.focus();
    }
  }, [shouldFocusClarification]);

  const isOutOfSearches = billing?.usage.profileScansRemaining === 0 && billing.plan.code === "free";
  const candidateCount = billing?.usage.candidateLimitPerSearch ?? 25;

  const buildEditableBrief = (response: ClarifyResponse): EditableBrief => ({
    title: response.summary.title,
    requiredSkillsText: response.summary.requiredSkills.join(", "),
    experienceYearsMin:
      typeof response.summary.experienceYearsMin === "number"
        ? String(response.summary.experienceYearsMin)
        : "",
    workModel: response.summary.workModel || "unknown",
    locationScope: response.summary.locationScope || "",
    hardFiltersText: (response.summary.mustHaveConstraints || []).join("\n"),
  });

  const updateConfirmingBrief = (patch: Partial<EditableBrief>) => {
    setStage((current) =>
      current.type === "confirming"
        ? { ...current, brief: { ...current.brief, ...patch } }
        : current,
    );
  };

  const editedParsedRequirements = (response: ClarifyResponse, brief: EditableBrief) => {
    const requiredSkills = brief.requiredSkillsText
      .split(/[,\n]/)
      .map((skill) => skill.trim())
      .filter(Boolean);
    const hardFilters = brief.hardFiltersText
      .split(/\n/)
      .map((filter) => filter.trim())
      .filter(Boolean);
    const experienceYearsMin = brief.experienceYearsMin.trim()
      ? Number.parseInt(brief.experienceYearsMin, 10)
      : null;
    const previousHiringBrief =
      response.parsed_requirements.hiring_brief &&
      typeof response.parsed_requirements.hiring_brief === "object"
        ? (response.parsed_requirements.hiring_brief as Record<string, unknown>)
        : {};
    const previousRoleCore =
      previousHiringBrief.role_core && typeof previousHiringBrief.role_core === "object"
        ? (previousHiringBrief.role_core as Record<string, unknown>)
        : {};

    return {
      ...response.parsed_requirements,
      title: brief.title.trim() || response.summary.title,
      required_skills: requiredSkills,
      location: brief.locationScope.trim() || null,
      experience_years_min: Number.isFinite(experienceYearsMin)
        ? experienceYearsMin
        : response.summary.experienceYearsMin,
      hiring_brief: {
        ...previousHiringBrief,
        work_model: brief.workModel || "unknown",
        location_scope: brief.locationScope.trim() || null,
        must_have_constraints: hardFilters,
        role_core: {
          ...previousRoleCore,
          title: brief.title.trim() || response.summary.title,
          required_skills: requiredSkills,
        },
      },
    };
  };

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
        throw new Error(PUBLIC_SEARCH_ANALYZE_ERROR_MESSAGE);
      }

      const data = (await res.json()) as ClarifyResponse;

      setStage({ type: "confirming", response: data, brief: buildEditableBrief(data), reply: "" });
      trackEvent(ANALYTICS_EVENTS.briefConfirmationView, {
        ...analyticsContext,
        ready_to_launch: data.clarification.ready_to_launch,
        required_skill_count: data.summary.requiredSkills.length,
      });
    } catch (error) {
      setStage({
        type: "error",
        message: error instanceof Error ? error.message : PUBLIC_SEARCH_ANALYZE_ERROR_MESSAGE,
      });
    }
  }

  async function handleReply() {
    if (stage.type !== "confirming") return;
    trackEvent(ANALYTICS_EVENTS.briefLaunchClick, {
      ...analyticsContext,
      ready_to_launch: stage.response.clarification.ready_to_launch,
      had_clarification: Boolean(stage.reply.trim()),
      candidate_count: candidateCount,
    });
    await launchSearch(stage.response, stage.reply.trim(), stage.brief);
  }

  async function launchSearch(
    clarifyData: ClarifyResponse,
    userClarification: string,
    brief: EditableBrief,
  ) {
    setStage({ type: "launching" });

    try {
      const res = await fetchWithUserSession("/api/search/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_text: jdText.trim(),
          candidate_count: candidateCount,
          growth_tracking: getGrowthIdentity(),
          parsed_requirements_override: editedParsedRequirements(clarifyData, brief),
          ...(userClarification ? { user_clarification: userClarification } : {}),
        }),
      });

      if (!res.ok) {
        if (res.status === 403) void refresh();
        await trackGrowthEvent("search_create_failed", {
          jd_length_bucket: getJdLengthBucket(jdText),
          status_code: res.status,
        }, { awaitResponse: true });
        throw new Error(PUBLIC_SEARCH_CREATE_ERROR_MESSAGE);
      }

      const { id } = await res.json();
      void refresh();
      trackEvent(ANALYTICS_EVENTS.searchCreateSuccess, {
        ...analyticsContext,
        candidate_count: candidateCount,
        search_id: id,
        had_clarification: Boolean(userClarification),
      });
      await trackGrowthEvent("search_create_success", {
        candidate_count: candidateCount,
        jd_length_bucket: getJdLengthBucket(jdText),
        had_clarification: Boolean(userClarification),
      }, { awaitResponse: true });
      startTransition(() => {
        router.push(`/app/search/${id}`);
      });
    } catch (error) {
      setStage({
        type: "error",
        message: error instanceof Error ? error.message : PUBLIC_SEARCH_CREATE_ERROR_MESSAGE,
      });
    }
  }

  const canStart = jdText.trim().length >= 50 && !isOutOfSearches;
  const wordCount = useMemo(
    () => jdText.trim().split(/\s+/).filter(Boolean).length,
    [jdText],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
          New shortlist build
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Paste the client role and confirm the brief.
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Hirelix reads the JD, shows the search brief, then builds an evidence-backed technical shortlist.
        </p>
      </div>

      {/* JD input — always visible */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <textarea
          value={jdText}
          onChange={(e) => {
            if (jdText.trim().length === 0 && e.target.value.trim().length > 0) {
              void trackGrowthEvent("hero_input_start", {
                route: "/app/search/new",
                jd_length_bucket: getJdLengthBucket(e.target.value),
              });
            }
            setJdText(e.target.value);
            if (stage.type !== "input") setStage({ type: "input" });
          }}
          rows={14}
          placeholder="Paste the full client job description here..."
          disabled={stage.type === "analyzing" || stage.type === "launching" || isNavigating}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white disabled:opacity-60"
        />

        {isOutOfSearches && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-900">
                You&apos;ve used your free profile scan preview. Start a subscription to keep sourcing.
              </p>
              <PaddleCheckoutButton
                checkout={{ type: "plan", planCode: "starter_monthly" }}
                label="Start monthly"
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
              ? `${wordCount} words`
              : "Tip: the fuller the client role, the better the shortlist."}
          </p>
          {stage.type === "input" || stage.type === "error" ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={!canStart}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Build brief
            </button>
          ) : null}
        </div>

        {stage.type === "error" && (
          <p className="mt-3 text-sm text-red-500">{stage.message}</p>
        )}
      </div>

      {/* Confirmation area — shown after JD submitted */}
      {(stage.type === "analyzing" || stage.type === "confirming" || stage.type === "launching" || isNavigating) && (
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
              ) : stage.type === "confirming" ? (
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

          {stage.type === "confirming" && (
            <div className="ml-11 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                      Confirm search brief
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Edit the constraints that would change who you contact first.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Up to {candidateCount} qualified candidates
                  </span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Role title
                    <input
                      value={stage.brief.title}
                      onChange={(event) => updateConfirmingBrief({ title: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Minimum years
                    <input
                      inputMode="numeric"
                      value={stage.brief.experienceYearsMin}
                      onChange={(event) => updateConfirmingBrief({ experienceYearsMin: event.target.value })}
                      placeholder="Not specified"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Location / remote scope
                    <input
                      value={stage.brief.locationScope}
                      onChange={(event) => updateConfirmingBrief({ locationScope: event.target.value })}
                      placeholder="Remote, US, New York, etc."
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Work model
                    <select
                      value={stage.brief.workModel}
                      onChange={(event) => updateConfirmingBrief({ workModel: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                    >
                      <option value="unknown">Unknown</option>
                      <option value="remote">Remote</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="onsite">Onsite</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Must-have skills
                  <textarea
                    rows={3}
                    value={stage.brief.requiredSkillsText}
                    onChange={(event) => updateConfirmingBrief({ requiredSkillsText: event.target.value })}
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                  />
                </label>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Hard filters
                  <textarea
                    rows={3}
                    value={stage.brief.hardFiltersText}
                    onChange={(event) => updateConfirmingBrief({ hardFiltersText: event.target.value })}
                    placeholder="One hard filter per line, only if it changes who should be sourced."
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                  />
                </label>
              </div>
              {!stage.response.clarification.ready_to_launch && (
                <input
                  ref={replyInputRef}
                  type="text"
                  value={stage.reply}
                  onChange={(e) => setStage({ ...stage, reply: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleReply();
                    }
                  }}
                  placeholder="Reply to the clarification, or leave blank and launch..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400/20"
                />
              )}
              <div className="flex flex-wrap items-center justify-end gap-3">
                <p className="text-xs text-slate-400">
                  You can leave the task page after launch; Hirelix keeps running the shortlist.
                </p>
                <button
                  type="button"
                  onClick={() => void handleReply()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {stage.reply.trim() ? <Send className="h-4 w-4" /> : null}
                  Launch shortlist
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
