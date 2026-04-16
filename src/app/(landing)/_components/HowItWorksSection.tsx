export function HowItWorksSection() {
  return (
    <section className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            What happens after the click
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Bring the real job description",
              desc: "Paste the actual role so the system can interpret the skills, level, and role shape correctly.",
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
          ].map((item) => (
            <div key={item.step} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-lg font-bold text-sky-700">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
