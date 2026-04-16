import { Brain, Mail, Search } from "lucide-react";

export function FeaturesSection() {
  return (
    <section className="py-18 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-4 px-6 sm:grid-cols-3">
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
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <item.icon className="mb-3 h-5 w-5 text-sky-600" />
            <h2 className="text-base font-semibold text-slate-950">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
