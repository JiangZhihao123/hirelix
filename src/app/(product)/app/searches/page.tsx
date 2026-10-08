"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { fetchWithUserSession } from "@/lib/client-auth";
import { ErrorNotice, Loading, date } from "@/components/workspace/client";
import { getSearchDisplayTitle } from "@/lib/search-title";

type PastSearch = { id: string; title: string | null; parsed_requirements: Record<string, unknown> | null; created_at: string; status: string };
export default function PastSourcingResults() {
  const t = useT();
  const [searches, setSearches] = useState<PastSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetchWithUserSession("/api/searches");
      if (!response.ok) throw new Error("Could not load previous results");
      const result = await response.json();
      setSearches(result.searches || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load previous results");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="ws-page">
    <header className="ws-page-header"><div><h1>{t("Past sourcing results")}</h1>
      <p>{t("External sourcing has been retired. Your previous results are kept here.")}</p></div>
      <Link className="ws-button ws-button-primary" href="/app">{t("Ask your AI assistant")}<ArrowUpRight size={14} /></Link>
    </header>
    <ErrorNotice error={error} retry={load} />
    {loading ? <Loading /> : !error && !searches.length ? <p className="ws-muted">{t("No previous sourcing results.")}</p> : (
      <div className="ws-list">{searches.map((search) => <Link key={search.id} href={`/app/search/${search.id}`} className="ws-history-result">
        <div><strong>{getSearchDisplayTitle({ title: search.title, parsedRequirements: search.parsed_requirements, fallback: t("Untitled sourcing task") })}</strong><small>{date(search.created_at)}</small></div>
        <ArrowUpRight size={16} />
      </Link>)}</div>
    )}
  </div>;
}
