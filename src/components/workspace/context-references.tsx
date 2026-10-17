"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Check, BriefcaseBusiness, UserRound, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { api } from "./client";
import { ComposerReference } from "./composer-reference";
import { candidateMentionAt } from "@/lib/workspace/candidate-references";

type Reference = { kind: "candidate" | "role"; id: string; name: string; detail: string; title?: string; client_name?: string };
type Filter = "all" | Reference["kind"];
export function useContextReferences(storageKey: string, composer: RefObject<HTMLTextAreaElement | null>, setDraft: (text: string) => void) {
  const { locale } = useLanguage(), zh = locale === "zh";
  const key = `${storageKey}:references`;
  const [stored, setStored] = useState<{key: string; items: Reference[]}>({key: "", items: []});
  const references = stored.key === key ? stored.items : [];
  const [open, setOpen] = useState(false), [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(""), [matches, setMatches] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const token = useRef<ReturnType<typeof candidateMentionAt>>(null);
  const panel = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let items: Reference[] = [];
    try { const value = JSON.parse(localStorage.getItem(key) || "[]"); if (Array.isArray(value)) items = value.filter(item => item && ["role", "candidate"].includes(item.kind) && typeof item.id === "string" && typeof item.name === "string"); } catch {}
    // Restore the independently saved draft for this conversation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored({key, items}); setOpen(false); token.current = null;
  }, [key]);
  useEffect(() => {
    if (stored.key !== key) return;
    if (stored.items.length) localStorage.setItem(key, JSON.stringify(stored.items)); else localStorage.removeItem(key);
  }, [key, stored]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      void Promise.all([
        filter !== "role" ? api<{people: Array<{id:string;name:string;headline:string;location:string;company?:string}>}>(`/people?view=mentions&q=${encodeURIComponent(query)}`) : Promise.resolve({people: []}),
        filter !== "candidate" ? api<{roles: Array<{id:string;title:string;client_name:string;status:string}>}>(`/roles?view=list&q=${encodeURIComponent(query)}`) : Promise.resolve({roles: []}),
      ]).then(([people, roles]) => {
        if (!active) return;
        setMatches([
          ...people.people.map(person => ({kind: "candidate" as const, id: person.id, name: person.name, detail: [person.headline, person.company, person.location].filter(Boolean).join(" · ")})),
          ...roles.roles.map(role => ({kind: "role" as const, id: role.id, name: role.title, title: role.title, client_name: role.client_name, detail: [role.client_name, role.status].filter(Boolean).join(" · ")})),
        ]);
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Search failed"); }).finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [open, filter, query]);
  function close() { setOpen(false); token.current = null; }
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && event.target !== composer.current && !(event.target instanceof Element && event.target.closest('[data-reference-trigger]'))) close();
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, composer]);
  function refresh(nextQuery: string, nextFilter = filter) {
    if (open && nextQuery === query && nextFilter === filter) return;
    setLoading(true); setError(""); setMatches([]); setSelected(0); setQuery(nextQuery); setFilter(nextFilter);
  }
  function start(nextFilter: Filter) {
    token.current = null; refresh("", nextFilter); setOpen(true);
    requestAnimationFrame(() => search.current?.focus());
  }
  function update(text: string, caret: number) {
    setDraft(text);
    const next = candidateMentionAt(text, caret, []);
    token.current = next;
    if (next) { refresh(next.query, "all"); setOpen(true); } else close();
  }
  function choose(item: Reference) {
    if (!references.some(ref => ref.id === item.id && ref.kind === item.kind)) {
      if (references.filter(ref => ref.kind === item.kind).length >= 20) return;
      setStored({key, items: [...references, item]});
    }
    if (token.current && composer.current) {
      const value = composer.current.value, insertion = item.name + " ", position = token.current.start;
      setDraft(value.slice(0, position) + insertion + value.slice(token.current.end));
      close();
      requestAnimationFrame(() => { composer.current?.focus(); composer.current?.setSelectionRange(position + insertion.length, position + insertion.length); });
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (!open || event.nativeEvent.isComposing) return false;
    if (event.key === "Escape") { event.preventDefault(); close(); composer.current?.focus(); return true; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setSelected(current => matches.length ? (current + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length : 0); return true;
    }
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (matches[selected]) choose(matches[selected]); return true; }
    return false;
  }
  const picker = open && <div ref={panel} className="ws-reference-picker" role="dialog" aria-label={zh ? "关联资料" : "Link context"}>
    <header><strong>{zh ? "关联资料" : "Link context"}</strong><button type="button" className="ws-icon" aria-label={zh ? "关闭" : "Close"} onClick={() => { close(); composer.current?.focus(); }}><X size={14}/></button></header>
    <input ref={search} aria-label={zh ? "搜索职位或候选人" : "Search roles or candidates"} placeholder={zh ? "搜索姓名、职位或公司…" : "Search by name, role or company…"} value={query} onChange={event => refresh(event.target.value)} onKeyDown={onKeyDown}/>
    <div className="ws-reference-filters">{(["all", "role", "candidate"] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { refresh(query, value); search.current?.focus(); }}>{value === "all" ? (zh ? "全部" : "All") : value === "role" ? (zh ? "职位" : "Roles") : (zh ? "候选人" : "Candidates")}</button>)}</div>
    <div className="ws-reference-results" role="listbox" id="context-reference-options" aria-label={zh ? "搜索结果" : "Search results"} aria-multiselectable="true">
      {loading ? <p>{zh ? "搜索中…" : "Searching…"}</p> : error ? <p role="alert">{error}</p> : !matches.length ? <p>{zh ? "没有找到匹配资料，请尝试其他关键词。" : "No matching records. Try another search."}</p> : matches.map((item, index) => {
        const picked = references.some(ref => ref.id === item.id && ref.kind === item.kind);
        return <button type="button" role="option" id={`context-reference-${index}`} key={`${item.kind}:${item.id}`} aria-selected={picked} className={index === selected ? "is-focused" : ""} onClick={() => choose(item)} disabled={!picked && references.filter(ref => ref.kind === item.kind).length >= 20}>
          {item.kind === "role" ? <BriefcaseBusiness size={17}/> : <UserRound size={17}/>}
          <span><small>{item.kind === "role" ? (zh ? "职位" : "Role") : (zh ? "候选人" : "Candidate")}</small><strong>{item.name}</strong><small>{item.detail}</small></span>{picked && <Check size={16}/>}
        </button>;
      })}
    </div>
    <footer><span>{references.length ? (zh ? `已选 ${references.length} 项` : `${references.length} selected`) : (zh ? "未搜索时显示最近更新的资料" : "Recently updated records shown before searching")}</span><button type="button" onClick={() => { close(); composer.current?.focus(); }}>{zh ? "完成" : "Done"}</button></footer>
  </div>;
  const tags = references.length > 0 && <div className="ws-composer-context-tags">{references.map(item => <ComposerReference key={`${item.kind}:${item.id}`} kind={item.kind} name={item.kind === "role" ? [item.client_name,item.name].filter(Boolean).join(" · ") : item.name} removeLabel={`${zh ? "移除引用" : "Remove reference"}: ${item.name}`} onRemove={() => setStored({key, items: references.filter(ref => !(ref.kind === item.kind && ref.id === item.id))})}/>)}</div>;
  return {references, picker, tags, start, update, onKeyDown, open, selectedId: open && matches[selected] ? `context-reference-${selected}` : undefined, clear: () => {setStored({key,items:[]});close();localStorage.removeItem(key);}};
}
