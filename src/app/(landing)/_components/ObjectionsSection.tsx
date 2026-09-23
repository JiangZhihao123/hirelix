import { BookUser, FileText, Search, ShieldCheck, Sparkles } from "lucide-react";

export function ObjectionsSection() {
  const items = [
    {
      icon: BookUser,
      title: "Whose candidate memory is this?",
      desc: "Yours. You decide whom to save and what private observations the agent can use across roles.",
    },
    {
      icon: ShieldCheck,
      title: "Can it distinguish my notes from profile claims?",
      desc: "Yes. Saved recruiter notes and imported search evidence retain their source context, so uncertain claims can stay uncertain.",
    },
    {
      icon: Search,
      title: "Can I still run a new search?",
      desc: "Yes. Existing JD search remains available when you need to discover people outside your private memory.",
    },
    {
      icon: FileText,
      title: "Does it send the weekly brief?",
      desc: "No. It generates a draft you can edit or revise. You decide what to share with your client.",
    },
    {
      icon: Sparkles,
      title: "Will it make up weekly progress?",
      desc: "It is instructed to say when no candidate activity was verified and to show the missing facts before a recommendation.",
    },
  ];

  return (
    <section id="faq" className="scroll-mt-[4.5rem] border-t border-slate-200 bg-slate-50 pt-8 pb-16 sm:pt-8 sm:pb-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Questions
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Questions about your private agent
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            What the agent remembers, how it handles evidence, and what stays in your hands.
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
