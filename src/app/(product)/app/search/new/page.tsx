"use client";

import { useState, useEffect, type FormEvent, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PaddleCheckoutButton } from "@/components/PaddleCheckoutButton";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromParams,
  trackEvent,
} from "@/lib/analytics";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useBilling } from "@/lib/use-billing";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

const FIXED_CANDIDATE_COUNT = 20;

type WorkModel = "onsite" | "hybrid" | "remote" | "unknown";
type LocationFlexibility = "strict" | "moderate" | "flexible";
type RelocationAllowed = "yes" | "no" | "unknown";

type ParsedSummary = {
  title: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  experienceYearsMin: number | null;
  workModel: WorkModel;
  locationScope: string | null;
  locationFlexibility: LocationFlexibility;
  relocationAllowed: RelocationAllowed;
  mustHaveConstraints: string[];
  softConstraints: string[];
  constraintReasoning: string | null;
};

type ParsedResponse = {
  parsed_requirements: Record<string, unknown>;
  summary: ParsedSummary;
};

type EditableBrief = {
  title: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  experienceYearsMin: string;
  workModel: WorkModel;
  locationScope: string;
  locationFlexibility: LocationFlexibility;
  relocationAllowed: RelocationAllowed;
  mustHaveConstraints: string[];
  softConstraints: string[];
  constraintReasoning: string;
};

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function TagEditor({
  label,
  description,
  tags,
  onChange,
  accent = "sky",
  placeholder,
}: {
  label: string;
  description: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  accent?: "sky" | "amber" | "slate";
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const accentStyles = {
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  } as const;

  function addTag(rawValue: string) {
    const next = normalizeTag(rawValue);
    if (!next) return;
    if (tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, next]);
    setDraft("");
  }

  function removeTag(tagToRemove: string) {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${accentStyles[accent]}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5 transition-colors hover:bg-black/5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="rounded-full border border-dashed border-slate-200 px-3 py-1 text-xs text-slate-400">
            No tags yet
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag(draft);
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
        />
        <button
          type="button"
          onClick={() => addTag(draft)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  );
}

function buildEditorState(summary: ParsedSummary): EditableBrief {
  return {
    title: summary.title,
    requiredSkills: summary.requiredSkills,
    niceToHaveSkills: summary.niceToHaveSkills,
    experienceYearsMin:
      typeof summary.experienceYearsMin === "number"
        ? String(summary.experienceYearsMin)
        : "",
    workModel: summary.workModel,
    locationScope: summary.locationScope || "",
    locationFlexibility: summary.locationFlexibility,
    relocationAllowed: summary.relocationAllowed,
    mustHaveConstraints: summary.mustHaveConstraints,
    softConstraints: summary.softConstraints,
    constraintReasoning: summary.constraintReasoning || "",
  };
}

function inferTitleFromJdText(jdText: string) {
  const firstMeaningfulLine = jdText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 4);
  if (!firstMeaningfulLine) return "";
  return firstMeaningfulLine
    .replace(/^job title[:\s-]*/i, "")
    .replace(/^role[:\s-]*/i, "")
    .slice(0, 80)
    .trim();
}

function buildFallbackEditorState(jdText: string): EditableBrief {
  return {
    title: inferTitleFromJdText(jdText),
    requiredSkills: [],
    niceToHaveSkills: [],
    experienceYearsMin: "",
    workModel: "unknown",
    locationScope: "",
    locationFlexibility: "moderate",
    relocationAllowed: "unknown",
    mustHaveConstraints: [],
    softConstraints: [],
    constraintReasoning: "AI parse did not finish cleanly, so this brief is in manual mode.",
  };
}

