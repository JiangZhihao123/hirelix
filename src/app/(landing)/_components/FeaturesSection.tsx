import { Brain, Mail, Search } from "lucide-react";

export function FeaturesSection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center sm:mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            What you get
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Three shifts, one workflow
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Hirelix replaces the parts of sourcing that drain your day, not the parts you actually want to do.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: Search,
              title: "Stop translating JDs into filters",
              desc: "The JD becomes the brief. You do not need to reverse-engineer Boolean logic first.",
            },
            {
              icon: Brain,
              title: "Review ranked people, not a pile of profiles",
              desc: "Candidates arrive with match reasons so the first pass goes faster.",
            },
            {
              icon: Mail,
              title: "Leave with personalized drafts ready",
              desc: "The workflow ends with personalized drafts, not a blank outreach tab.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_45px_rgba(14,165,233,0.14)]"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-sky-50 text-sky-700 ring-1 ring-sky-100 transition-colors group-hover:from-sky-200 group-hover:to-sky-100">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
