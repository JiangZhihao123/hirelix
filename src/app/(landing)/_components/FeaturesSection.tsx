import { FileText, ListChecks, Mail, Search } from "lucide-react";

export function FeaturesSection() {
  const workflowChanges = [
    {
      icon: FileText,
      title: "No Boolean rebuild",
      desc: "Paste the client brief as-is. Hirelix turns technical requirements, constraints, and target signals into a search-ready brief.",
    },
    {
      icon: Search,
      title: "Fewer profiles to review",
      desc: "Real profiles are ranked into a shortlist, so your first pass starts with the candidates most likely to deserve attention.",
    },
    {
      icon: ListChecks,
      title: "A shortlist you can defend",
      desc: "Each promising candidate carries fit evidence and risks to verify before you send them to a client.",
    },
    {
      icon: Mail,
      title: "Outreach has a starting point",
      desc: "Once a profile is worth working, you start from a tailored message instead of a blank page.",
    },
  ];

  return (
    <section id="workflow" data-growth-section="工作流变化" className="scroll-mt-24 border-t border-slate-200 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Workflow
            </p>
            <h2 className="max-w-[12ch] text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Spend the first pass on judgment, not sorting.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Hirelix keeps the sourcing session narrow: understand the role, rank real profiles,
              inspect the evidence, and move into outreach only after a candidate is worth it.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {workflowChanges.map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.045)]"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-3 border-t border-slate-200 pt-6 text-sm text-slate-700 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-700" />
            Real profiles, not synthetic candidates
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Fit reasons and risks stay visible
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Outreach starts after review
          </div>
        </div>
      </div>
    </section>
  );
}
