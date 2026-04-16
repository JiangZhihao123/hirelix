import { Database, Mail, Search, ShieldCheck } from "lucide-react";

export function ObjectionsSection() {
  return (
    <section className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Objections answered up front
          </h2>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: Database,
              title: "Are these real people?",
              desc: "The product is built around real LinkedIn profile discovery, not synthetic candidate records.",
            },
            {
              icon: ShieldCheck,
              title: "Do I need to pay before seeing value?",
              desc: "No credit card is required to get started. The first step is understanding what the workflow looks like.",
            },
            {
              icon: Search,
              title: "Who is this built for first?",
              desc: "Hirelix is built first for technical recruiters and headhunters working software roles where resume review alone is not enough.",
            },
            {
              icon: Mail,
              title: "Will I still need to write outreach manually?",
              desc: "You can edit the draft, but you do not need to start from a blank email after reviewing candidates.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <item.icon className="mb-4 h-5 w-5 text-sky-600" />
              <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
