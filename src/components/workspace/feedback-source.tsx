"use client";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageProvider";
import type { SourceRecord } from "@/lib/workspace/types";

// Feedback belongs to the published snapshot, not necessarily today's editable copy.
export function FeedbackSource({ record }: { record: SourceRecord }) {
  const { locale } = useLanguage();
  if (record.details.source !== "recommendation_link") return null;
  const zh = locale === "zh";
  const version = Number(record.details.recommendation_version);
  const documentId = String(record.details.recommendation_id || "");
  const label = Number.isInteger(version) && version > 0
    ? (zh ? `来自推荐第 ${version} 版` : `From recommendation v${version}`)
    : (zh ? "来自推荐页" : "From recommendation page");
  return <p className="ws-muted text-xs">
    {label}
    {/^[a-f0-9-]{36}$/.test(documentId) ? <> · <Link className="ws-link" href={`/app/submissions/${documentId}`}>{zh ? "查看推荐材料" : "View recommendation"}</Link></> : null}
    {record.details.submitted_name ? ` · ${String(record.details.submitted_name)}` : ""}
    {zh ? " · 提交人身份未验证" : " · Submitter identity unverified"}
  </p>;
}
