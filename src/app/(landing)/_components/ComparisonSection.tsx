import { CheckCircle2 } from "lucide-react";

export function ComparisonSection() {
  return (
    <section className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Why teams switch from manual sourcing
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Without Hirelix
            </p>
            <div className="space-y-3 text-sm text-slate-600">
              <p>1. Translate the JD into keywords and filters</p>
              <p>2. Scroll through large result sets manually</p>
              <p>3. Decide who is actually relevant</p>
              <p>4. Draft outreach one candidate at a time</p>
            </div>
            <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-center">
              <span className="text-2xl font-bold text-rose-500">Hours per role</span>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,#eff8ff_0%,#e8f3ff_100%)] p-6 shadow-[0_14px_36px_rgba(14,165,233,0.12)]">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
              With Hirelix
            </p>
            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span>Paste the real JD once</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span>Open a ranked shortlist with fit reasons and outreach drafts ready</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span>Start outreach with a draft already prepared</span>
              </div>
            </div>
            <div className="mt-6 rounded-xl bg-white px-4 py-3 text-center shadow-[0_8px_20px_rgba(14,165,233,0.08)]">
              <span className="text-2xl font-bold text-slate-950">Often ready in a few minutes</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
