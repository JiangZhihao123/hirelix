import { CheckCircle2, Clock, FileSearch, Filter, MailQuestion, Sparkles, Zap } from "lucide-react";

export function ComparisonSection() {
  return (
    <section className="border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Before vs after
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Why solo headhunters stop reviewing every profile manually
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            The same client JD, two completely different sourcing sessions.
          </p>
        </div>

        <div className="relative mt-14 grid gap-6 sm:grid-cols-2">
          {/* Without Hirelix — pain side */}
          <div className="relative rounded-2xl border border-rose-100 bg-white p-7 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-5 flex items-center gap-2">
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
                Without Hirelix
              </span>
            </div>
            <ul className="space-y-3.5 text-sm text-slate-700">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                  <Filter className="h-4 w-4" />
                </span>
                <span>Translate the JD into keywords and Boolean filters</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                  <FileSearch className="h-4 w-4" />
                </span>
                <span>Scroll through hundreds of profiles manually</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                  <MailQuestion className="h-4 w-4" />
                </span>
                <span>Decide who is actually relevant — guess and second-guess</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                  <Clock className="h-4 w-4" />
                </span>
                <span>Draft outreach one candidate at a time, from a blank page</span>
              </li>
            </ul>
            <div className="mt-7 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-rose-600">
                Time per role
              </span>
              <span className="text-2xl font-bold text-rose-600">~ 4 hours</span>
            </div>
          </div>

          {/* With Hirelix — gain side */}
          <div className="relative rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,#eff8ff_0%,#e8f3ff_100%)] p-7 shadow-[0_14px_36px_rgba(14,165,233,0.14)]">
            <div className="mb-5 flex items-center gap-2">
              <span className="rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-800">
                With Hirelix
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-950">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            </div>
            <ul className="space-y-3.5 text-sm text-slate-800">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span>Paste the real JD — no Boolean translation</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span>Open a ranked shortlist with explicit fit reasons</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span>Personalized outreach drafts ready before you start typing</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span>Public evidence attached when it helps explain fit</span>
              </li>
            </ul>
            <div className="mt-7 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-[0_8px_20px_rgba(14,165,233,0.1)]">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-sky-700">
                <Zap className="h-3.5 w-3.5" /> Time per role
              </span>
              <span className="text-2xl font-bold text-slate-950">~ 10 minutes</span>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-sm text-slate-500">
          Same role. Same data sources. Hirelix turns the JD into a shortlist you can explain before you send it to a client.
        </p>
      </div>
    </section>
  );
}
