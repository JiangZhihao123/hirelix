"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { useQuery, ErrorNotice, date } from "./client";

type Recent = { id: string; title: string; updated_at: string; excerpt: string | null; status: string | null; revision_status: string | null; revision_applied: number | null };
type Draft = { id: string; title: string; role_id: string; kind: string; updated_at: string; client_name: string };
export function RecentWork() {
  const t = useT();
  const query = useQuery<{ conversations: Recent[]; drafts: Draft[] }>("/overview");
  if (query.error) return <ErrorNotice error={query.error} retry={query.refresh} />;
  if (!query.data || (!query.data.conversations.length && !query.data.drafts.length)) return null;
  return <div className="ws-recent-work">
    {query.data.conversations.length > 0 && <section><h3>{t("Pick up where you left off")}</h3>{query.data.conversations.map(item => <Link key={item.id} href={`/app?conversation=${item.id}`}>
      <div><strong>{item.title}</strong><small>{date(item.updated_at, true)}{item.status === "error" ? ` · ${t("Reply needs attention")}` : ["queued", "running"].includes(item.status || "") ? ` · ${t("In progress")}` : ""}</small><p>{item.revision_applied ? t("Your revised draft is saved.") : item.revision_status === "done" ? t("Review proposed revision") : item.revision_status === "error" ? t("Revision needs attention") : ["queued", "running"].includes(item.revision_status || "") ? t("Preparing revision…") : item.excerpt?.replace(/\s+/g, " ").replace(/\*\*([^*]+)\*\*/g, "$1").slice(0, 110)}</p></div><ArrowUpRight size={15} />
    </Link>)}</section>}
    {query.data.drafts.length > 0 && <section><h3>{t("Saved drafts to review")}</h3>{query.data.drafts.map(item => <Link key={item.id} href={item.kind === "search_update" ? `/app/roles/${item.role_id}/updates/${item.id}` : `/app/submissions/${item.id}`}><div><strong>{item.title}</strong><small>{item.client_name} · {date(item.updated_at)}</small></div><ArrowUpRight size={15} /></Link>)}</section>}
  </div>;
}
