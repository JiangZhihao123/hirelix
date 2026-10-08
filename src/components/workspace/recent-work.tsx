"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { useQuery, ErrorNotice, date } from "./client";

type Recent = { id: string; title: string; updated_at: string; excerpt: string | null; status: string | null; revision_status: string | null; revision_applied: number | null };
type Draft = { id: string; title: string; role_id: string; kind: string; updated_at: string; client_name: string };
type Ongoing = { id: string; conversation_id: string; title: string; status: string; kind: string };
type Agreement = { id: string; role_id: string; title: string; client_name: string; conversation_id: string | null; next_run_at: string; timezone: string; error: string | null };
export function RecentWork() {
  const t = useT();
  const query = useQuery<{ conversations: Recent[]; drafts: Draft[]; ongoing: Ongoing[]; agreements: Agreement[] }>("/overview");
  if (query.error) return <ErrorNotice error={query.error} retry={query.refresh} />;
  if (!query.data || (!query.data.conversations.length && !query.data.drafts.length && !query.data.ongoing.length && !query.data.agreements.length)) return null;
  return <div className="ws-recent-work">
    {!!query.data.ongoing.length && <section className="ws-current-work"><h3>{t("Work in progress")}</h3>{query.data.ongoing.map(item => <Link key={item.id} href={`/app?conversation=${item.conversation_id}`}><div><strong>{item.title}</strong><small>{t(item.status === "error" ? "Needs attention" : item.kind === "deliverable" ? "Preparing your draft" : "In progress")} · {t("Return to the conversation")}</small></div><ArrowUpRight size={15} /></Link>)}</section>}
    {query.data.drafts.length > 0 && <section><h3>{t("Saved drafts to review")}</h3>{query.data.drafts.map(item => <Link key={item.id} href={item.kind === "search_update" ? `/app/roles/${item.role_id}/updates/${item.id}` : `/app/submissions/${item.id}`}><div><strong>{item.title}</strong><small>{item.client_name} · {date(item.updated_at)}</small></div><ArrowUpRight size={15} /></Link>)}</section>}
    {!!query.data.agreements.length && <section><h3>{t("Your next agreed updates")}</h3>{query.data.agreements.map(item => <Link key={item.id} href={item.conversation_id ? `/app?conversation=${item.conversation_id}` : `/app/roles/${item.role_id}`}><div><strong>{item.client_name} · {item.title}</strong><small><Clock3 size={12} /> {item.error ? t("Needs attention") : `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: item.timezone }).format(new Date(item.next_run_at))} · ${item.timezone}`}</small></div><ArrowUpRight size={15} /></Link>)}</section>}
    {query.data.conversations.length > 0 && <section className="ws-recent-conversations"><h3>{t("Pick up where you left off")}</h3>{query.data.conversations.slice(0, 2).map(item => <Link key={item.id} href={`/app?conversation=${item.id}`}>
      <div><strong>{item.title}</strong><small>{date(item.updated_at, true)}{item.status === "error" ? ` · ${t("Reply needs attention")}` : ["queued", "running"].includes(item.status || "") ? ` · ${t("In progress")}` : ""}</small><p>{item.revision_applied ? t("Your revised draft is saved.") : item.revision_status === "done" ? t("Review proposed revision") : item.revision_status === "error" ? t("Revision needs attention") : ["queued", "running"].includes(item.revision_status || "") ? t("Preparing revision…") : item.excerpt?.replace(/\s+/g, " ").replace(/\*\*([^*]+)\*\*/g, "$1").slice(0, 110)}</p></div><ArrowUpRight size={15} />
    </Link>)}</section>}

  </div>;
}
