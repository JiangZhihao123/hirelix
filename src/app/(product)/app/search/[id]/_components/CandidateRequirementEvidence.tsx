import { getDecisionRecord } from "@/lib/search/decision-contract";

function sourceFactText(value: string | undefined) {
  if (!value) return "Source fact unavailable";
  try {
    const fact = JSON.parse(value);
    if (fact && !Array.isArray(fact) && typeof fact === "object" && (fact.title || fact.company)) {
      return [
        [fact.title, fact.company].filter(Boolean).join(" · "),
        [fact.start, fact.current ? "Present" : fact.end].filter(Boolean).join(" – "),
        fact.location,
        fact.description,
      ].filter(Boolean).join("\n");
    }
    return JSON.stringify(fact, null, 2);
  } catch {
    return value;
  }
}

export function CandidateRequirementEvidence({ candidate, compact = false }: {
  candidate: { metadata?: unknown; evidence_pack?: unknown };
  compact?: boolean;
}) {
  const record = getDecisionRecord(candidate);
  if (!record) return null;
  const rows = compact ? record.assessment.requirements.filter((row) => row.status !== "supported").slice(0, 2) : record.assessment.requirements;
  return (
    <section className="mt-3 space-y-2" aria-label="Role requirement evidence">
      {!compact && <h3 className="text-sm font-semibold text-slate-900">Evidence against this role</h3>}
      {rows.map((row) => (
        <div key={row.requirementId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">{row.description}</p>
            <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${row.status === "supported" ? "bg-emerald-100 text-emerald-800" : row.status === "contradicted" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
              {row.status === "supported" ? "Supported" : row.status === "contradicted" ? "Does not meet" : "Needs verification"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">{row.explanation}</p>
          {!compact && record.sourceEvidence && row.sources.length > 0 && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">View source facts</summary>{row.sources.map((source) => <p key={source} className="mt-2 whitespace-pre-wrap break-words leading-5">{sourceFactText(record.sourceEvidence?.[source])}</p>)}</details>}
        </div>
      ))}
      {!compact && record.reconciliation && <p className="text-xs leading-5 text-slate-600">Review update: {record.reconciliation}</p>}
      {!compact && <p className="text-xs text-slate-500">Profile retrieved: {record.provenance.retrievedAt ? new Date(record.provenance.retrievedAt).toISOString().slice(0, 10) : "date unavailable"}. Current availability and interest still need confirmation.</p>}
    </section>
  );
}
