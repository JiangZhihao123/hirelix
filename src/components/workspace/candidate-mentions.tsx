"use client";

import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import { UserRound, X } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { ComposerReference } from "./composer-reference";
import { api } from "./client";
import { candidateMentionAt, candidateReferences, type CandidateReference } from "@/lib/workspace/candidate-references";

type Match = CandidateReference & { headline: string; location: string };
export function useCandidateMentions(storageKey: string, composer: RefObject<HTMLTextAreaElement | null>, setDraft: (text: string) => void) {
  const t = useT();
  const key = `${storageKey}:candidates`;
  const [stored, setStored] = useState<{ key: string; references: CandidateReference[] }>({ key: "", references: [] });
  const references = stored.key === key ? stored.references : [];
  const [token, setToken] = useState<ReturnType<typeof candidateMentionAt>>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let restored: CandidateReference[] = [];
    try { restored = candidateReferences(JSON.parse(localStorage.getItem(key) || "[]")); } catch { /* An invalid local draft has no references. */ }
    // Restore external browser storage when the conversation draft changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored({ key, references: restored });
    setToken(null);
  }, [key]);
  useEffect(() => {
    if (stored.key !== key) return;
    if (stored.references.length) localStorage.setItem(key, JSON.stringify(stored.references));
    else localStorage.removeItem(key);
  }, [stored, key]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const timer = setTimeout(() => {
      void api<{ people: Match[] }>(`/people?view=mentions&q=${encodeURIComponent(token.query)}`).then(result => {
        if (active) setMatches(result.people);
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load candidates"); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [token]);
  function update(text: string, caret: number) {
    setDraft(text);
    const next = references.filter(item => text.includes(`@${item.name}`));
    setStored({ key, references: next });
    setLoading(true); setError(""); setMatches([]); setSelected(0);
    setToken(candidateMentionAt(text, caret, next));
  }
  function startMention() {
    const value = composer.current?.value || "";
    const text = value + (value && !/\s$/.test(value) ? " " : "") + "@";
    update(text, text.length);
    requestAnimationFrame(() => {
      composer.current?.focus();
      composer.current?.setSelectionRange(text.length, text.length);
    });
  }
  function choose(person: Match) {
    if (!token || !composer.current) return;
    const value = composer.current.value;
    const insertion = `@${person.name} `;
    setDraft(value.slice(0, token.start) + insertion + value.slice(token.end));
    if (!references.some(item => item.id === person.id)) setStored({ key, references: [...references, { id: person.id, name: person.name }] });
    setToken(null);
    const caret = token.start + insertion.length;
    requestAnimationFrame(() => { composer.current?.focus(); composer.current?.setSelectionRange(caret, caret); });
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!token || event.nativeEvent.isComposing) return false;
    if (event.key === "Escape") { setToken(null); event.preventDefault(); return true; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(current => matches.length ? (current + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length : 0);
      return true;
    }
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (matches[selected]) choose(matches[selected]); return true; }
    return false;
  }
  const picker = token && <div className="ws-mention-picker" id="candidate-mentions" role="listbox" aria-label={t("Reference a candidate")} onMouseDown={event => event.preventDefault()}>
    <header><span>{t("Reference a candidate")}</span><button type="button" className="ws-icon" aria-label={t("Close")} onClick={() => setToken(null)}><X size={14} /></button></header>
    {loading ? <p>{t("Searching…")}</p> : error ? <p role="alert">{t(error)}</p> : !matches.length ? <p>{t("No matching candidates. Try another name.")}</p> : matches.map((person, index) => <button id={`candidate-mention-${index}`} type="button" key={person.id} role="option" aria-selected={index === selected} disabled={references.length >= 20 && !references.some(item => item.id === person.id)} onClick={() => choose(person)}>
      <UserRound size={16} /><span><strong>{person.name}</strong><small>{[person.headline, person.location].filter(Boolean).join(" · ")}</small></span>
    </button>)}
  </div>;
  const tags = !!references.length && <div className="ws-composer-context-tags">{references.map(person => <ComposerReference key={person.id} kind="candidate" name={person.name} removeLabel={`${t("Remove candidate reference")}: ${person.name}`} onRemove={() => {
    setStored({ key, references: references.filter(item => item.id !== person.id) });
    setDraft((composer.current?.value || "").replace(`@${person.name}`, person.name));
    composer.current?.focus();
  }} />)}</div>;
  return { references, picker, tags, startMention, update, onKeyDown, open: !!token, selectedId: token && matches[selected] ? `candidate-mention-${selected}` : undefined, clear: () => { setStored({ key, references: [] }); setToken(null); localStorage.removeItem(key); } };
}
