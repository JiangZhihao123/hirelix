"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookUser,
  FileText,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { fetchWithUserSession } from "@/lib/client-auth";
import { AgentText } from "@/components/AgentText";

type Person = {
  id: string;
  name: string;
  headline: string | null;
  note: string;
  profile_url: string | null;
  updated_at: string;
};
type Role = {
  id: string;
  title: string | null;
  jd_text: string;
  status: string;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetchWithUserSession(url);
  if (!response.ok)
    throw new Error("Could not load your private agent workspace");
  return response.json() as Promise<T>;
}

export default function PrivateAgentHome() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";
  const [people, setPeople] = useState<Person[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [memory, searches, conversation] = await Promise.all([
        loadJson<{ people: Person[] }>("/api/agent/people"),
        loadJson<{ searches: Role[] }>("/api/searches"),
        loadJson<{ messages: Message[] }>("/api/agent/chat"),
      ]);
      setPeople(memory.people);
      setRoles(searches.searches);
      setMessages(conversation.messages);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load the workspace",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (initialPrompt) setDraft(initialPrompt.slice(0, 4000));
  }, [initialPrompt]);
  useEffect(() => {
    if (!messages.length && !sending) return;
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages.length, sending]);

  async function sendMessage(text = draft) {
    const message = text.trim();
    if (!message || sending) return;
    setDraft("");
    setSending(true);
    setError("");
    const optimistic: Message = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await fetchWithUserSession("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, search_id: selectedRoleId || null }),
      });
      const payload = (await response.json()) as {
        question?: Message;
        response?: Message;
        error?: string;
      };
      if (!response.ok || !payload.question || !payload.response)
        throw new Error(payload.error || "The agent could not answer");
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        payload.question!,
        payload.response!,
      ]);
    } catch (cause) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimistic.id),
      );
      setDraft(message);
      setError(
        cause instanceof Error ? cause.message : "The agent could not answer",
      );
    } finally {
      setSending(false);
    }
  }

  const selectedRole = roles.find((role) => role.id === selectedRoleId);

  return (
    <div className="mx-auto max-w-[1480px]">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.19em] text-blue-600">
            Your private recruiting agent
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Work from what you know.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Bring a client role and the people you know. Ask for research,
            role-specific judgment, or a recommendation draft grounded in your
            own memory.
          </p>
        </div>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
          Private to your account
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
            <Link
              href="/app/search/new"
              className="group min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md sm:min-w-0"
            >
              <FileText className="h-5 w-5 text-blue-600" />
              <h2 className="mt-4 text-sm font-semibold text-slate-950">
                Understand a JD
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Start from a client role and examine its real requirements.
              </p>
              <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" />
            </Link>
            <Link
              href="/app/talent"
              className="group min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md sm:min-w-0"
            >
              <BookUser className="h-5 w-5 text-blue-600" />
              <h2 className="mt-4 text-sm font-semibold text-slate-950">
                Remember a person
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Keep your own notes and source context across roles.
              </p>
              <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" />
            </Link>
            <Link
              href="/app/briefs"
              className="group min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md sm:min-w-0"
            >
              <Sparkles className="h-5 w-5 text-blue-600" />
              <h2 className="mt-4 text-sm font-semibold text-slate-950">
                Draft a weekly brief
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Write a reviewable update from recorded evidence.
              </p>
              <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" />
            </Link>
          </div>

          <section
            className="flex min-h-[530px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            aria-label="Agent conversation"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <MessageCircle className="h-4 w-4 text-blue-600" /> Ask Hirelix
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Role context
                <select
                  value={selectedRoleId}
                  onChange={(event) => setSelectedRoleId(event.target.value)}
                  className="max-w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                >
                  <option value="">No role selected</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title || role.jd_text.slice(0, 50)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              ref={messagesRef}
              className="max-h-[460px] min-h-[310px] flex-1 space-y-5 overflow-y-auto px-5 py-6"
            >
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading your
                  workspace…
                </div>
              ) : messages.length === 0 ? (
                <div className="max-w-xl">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-950">
                    What would you like to think through?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    I can compare a JD with people you saved, explain the
                    evidence and gaps, or help shape a client update. I won’t
                    assume someone is available or interested without evidence.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      "Who in my talent memory might fit this role?",
                      "What do we still need to verify before recommending someone?",
                      "Summarize the people I have saved.",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setDraft(suggestion)}
                        className="rounded-full border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "whitespace-pre-wrap bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-800"}`}
                    >
                      {message.role === "user" ? (
                        message.content
                      ) : (
                        <AgentText content={message.content} />
                      )}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reviewing your
                  context…
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 p-4">
              {selectedRole && (
                <p className="mb-2 text-xs text-blue-700">
                  Using JD: {selectedRole.title || "Untitled role"}
                </p>
              )}
              <div className="flex items-end gap-3 rounded-xl border border-slate-200 p-2 focus-within:border-blue-400">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  placeholder="Ask about a role, a person, or your candidate memory…"
                  className="min-h-12 flex-1 resize-none border-0 bg-transparent p-2 text-sm text-slate-900 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!draft.trim() || sending || loading}
                  aria-label="Send message"
                  className="rounded-lg bg-blue-600 p-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Answers use saved memory and the selected JD. Verify important
                claims before sharing.
              </p>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-950">
                Your talent memory
              </h2>
              <Link
                href="/app/talent"
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                View all →
              </Link>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              People you chose to keep, with your own judgment and source
              context.
            </p>
            <div className="mt-4 space-y-2">
              {people.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  No one saved yet. Add a person or remember someone from an
                  existing search.
                </p>
              ) : (
                people.slice(0, 4).map((person) => (
                  <Link
                    key={person.id}
                    href={`/app/talent?person=${person.id}`}
                    className="block rounded-xl border border-slate-100 p-3 hover:border-blue-200 hover:bg-blue-50/30"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {person.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {person.headline || "Context saved in your memory"}
                    </p>
                    {person.note && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                        “{person.note}”
                      </p>
                    )}
                  </Link>
                ))
              )}
            </div>
            <Link
              href="/app/talent"
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
            >
              {people.length} saved {people.length === 1 ? "person" : "people"}{" "}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">
              How judgment works
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              A person’s fit belongs to a particular role. Hirelix keeps the
              person and your context, then reasons against each JD separately.
            </p>
          </div>
          <Link
            href="/app/searches"
            className="block rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-800 shadow-sm hover:border-blue-300"
          >
            Browse existing client roles{" "}
            <ArrowRight className="ml-2 inline h-4 w-4 text-blue-600" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
