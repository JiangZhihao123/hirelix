export function HowItWorksSection() {
  const steps = [
    {
      step: "1",
      title: "Bring the real job description",
      desc: "Paste the actual role so the system can interpret skills, level, and role shape correctly — no Boolean translation required.",
    },
    {
      step: "2",
      title: "Sign in and run the search",
      desc: "Your pasted JD stays with you, so authentication does not reset the workflow.",
    },
    {
      step: "3",
      title: "Review candidates and outreach",
      desc: "Open the shortlist, inspect fit reasons and evidence, then move straight into personalized drafts.",
    },
  ];

  return (
    <section className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            How it works
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            What happens after the click
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Three steps from a JD on your clipboard to outreach ready to send.
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
                className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_45px_rgba(14,165,233,0.14)]"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-xl font-bold text-white shadow-[0_10px_30px_rgba(14,165,233,0.32)]">
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
