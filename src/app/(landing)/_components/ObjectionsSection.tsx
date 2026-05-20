import { Database, Mail, Search, ShieldCheck } from "lucide-react";

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
      desc: "No credit card is required to build the first real shortlist preview. Upgrade when contact actions or export save you time.",
    },
    {
      icon: Search,
      title: "Who is this built for first?",
      desc: "Independent technical headhunters who need a credible shortlist faster than manual profile review.",
    },
    {
      icon: Mail,
      title: "Will I still need to write outreach manually?",
      desc: "You can edit the draft, but you do not need to start from a blank email after reviewing candidates.",
    },
  ];

  return (
    <section className="border-t border-slate-200 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Quick answers
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Objections answered up front
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            The questions every recruiter asks in the first 60 seconds.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.title}
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-sky-200 hover:shadow-[0_14px_36px_rgba(14,165,233,0.1)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  <span className="mr-1.5 text-sky-600">Q.</span>
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