function buildParsedOverride(
  base: Record<string, unknown>,
  brief: EditableBrief,
) {
  const hiringBrief =
    base.hiring_brief && typeof base.hiring_brief === "object"
      ? { ...(base.hiring_brief as Record<string, unknown>) }
      : {};
  const roleCore =
    hiringBrief.role_core && typeof hiringBrief.role_core === "object"
      ? { ...(hiringBrief.role_core as Record<string, unknown>) }
      : {};
  const recallSpec =
    base.recall_spec && typeof base.recall_spec === "object"
      ? { ...(base.recall_spec as Record<string, unknown>) }
      : {};

  return {
    ...base,
    title: brief.title.trim(),
    required_skills: brief.requiredSkills,
    nice_to_have_skills: brief.niceToHaveSkills,
    location: brief.locationScope.trim() || null,
    experience_years_min:
      brief.experienceYearsMin.trim().length > 0
        ? Number.parseInt(brief.experienceYearsMin, 10)
        : null,
    hiring_brief: {
      ...hiringBrief,
      role_core: {
        ...roleCore,
        title: brief.title.trim(),
        required_skills: brief.requiredSkills,
        nice_to_have_skills: brief.niceToHaveSkills,
      },
      work_model: brief.workModel,
      location_scope: brief.locationScope.trim() || null,
      location_flexibility: brief.locationFlexibility,
      relocation_allowed: brief.relocationAllowed,
      must_have_constraints: brief.mustHaveConstraints,
      soft_constraints: brief.softConstraints,
      constraint_reasoning: brief.constraintReasoning.trim() || null,
    },
    recall_spec: {
      ...recallSpec,
      title_variants:
        Array.isArray(recallSpec.title_variants) && recallSpec.title_variants.length > 0
          ? recallSpec.title_variants
          : [brief.title.trim()],
      core_skill_terms: brief.requiredSkills.length > 0
        ? brief.requiredSkills
        : Array.isArray(recallSpec.core_skill_terms)
          ? recallSpec.core_skill_terms
          : [],
      must_have_signals: brief.requiredSkills,
    },
  };
}

