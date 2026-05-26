export function HowItWorksSection() {
  const steps = [
    {
      step: "1",
      title: "Paste the real client JD",
      desc: "Hirelix turns the role into a concise search brief with level, must-have skills, target signals, and constraints.",
    },
    {
      step: "2",
      title: "Review a ranked technical shortlist",
      desc: "You see who is worth a first look, why they fit, and which risks to verify before a client submission.",
    },
    {
      step: "3",
      title: "Turn the best profiles into outreach",
      desc: "Once a candidate is worth working, start from a personalized draft and a client-ready rationale.",
    },
  ];

  return (
    <section id="how-it-works" data-growth-section="工作流程" className="border-t border-slate-200 bg-[#fbfaf7] py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            How it works
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            From client JD to client-ready shortlist
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Keep the first run focused: understand the role, inspect ranked profiles, and only then move into outreach.
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
