"use client";

import { useT } from "@/components/LanguageProvider";

function label(key: string) {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function Value({ value }: { value: unknown }) {
  if (value === null || value === "") return <span>—</span>;
  if (Array.isArray(value)) return <ul>{value.map((item, i) => <li key={i}><Value value={item} /></li>)}</ul>;
  if (typeof value === "object") return <dl className="ws-source-fields">{Object.entries(value as Record<string, unknown>).map(([key, item]) => <div key={key}><dt>{label(key)}</dt><dd><Value value={item} /></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}
export function SourceContent({ content }: { content: string }) {
  const t = useT();
  let value: unknown;
  try { value = JSON.parse(content); } catch { return <p className="whitespace-pre-wrap">{content}</p>; }
  if (!value || typeof value !== "object") return <p>{content}</p>;
  return <div className="ws-source-content"><Value value={value} /><details><summary className="ws-link">{t("View original text")}</summary><pre>{content}</pre></details></div>;
}
