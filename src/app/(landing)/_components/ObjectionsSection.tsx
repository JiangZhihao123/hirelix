import { Database, Mail, Search, ShieldCheck, Sparkles } from "lucide-react";

export function ObjectionsSection() {
  const items = [
    {
      icon: Database,
      title: "Are these real people?",
      desc: "Yes. The product is built around real LinkedIn profile discovery, not synthetic candidate records.",
    },
    {
      icon: ShieldCheck,
      title: "What public evidence does Hirelix research?",
      desc: "Hirelix checks sources like GitHub, papers, technical blogs, company engineering blogs, open-source packages, Stack Overflow, talks, personal sites, and portfolios.",
    },
    {
      icon: Search,
      title: "What do I get from the first run?",
      desc: "A ranked 25-profile shortlist with fit evidence, risks to verify, and personalized outreach starting points.",
    },
    {
      icon: Mail,
      title: "Do you send outreach automatically?",
      desc: "No. Hirelix drafts outreach so you can review, edit, and decide when to contact a candidate.",
    },
    {
      icon: Sparkles,
      title: "What happens when I am ready to contact candidates?",
      desc: "Continue from the ranked shortlist, unlock the workflow capabilities you need, and work the candidate pool inside the product.",
    },
  ];

  return (
    <section id="faq" className="scroll-mt-24 border-t border-slate-200 bg-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Questions
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            The first questions before you paste a client role
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Short answers for the trust checks that matter before the first shortlist.
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
