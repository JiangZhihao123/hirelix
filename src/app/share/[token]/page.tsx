import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { ArrowUpRight, CheckCircle2, MapPin, Sparkles } from "lucide-react";

import { db } from "@/db/client";
import {
  hirelix_candidates,
  hirelix_search_shares,
  hirelix_searches,
} from "@/db/schema";
import { hashSearchShareToken, isValidSearchShareToken } from "@/lib/search-share";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ranked candidate pool | Hirelix",
  description: "A client-ready candidate pool prepared with Hirelix.",
  robots: { index: false, follow: false },
};

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function object(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function publicProfileUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function unavailable() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-slate-100">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-2xl font-semibold">This candidate pool is no longer available.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Ask the sender for a new private link.</p>
        <Link href="/" className="mt-7 inline-flex rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950">
          See how Hirelix works
        </Link>
      </div>
    </main>
  );
}

export default async function SharedCandidatePoolPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidSearchShareToken(token)) return unavailable();

  const [share] = await db
    .select()
    .from(hirelix_search_shares)
    .where(and(
      eq(hirelix_search_shares.token_hash, hashSearchShareToken(token)),
      isNull(hirelix_search_shares.revoked_at),
      or(
        isNull(hirelix_search_shares.expires_at),
        gt(hirelix_search_shares.expires_at, sql`now()`),
      ),
    ))
    .limit(1);
  if (!share) return unavailable();

  const [search] = await db
    .select()
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, share.search_id))
    .limit(1);
  if (!search || search.status !== "done") return unavailable();

  const candidates = await db
    .select({
      id: hirelix_candidates.id,
      name: hirelix_candidates.name,
      headline: hirelix_candidates.headline,
      location: hirelix_candidates.location,
      skills: hirelix_candidates.skills,
      match_score: hirelix_candidates.match_score,
      match_reasons: hirelix_candidates.match_reasons,
      profile_url: hirelix_candidates.profile_url,
      final_rank: hirelix_candidates.final_rank,
      final_decision: hirelix_candidates.final_decision,
      qualification_evidence: hirelix_candidates.qualification_evidence,
      evidence_pack: hirelix_candidates.evidence_pack,
      metadata: hirelix_candidates.metadata,
    })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, share.search_id))
    .orderBy(
      asc(hirelix_candidates.final_rank),
      desc(hirelix_candidates.match_score),
      asc(hirelix_candidates.created_at),
    )
    .limit(share.candidate_limit);

  const parsed = object(search.parsed_requirements);
  const title = search.title || (typeof parsed.title === "string" ? parsed.title : null) || "Technical candidate pool";
  const recommendedCount = candidates.filter((candidate) => candidate.final_decision === "contact" || candidate.final_decision === "review").length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-400 text-slate-950">H</span>
            Hirelix
          </Link>
          <Link href="/?intent_path=shared_pool" className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-300/20">
            Build your own pool <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_36%)] px-5 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-medium text-sky-200">
            <Sparkles className="h-3.5 w-3.5" /> Client-ready ranked pool
          </div>
          <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            {candidates.length} candidates ranked against the role. {recommendedCount > 0 ? `${recommendedCount} are marked for first review; the rest remain ordered for broader outreach.` : "Each profile is ordered for structured review."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 px-3 py-1.5">Private link</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">No login required</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">Prepared with Hirelix</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-4">
          {candidates.map((candidate, index) => {
            const metadata = object(candidate.metadata);
            const suitability = object(metadata.suitability);
            const qualification = object(candidate.qualification_evidence);
            const risks = stringArray(qualification.rejection_reasons).length
              ? stringArray(qualification.rejection_reasons)
              : stringArray(suitability.risk_flags);
            const reasons = stringArray(candidate.match_reasons).slice(0, 3);
            const rank = candidate.final_rank || index + 1;
            const recommended = candidate.final_decision === "contact" || candidate.final_decision === "review";
            const profileUrl = publicProfileUrl(candidate.profile_url);
            return (
              <article key={candidate.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-semibold text-sky-200">#{rank}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{candidate.name}</h2>
                        {recommended && <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">Recommended</span>}
                      </div>
                      {candidate.headline && <p className="mt-1 text-sm text-slate-300">{candidate.headline}</p>}
                      {candidate.location && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5" />{candidate.location}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <span className="text-2xl font-semibold text-sky-300">{candidate.match_score ?? "—"}</span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">fit score</span>
                  </div>
                </div>

                {reasons.length > 0 && (
                  <div className="mt-5 grid gap-2">
                    {reasons.map((reason) => <p key={reason} className="flex gap-2 text-sm leading-6 text-slate-300"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />{reason}</p>)}
                  </div>
                )}
                {candidate.skills && candidate.skills.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {candidate.skills.slice(0, 8).map((skill) => <span key={skill} className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-slate-400">{skill}</span>)}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-500">{risks[0] ? `Verify: ${risks[0]}` : "Review profile evidence before outreach."}</p>
                  {profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-sky-300 hover:text-sky-200">View source profile <ArrowUpRight className="h-3.5 w-3.5" /></a>}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-12 rounded-3xl border border-sky-300/20 bg-sky-300/10 p-7 text-center sm:p-10">
          <h2 className="text-2xl font-semibold">Turn your next JD into a ranked pool.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300">Hirelix searches, screens, ranks, and explains technical candidates so recruiters can start outreach sooner.</p>
          <Link href="/?intent_path=shared_pool" className="mt-6 inline-flex rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300">Run one role free</Link>
        </div>
      </section>
    </main>
  );
}
