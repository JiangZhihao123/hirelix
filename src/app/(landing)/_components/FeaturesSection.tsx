import { Github, ListChecks, Mail, Search } from "lucide-react";

export function FeaturesSection() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center sm:mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            What you get
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            A shortlist your team can actually review
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Hirelix keeps the workflow focused on people, evidence, and outreach instead of
            forcing recruiters to translate every JD into brittle filters.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Search,
              title: "LinkedIn-first sourcing",
              desc: "Start from the job description and search for real profiles that match the role shape.",
            },
            {
              icon: ListChecks,
              title: "Explainable ranking",
              desc: "Every candidate comes with concise fit reasons so the shortlist is easy to trust.",
            },
            {
              icon: Github,
              title: "Public evidence",
              desc: "Hirelix surfaces useful public signals when they exist, without pretending every role has the same evidence.",
            },
            {
              icon: Mail,
              title: "Outreach ready",
              desc: "Move from fit review to editable LinkedIn or email drafts without opening a blank page.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="group rounded-lg border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_45px_rgba(37,99,235,0.12)]"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition-colors group-hover:bg-blue-100">
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
