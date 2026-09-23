"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clipboard,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { fetchWithUserSession } from "@/lib/client-auth";
import { AgentText } from "@/components/AgentText";

type Brief = {
  id: string;
  search_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};
type Role = {
  id: string;
  title: string | null;
  jd_text: string;
  status: string;
};

export default function AgentBriefsPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [briefRes, roleRes] = await Promise.all([
        fetchWithUserSession("/api/agent/briefs"),
        fetchWithUserSession("/api/searches"),
      ]);
      if (!briefRes.ok || !roleRes.ok)
        throw new Error("Could not load your briefs");
      const briefData = (await briefRes.json()) as { briefs: Brief[] };
      const roleData = (await roleRes.json()) as { searches: Role[] };
      setBriefs(briefData.briefs);
      setRoles(roleData.searches);
      setSelectedBriefId(
        (current) => current ?? briefData.briefs[0]?.id ?? null,
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load your briefs",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = briefs.find((brief) => brief.id === selectedBriefId) ?? null;
  useEffect(() => {
    if (selected && !editing) setContent(selected.content);
  }, [selected, editing]);

  async function createBrief() {
    if (!selectedRoleId) {
      setError("Choose a client role first");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithUserSession("/api/agent/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: selectedRoleId }),
      });
      const data = (await response.json()) as { brief?: Brief; error?: string };
      if (!response.ok || !data.brief)
        throw new Error(data.error || "Could not draft this brief");
      setBriefs((current) => [data.brief!, ...current]);
      setSelectedBriefId(data.brief.id);
      setContent(data.brief.content);
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not draft this brief",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateBrief(revision = false) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithUserSession(
        `/api/agent/briefs/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(revision ? { instruction } : { content }),
        },
      );
      const data = (await response.json()) as { brief?: Brief; error?: string };
      if (!response.ok || !data.brief)
        throw new Error(data.error || "Could not update this brief");
      setBriefs((current) =>
        current.map((brief) =>
          brief.id === selected.id ? data.brief! : brief,
        ),
      );
      setContent(data.brief.content);
      setInstruction("");
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update this brief",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyBrief() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not copy this brief. Select the text instead.");
    }
  }

  return (
    <div className="mx-auto max-w-[1480px]">
      <Link
        href="/app"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Agent
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
            Agent work product
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Weekly recommendation briefs.
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Draft a client update from a JD and your private candidate memory.
            Review every claim before sharing.
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          Drafts are never sent automatically
        </span>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}
      <div className="mt-6 grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_290px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Saved drafts</h2>
          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="text-xs text-slate-500">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{" "}
                Loading…
              </p>
            ) : briefs.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                No briefs yet. Choose a role and ask your agent to draft one.
              </p>
            ) : (
              briefs.map((brief) => (
                <button
                  key={brief.id}
                  type="button"
                  onClick={() => {
                    setSelectedBriefId(brief.id);
                    setContent(brief.content);
                    setEditing(false);
                  }}
                  className={`w-full rounded-lg border p-3 text-left ${selectedBriefId === brief.id ? "border-blue-300 bg-blue-50" : "border-slate-100 hover:border-blue-200"}`}
                >
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {brief.title}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {new Date(brief.updated_at).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>
        <section className="min-h-[620px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.13em] text-blue-600">
                    Recommendation brief · Draft
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {new Date(selected.created_at).toLocaleString()} ·
                    Human review required
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void copyBrief()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Clipboard className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing((value) => !value)}
                    className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  >
                    {editing ? "Preview" : "Edit"}
                  </button>
                </div>
              </div>
              <div className="mt-6">
                {editing ? (
                  <>
                    <textarea
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={24}
                      maxLength={30000}
                      className="w-full rounded-xl border border-slate-200 p-4 font-mono text-sm leading-6 text-slate-800 outline-none focus:border-blue-400"
                    />
                    <button
                      type="button"
                      disabled={busy || !content.trim()}
                      onClick={() => void updateBrief()}
                      className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Save draft
                    </button>
                  </>
                ) : (
                  <AgentText
                    content={content}
                    className="space-y-3 text-slate-700"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
              <FileText className="h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                A client update that earns its claims.
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                Select a role to create a first draft grounded in people you
                saved. Gaps and unverified changes stay visible.
              </p>
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Ask your agent to draft
              </h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              The agent compares saved people with this JD. It won’t invent new
              contact or market activity.
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Client role
              <select
                value={selectedRoleId}
                onChange={(event) => setSelectedRoleId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900"
              >
                <option value="">Choose a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title || role.jd_text.slice(0, 50)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !selectedRoleId}
              onClick={() => void createBrief()}
              className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Working…" : "Draft weekly brief"}
            </button>
            <Link
              href="/app/search/new"
              className="mt-3 block text-center text-xs text-blue-600 hover:underline"
            >
              Add a client role
            </Link>
          </div>
          {selected && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Ask for a revision
              </h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Try “Lead with the evidence gaps” or “Make this shorter.” Save
                any manual edits first.
              </p>
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Tell your agent what to change…"
                className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 outline-none focus:border-blue-400"
              />
              <button
                type="button"
                disabled={busy || editing || !instruction.trim()}
                onClick={() => void updateBrief(true)}
                className="mt-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 disabled:opacity-40"
              >
                Revise draft
              </button>
            </div>
          )}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-xs leading-5 text-slate-700">
            A weekly brief is a deliverable, not proof of new weekly activity.
            If your memory has no dated updates, the draft should say so.
          </div>
        </aside>
      </div>
    </div>
  );
}
