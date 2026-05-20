export function HowItWorksSection() {
  const steps = [
    {
      step: "1",
      title: "Paste the real job description",
      desc: "Hirelix turns the client JD into a search brief with role level, must-have skills, target signals, and constraints.",
    },
    {
      step: "2",
      title: "Search and rank technical profiles",
      desc: "The system finds LinkedIn profiles, scores fit, and adds public engineering evidence when it is available.",
    },
    {
      step: "3",
      title: "Review evidence and edit outreach",
      desc: "Independent headhunters get a ranked shortlist, concise fit reasons, and drafts they can personalize before sending.",
    },
  ];

  return (
    <section id="how-it-works" className="border-t border-slate-200 bg-[#fbfaf7] py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            How it works
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            From client JD to first outreach in one flow
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Paste the role, review ranked matches, and send edited outreach from one workflow.
          </p>
        </div>

        <div className="relative mt-16">
          {/* Connecting line on desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-7 left-[15%] right-[15%] hidden h-px bg-gradient-to-r from-transparent via-sky-200 to-transparent sm:block"
          />

          <div className="relative grid gap-6 sm:grid-cols-3">
            {steps.map((item) => (
              <div
                key={item.step}
                className="group relative rounded-lg border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_45px_rgba(37,99,235,0.12)]"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white shadow-[0_10px_30px_rgba(37,99,235,0.26)]">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
