"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookUser,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { fetchWithUserSession } from "@/lib/client-auth";

type Person = {
  id: string;
  name: string;
  headline: string | null;
  location: string | null;
  skills: string[];
  profile_url: string | null;
  note: string;
  source_candidate_id: string | null;
  source_evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
type Role = {
  id: string;
  title: string | null;
  jd_text: string;
  status: string;
};
type Candidate = {
  id: string;
  name: string;
  headline: string | null;
  location: string | null;
  profile_url: string | null;
  final_decision: string | null;
};

export default function TalentMemoryPage() {
  const params = useSearchParams();
  const requestedPersonId = params.get("person");
  const requestedRoleId = params.get("role");
  const [people, setPeople] = useState<Person[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"none" | "add" | "import">("none");
  const [form, setForm] = useState({
    name: "",
    headline: "",
    location: "",
    profile_url: "",
    skills: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [memoryRes, roleRes] = await Promise.all([
        fetchWithUserSession("/api/agent/people"),
        fetchWithUserSession("/api/searches"),
      ]);
      if (!memoryRes.ok || !roleRes.ok)
        throw new Error("Could not load talent memory");
      const memory = (await memoryRes.json()) as { people: Person[] };
      const roleData = (await roleRes.json()) as { searches: Role[] };
      setPeople(memory.people);
      setRoles(roleData.searches);
      setSelectedId(
        (current) =>
          current ?? requestedPersonId ?? memory.people[0]?.id ?? null,
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load talent memory",
      );
    } finally {
      setLoading(false);
    }
  }, [requestedPersonId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (requestedRoleId) {
      setSelectedRoleId(requestedRoleId);
      setMode("import");
    }
  }, [requestedRoleId]);
  useEffect(() => {
    if (!selectedRoleId) return;
    let alive = true;
    void fetchWithUserSession(`/api/searches/${selectedRoleId}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load candidates from this role");
        return response.json() as Promise<{ candidates: Candidate[] }>;
      })
      .then((data) => {
        if (alive) setCandidates(data.candidates);
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load candidates",
          );
      });
    return () => {
      alive = false;
    };
  }, [selectedRoleId]);

  const selected = people.find((person) => person.id === selectedId) ?? null;
  useEffect(() => {
    if (selected) setNote(selected.note);
  }, [selected]);
  const filtered = useMemo(
    () =>
      people.filter((person) =>
        [
          person.name,
          person.headline,
          person.location,
          person.note,
          ...person.skills,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [people, query],
  );
  const availableCandidates = candidates.filter(
    (candidate) =>
      !people.some((person) => person.source_candidate_id === candidate.id),
  );

  function selectPerson(person: Person) {
    setSelectedId(person.id);
    setNote(person.note);
    setMode("none");
  }

  async function addPerson() {
    if (!form.name.trim()) {
      setError("Add a name first");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithUserSession("/api/agent/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          skills: form.skills
            .split(",")
            .map((skill) => skill.trim())
            .filter(Boolean),
        }),
      });
      const data = (await response.json()) as {
        person?: Person;
        error?: string;
      };
      if (!response.ok || !data.person)
        throw new Error(data.error || "Could not save this person");
      setPeople((current) => [data.person!, ...current]);
      selectPerson(data.person);
      setForm({
        name: "",
        headline: "",
        location: "",
        profile_url: "",
        skills: "",
        note: "",
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this person",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importCandidate(candidate: Candidate) {
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithUserSession("/api/agent/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidate.id }),
      });
      const data = (await response.json()) as {
        person?: Person;
        error?: string;
      };
      if (!response.ok || !data.person)
        throw new Error(data.error || "Could not remember this person");
      setPeople((current) =>
        current.some((person) => person.id === data.person!.id)
          ? current
          : [data.person!, ...current],
      );
      selectPerson(data.person);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remember this person",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithUserSession(
        `/api/agent/people/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
      const data = (await response.json()) as {
        person?: Person;
        error?: string;
      };
      if (!response.ok || !data.person)
        throw new Error(data.error || "Could not save your note");
      setPeople((current) =>
        current.map((person) =>
          person.id === selected.id ? data.person! : person,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save your note",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePerson() {
    if (
      !selected ||
      !window.confirm(`Remove ${selected.name} from your private memory?`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithUserSession(
        `/api/agent/people/${selected.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not remove this person");
      const remaining = people.filter((person) => person.id !== selected.id);
      setPeople(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setNote(remaining[0]?.note ?? "");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove this person",
      );
    } finally {
      setBusy(false);
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
            Private memory
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            The people you know.
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Save people and your own observations once. Ask the agent to
            reconsider them for each new role.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("import")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-300"
          >
            Remember from a search
          </button>
          <button
            type="button"
            onClick={() => setMode("add")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Add a person
          </button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}
      {mode !== "none" && (
        <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {mode === "add"
                ? "Add someone you know"
                : "Remember someone from a previous search"}
            </h2>
            <button
              type="button"
              onClick={() => setMode("none")}
              className="text-xs text-slate-600 hover:underline"
            >
              Close
            </button>
          </div>
          {mode === "add" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(["name", "headline", "location", "profile_url"] as const).map(
                (field) => (
                  <label
                    key={field}
                    className="text-xs font-medium capitalize text-slate-600"
                  >
                    {field.replace("_", " ")}
                    {field === "name" && " *"}
                    <input
                      value={form[field]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-400"
                    />
                  </label>
                ),
              )}
              <label className="md:col-span-2 text-xs font-medium text-slate-600">
                Skills or specialties (comma separated)
                <input
                  value={form.skills}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      skills: event.target.value,
                    }))
                  }
                  placeholder="Kubernetes, AWS, platform engineering"
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-400"
                />
              </label>
              <label className="md:col-span-2 text-xs font-medium text-slate-600">
                Your note
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="What do you actually know about this person?"
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                />
              </label>
              <button
                type="button"
                onClick={() => void addPerson()}
                disabled={busy || !form.name.trim()}
                className="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save to my memory"}
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <select
                value={selectedRoleId}
                onChange={(event) => {
                  setSelectedRoleId(event.target.value);
                  setCandidates([]);
                }}
                className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                <option value="">Choose a client role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title || role.jd_text.slice(0, 50)}
                  </option>
                ))}
              </select>
              {selectedRoleId && (
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {availableCandidates.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      No unsaved people from this role.
                    </p>
                  ) : (
                    availableCandidates.slice(0, 80).map((candidate) => (
                      <div
                        key={candidate.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {candidate.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {candidate.headline ||
                              candidate.location ||
                              "From your search"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void importCandidate(candidate)}
                          className="shrink-0 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                        >
                          Remember
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, role, skills, or your notes…"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-400"
              />
            </label>
            <p className="mt-3 text-xs text-slate-500">
              {filtered.length} of {people.length} saved people
            </p>
          </div>
          <div className="max-h-[650px] min-h-[350px] overflow-y-auto p-3">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{" "}
                Loading…
              </p>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <BookUser className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm text-slate-600">
                  {people.length
                    ? "No people match that search."
                    : "Your private memory is empty. Add a person to begin."}
                </p>
              </div>
            ) : (
              filtered.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => selectPerson(person)}
                  className={`mb-2 block w-full rounded-xl border p-4 text-left transition ${selectedId === person.id ? "border-blue-400 bg-blue-50/50" : "border-slate-100 hover:border-blue-200 hover:bg-slate-50"}`}
                >
                  <p className="font-semibold text-slate-950">{person.name}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {person.headline || "No role recorded"}
                    {person.location ? ` · ${person.location}` : ""}
                  </p>
                  {person.note && (
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">
                      “{person.note}”
                    </p>
                  )}
                  <p className="mt-3 text-[11px] text-slate-400">
                    Saved {new Date(person.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                Person in your memory
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                {selected.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {selected.headline || "No role recorded"}
                {selected.location ? ` · ${selected.location}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.skills.slice(0, 8).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                  >
                    {skill}
                  </span>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-800">
                  What you know
                </p>
                <textarea
                  rows={7}
                  value={selectedId === selected.id ? note : selected.note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={5000}
                  placeholder="Record a conversation, a preference, or your own judgment. Keep uncertain facts labeled as such."
                  className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-800 outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => void saveNote()}
                  disabled={busy || note === selected.note}
                  className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  Save note
                </button>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-800">
                  Provenance
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {selected.source_candidate_id
                    ? "Saved from one of your client-role searches. Its original fit judgment belongs to that JD."
                    : "Added by you. The note is your own observation."}
                </p>
                {selected.profile_url && (
                  <a
                    href={selected.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    Open source profile <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href={`/app?prompt=${encodeURIComponent(`What do we know about ${selected.name}, and what is still unverified?`)}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Ask the agent
                </Link>
                <button
                  type="button"
                  onClick={() => void removePerson()}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </>
          ) : (
            <div className="flex min-h-[350px] flex-col items-center justify-center text-center">
              <BookUser className="h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Select a person to see and edit what your agent remembers.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
