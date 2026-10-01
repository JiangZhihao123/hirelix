"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ErrorNotice, useQuery } from "./client";
import { useT } from "@/components/LanguageProvider";
export function DraftNotifications() {
  const t = useT();
  const query = useQuery<{ notifications: Array<{ id: string; title: string; href: string }> }>("/notifications");
  const [error, setError] = useState("");
  useEffect(() => { const timer = setInterval(query.refresh, 30000); return () => clearInterval(timer); }, [query.refresh]);
  if (!query.data?.notifications.length) return null;
  return <details className="relative"><summary className="ws-link">{t("Drafts ready")} ({query.data.notifications.length})</summary><div className="absolute right-0 z-30 w-72 rounded border bg-background p-3 shadow-lg"><ErrorNotice error={error} />{query.data.notifications.map((item) => <div key={item.id} className="mb-3"><Link className="ws-link" href={item.href}>{item.title}</Link><button className="ws-link block mt-1" onClick={async () => { try { await api("/notifications", { method: "POST", body: JSON.stringify({ id: item.id }) }); query.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Could not mark notification read"); } }}>{t("Mark as read")}</button></div>)}</div></details>;
}
