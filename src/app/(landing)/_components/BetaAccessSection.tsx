import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";

export function BetaAccessSection({ onStart }: { onStart: () => void }) {
  const included = [
    "1 complete 25-person shortlist included",
    "Limited monthly beta seats",
    "Email lookup and export available after value is visible",
  ];

  return (
    <section id="beta-access" data-growth-section="行动区" className="scroll-mt-24 border-t border-slate-200 bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-8 rounded-lg border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.16)] sm:p-8 lg:grid-cols-[0.98fr_1.02fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-lg border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-100">
              Invite-only beta
            </p>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              Try one client role before comparing plans.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Built for technical headhunters who want to prove one complete shortlist first.
              Start with the JD already on your desk; upgrade only after the output is useful.
            </p>
            <button
              type="button"
              onClick={onStart}
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_36px_rgba(0,0,0,0.22)] transition-all hover:-translate-y-0.5 hover:bg-indigo-50"
            >
              Build shortlist
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-white p-5 text-slate-950 shadow-[0_14px_36px_rgba(0,0,0,0.16)]">
            <div className="flex items-start gap-3 border-b border-slate-200 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-950">Beta access includes</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enough to judge whether Hirelix can save one sourcing session.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {included.map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <p className="mt-5 text-xs leading-5 text-slate-500">
              The first run is there to judge whether the 25-person output is worth paying for.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
