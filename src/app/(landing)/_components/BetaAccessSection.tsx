import { ArrowRight, CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";

export function BetaAccessSection({ onStart }: { onStart: () => void }) {
  const included = [
    "1 real shortlist preview included",
    "Limited monthly beta seats",
    "Contact unlocks and exports available after value is visible",
  ];

  return (
    <section id="beta-access" className="scroll-mt-24 border-t border-slate-200 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-8 rounded-lg border border-blue-100 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_58%)] p-6 shadow-[0_18px_50px_rgba(37,99,235,0.1)] sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              Invite-only beta
            </p>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Try one client role before comparing plans.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              This beta is built for independent technical headhunters who want to prove one real
              shortlist first. Start with the JD already on your desk; upgrade only after the output
              is useful.
            </p>
            <button
              type="button"
              onClick={onStart}
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(37,99,235,0.22)] transition-all hover:-translate-y-0.5 hover:bg-blue-700"
            >
              Build shortlist
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-3 border-b border-slate-200 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
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
              Subscriptions and extra credits remain available after sign in; the public homepage no
              longer asks new visitors to choose a plan before seeing value.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