export default function NewSearchPage() {
  const { billing, refresh } = useBilling();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jdText, setJdText] = useState("");
  const [parsedResponse, setParsedResponse] = useState<ParsedResponse | null>(null);
  const [editor, setEditor] = useState<EditableBrief | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [parseStatus, setParseStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isNavigating, startTransition] = useTransition();
  const hasTrackedViewRef = useRef(false);
  const analyticsContext = getAnalyticsContextFromParams(searchParams);
  const prefilledJd = searchParams.get("jd")?.trim() || "";

  useEffect(() => {
    const prefill = searchParams.get("jd");
    if (prefill) setJdText(prefill);
  }, [searchParams]);

  useEffect(() => {
    if (hasTrackedViewRef.current) return;
    hasTrackedViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.newSearchView, {
      ...analyticsContext,
      has_prefilled_jd: Boolean(prefilledJd),
    });
  }, [analyticsContext, prefilledJd]);

  function updateEditor<K extends keyof EditableBrief>(key: K, value: EditableBrief[K]) {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleAnalyze() {
    if (jdText.trim().length < 50) {
      setParseStatus("error");
      setErrorMsg("请先粘贴完整 JD，至少 50 个字符。");
      return;
    }

    setParseStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetchWithUserSession("/api/search/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jd_text: jdText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to parse JD");
      }

      const data = (await res.json()) as ParsedResponse;
      setParsedResponse(data);
      setEditor(buildEditorState(data.summary));
      setParseStatus("ready");
    } catch (error) {
      setParseStatus("error");
      setErrorMsg(error instanceof Error ? error.message : "Failed to parse JD");
      setEditor(buildFallbackEditorState(jdText));
      setParsedResponse(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editor) {
      await handleAnalyze();
      return;
    }

    trackEvent(ANALYTICS_EVENTS.primaryProductCtaClick, {
      ...analyticsContext,
      candidate_count: FIXED_CANDIDATE_COUNT,
      jd_word_count: jdText.trim().split(/\s+/).filter(Boolean).length,
      plan_code: billing?.subscription.planCode ?? billing?.plan.code ?? "unknown",
      cta_surface: "job_brief_confirmed",
      primary_context: "start",
    });

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetchWithUserSession("/api/search/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jd_text: jdText.trim(),
          candidate_count: FIXED_CANDIDATE_COUNT,
          parsed_requirements_override: buildParsedOverride(
            parsedResponse?.parsed_requirements || {},
            editor,
          ),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          void refresh();
        }
        throw new Error(data.error || "Failed to create sourcing task");
      }

      const { id } = await res.json();
      void refresh();
      trackEvent(ANALYTICS_EVENTS.searchCreateSuccess, {
        ...analyticsContext,
        candidate_count: FIXED_CANDIDATE_COUNT,
        jd_word_count: jdText.trim().split(/\s+/).filter(Boolean).length,
        search_id: id,
      });
      startTransition(() => {
        router.push(`/app/search/${id}`);
      });
    } catch (error) {
      setStatus("error");
      setErrorMsg(
        error instanceof Error ? error.message : "Something went wrong",
      );
    }
  }

  const canAnalyze = jdText.trim().length >= 50 && parseStatus !== "loading";
  const isReadyToLaunch = Boolean(editor);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-[32px] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.30),_transparent_28%),linear-gradient(180deg,#fdfefe_0%,#f5f8fc_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Hirelix MVP workflow
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Paste the JD, confirm the brief, then start sourcing.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          这条主线现在只做一件事：帮技术猎头把 JD 变成可编辑的搜索 brief，再进入候选人列表、GitHub 信号验证和个性化触达。
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
          {[
            "1. Parse job description",
            "2. Confirm must-have skills",
            "3. Source top 20 candidates",
            "4. Review GitHub-backed profiles",
          ].map((step) => (
            <span key={step} className="rounded-full border border-white/80 bg-white/80 px-3 py-1 shadow-sm">
              {step}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText className="h-4 w-4 text-sky-600" />
            Original JD
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            先贴完整 JD。Hirelix 会提取 must-have、加分项、年限和地域约束，给你一个可以手动调整的技术猎头 brief。
          </p>
          <textarea
            value={jdText}
            onChange={(event) => {
              setJdText(event.target.value);
              setParsedResponse(null);
              setEditor(null);
              setParseStatus("idle");
            }}
            rows={14}
            placeholder="Paste the full job description here..."
            className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
          />

          {billing?.usage.searchesRemaining === 0 && billing.plan.code === "free" && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-900">
                  You&apos;ve used all sourcing runs for this billing cycle. Upgrade to continue.
                </p>
                <PaddleCheckoutButton
                  checkout={{ type: "plan", planCode: "pro_monthly" }}
                  label="Upgrade plan"
                  onError={(message) => {
                    setStatus("error");
                    setErrorMsg(message);
                  }}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 sm:w-auto"
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {jdText.trim().length > 0
                ? `${jdText.trim().split(/\s+/).filter(Boolean).length} words`
                : "Tip: the fuller the JD, the cleaner the parsed brief."}
            </p>
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={!canAnalyze}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {parseStatus === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing JD...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4" />
                  Analyze JD
                </>
              )}
            </button>
          </div>
        </div>

          {editor && (
          <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                  Confirm search brief
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Review what Hirelix will search for
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  {parseStatus === "error"
                    ? "AI parse 这次没有稳定完成，所以这里已经切到手动 brief 模式。你仍然可以补 title、技能、年限和地域后继续发起搜索。"
                    : "这里就是发起搜索前的人工校准层。你可以改 title、技能、年限和地域，避免 AI 误解 JD。"}
                </p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
                <p className="font-semibold text-slate-900">Result size</p>
                <p className="mt-1">Top {FIXED_CANDIDATE_COUNT} candidates per run</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="text-sm font-semibold text-slate-900">Role title</label>
                <input
                  type="text"
                  value={editor.title}
                  onChange={(event) => updateEditor("title", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="text-sm font-semibold text-slate-900">Min years</label>
                  <input
                    type="number"
                    min="0"
                    value={editor.experienceYearsMin}
                    onChange={(event) => updateEditor("experienceYearsMin", event.target.value)}
                    placeholder="Optional"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="text-sm font-semibold text-slate-900">Work model</label>
                  <select
                    value={editor.workModel}
                    onChange={(event) => updateEditor("workModel", event.target.value as WorkModel)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  >
                    <option value="unknown">Unknown</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">Onsite</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPin className="h-4 w-4 text-sky-600" />
                  Location scope
                </label>
                <input
                  type="text"
                  value={editor.locationScope}
                  onChange={(event) => updateEditor("locationScope", event.target.value)}
                  placeholder="Remote, NYC, London, EU, etc."
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                />
              </div>
              <div className="grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="text-sm font-semibold text-slate-900">Location flexibility</label>
                  <select
                    value={editor.locationFlexibility}
                    onChange={(event) =>
                      updateEditor("locationFlexibility", event.target.value as LocationFlexibility)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  >
                    <option value="strict">Strict</option>
                    <option value="moderate">Moderate</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="text-sm font-semibold text-slate-900">Relocation</label>
                  <select
                    value={editor.relocationAllowed}
                    onChange={(event) =>
                      updateEditor("relocationAllowed", event.target.value as RelocationAllowed)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  >
                    <option value="unknown">Unknown</option>
                    <option value="yes">Allowed</option>
                    <option value="no">Not allowed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <TagEditor
                label="Must-have skills"
                description="这些技能会直接影响候选人排序和 GitHub 信号解读。"
                tags={editor.requiredSkills}
                onChange={(tags) => updateEditor("requiredSkills", tags)}
                accent="sky"
                placeholder="Add a required skill"
              />
              <TagEditor
                label="Nice-to-have skills"
                description="加分项用于解释性排序，不会像 must-have 一样强约束。"
                tags={editor.niceToHaveSkills}
                onChange={(tags) => updateEditor("niceToHaveSkills", tags)}
                accent="amber"
                placeholder="Add a nice-to-have skill"
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <TagEditor
                label="Must-have constraints"
                description="例如 location、visa、团队阶段偏好等。"
                tags={editor.mustHaveConstraints}
                onChange={(tags) => updateEditor("mustHaveConstraints", tags)}
                accent="slate"
                placeholder="Add a hard constraint"
              />
              <TagEditor
                label="Soft constraints"
                description="会显示在结果解释里，帮助你理解为什么有人分数略低。"
                tags={editor.softConstraints}
                onChange={(tags) => updateEditor("softConstraints", tags)}
                accent="slate"
                placeholder="Add a soft preference"
              />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <label className="text-sm font-semibold text-slate-900">Constraint reasoning</label>
              <textarea
                value={editor.constraintReasoning}
                onChange={(event) => updateEditor("constraintReasoning", event.target.value)}
                rows={4}
                placeholder="Explain how strict the search should be..."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
              />
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">What happens after launch</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                {[
                  "LinkedIn recall",
                  "Top 20 ranked candidates",
                  "Resume + GitHub signal view",
                  "Personalized outreach drafts",
                ].map((item) => (
                  <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={
                status === "loading" ||
                isNavigating ||
                parseStatus === "loading" ||
                !isReadyToLaunch ||
                (billing?.usage.searchesRemaining === 0 && billing.plan.code === "free")
              }
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" || isNavigating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening workbench...
                </>
              ) : !isReadyToLaunch ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analyze JD first
                </>
              ) : (
                <>
                  Start sourcing <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-500">
            搜索启动后，结果页会聚焦在技术猎头工作台：左侧候选人列表，右侧画像和 GitHub 信号，右下角生成触达邮件。
          </p>
          {parseStatus === "ready" && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Brief ready for launch
            </p>
          )}
          {parseStatus === "error" && editor && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Manual brief mode is ready
            </p>
          )}
          {(status === "error" || parseStatus === "error") && (
            <p className="mt-3 text-sm text-red-500">{errorMsg}</p>
          )}
        </div>
      </form>
    </div>
  );
}
