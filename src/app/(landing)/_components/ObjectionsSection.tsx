import { Database, LockKeyhole, Search, ShieldCheck } from "lucide-react";

export function ObjectionsSection() {
  const items = [
    {
      icon: Database,
      title: "Are these real people?",
      desc: "Yes. The product is built around real LinkedIn profile discovery, not synthetic candidate records.",
    },
    {
      icon: ShieldCheck,
      title: "Do I need to pay before seeing value?",
      desc: "No credit card is required to build the first complete 25-person shortlist. Upgrade when email lookup or export saves you time.",
    },
    {
      icon: Search,
      title: "Who is this built for first?",
      desc: "Technical headhunters who need a credible shortlist faster than manual profile review.",
    },
    {
      icon: LockKeyhole,
      title: "What happens after my beta preview?",
      desc: "You can keep reviewing the shortlist. Subscribe only if the 25-person result is useful enough to work.",
    },
  ];

  return (
    <section id="faq" className="scroll-mt-24 border-t border-slate-200 bg-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            FAQ
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            The first questions before you paste a client role
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Short answers for the trust checks that matter before a beta preview.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.title}
              className="group flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-6 transition-all hover:border-indigo-200 hover:shadow-[0_14px_36px_rgba(67,56,202,0.08)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  <span className="mr-1.5 text-indigo-700">Q.</span>
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  <span className="mr-1.5 font-semibold text-emerald-600">A.</span>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
