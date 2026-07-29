import {
  BookOpen,
  FileText,
  Github,
  ListChecks,
  Mail,
  Search,
} from "lucide-react";

export function HowItWorksSection() {
  const steps = [
    {
      title: "Paste the client JD",
      desc: "Start from the real role on your desk. No Boolean rebuild or long setup flow.",
    },
    {
      title: "Hirelix builds the sourcing brief",
      desc: "The agents extract must-have skills, constraints, target signals, and comparable backgrounds.",
    },
    {
      title: "Agents source and research candidates",
      desc: "Real profiles are sourced, scored, and checked for public technical evidence in parallel.",
    },
    {
      title: "Review the ranked candidate pool",
      desc: "Open the full ranked pool with a recommended shortlist, fit reasons, risks, evidence, and outreach starting points.",
    },
  ];

  return (
    <section id="how-it-works" data-growth-section="工作方式" className="min-h-[calc(100vh-4.5rem)] scroll-mt-[4.5rem] border-t border-slate-200 bg-slate-50 pt-8 pb-16 sm:pt-8 sm:pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              How it works
            </p>
            <h2 className="max-w-[12ch] text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              From client role to ranked candidate pool.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Hirelix keeps the first pass focused: understand the role, research real people,
              inspect the evidence, and start outreach only after a candidate is worth it.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.055)] sm:p-6">
            <div className="grid gap-4">
              {steps.map((step, index) => (
                <div key={step.title} className="grid gap-4 sm:grid-cols-[3.25rem_1fr]">
                  <div className="flex sm:flex-col sm:items-center">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    {index < steps.length - 1 ? (
                      <span className="ml-5 hidden h-full w-px bg-slate-200 sm:block" />
                    ) : null}
                  </div>
                  <div className="pb-2 sm:pb-5">
                    <h3 className="text-base font-semibold text-slate-950">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  const features = [
    {
      icon: FileText,
      title: "JD-to-sourcing brief",
      desc: "Turns the client JD into role requirements, constraints, target company signals, and adjacent background patterns.",
    },
    {
      icon: Search,
      title: "Real profile discovery",
      desc: "Sources around real candidate profiles instead of generating synthetic records or generic persona matches.",
    },
    {
      icon: Github,
      title: "Candidate research",
      desc: "When you choose to research a candidate, Hirelix checks sources like GitHub, papers, technical blogs, company engineering blogs, package registries, Stack Overflow, talks, personal sites, and portfolios.",
    },
    {
      icon: ListChecks,
      title: "Ranked candidate pool",
      desc: "Each scan reviews targeted profiles and preserves the full ranked pool, with recommended candidates marked inside it.",
    },
    {
      icon: ListChecks,
      title: "Fit reasons and risks",
      desc: "Shows why the candidate fits, what might block the match, and what evidence is safe to reference.",
    },
    {
      icon: Mail,
      title: "Outreach drafts",
      desc: "Creates personalized outreach starting points from profile fit and candidate research. Nothing is sent automatically.",
    },
  ];

  return (
    <section id="features" data-growth-section="功能" className="min-h-[calc(100vh-4.5rem)] scroll-mt-[4.5rem] border-t border-slate-200 bg-white pt-8 pb-16 sm:pt-8 sm:pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Features
            </p>
            <h2 className="max-w-xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Technical sourcing work, compressed into one review surface.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-slate-600">
            The product is built around the work a technical headhunter needs before putting a candidate in front of a client.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-indigo-700 ring-1 ring-slate-200">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-3 border-t border-slate-200 pt-6 text-sm text-slate-700 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-700" />
            Real profiles, not synthetic candidates
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Research sources stay separated from risks
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

export function SampleFeedbackSection() {
  const feedback = [
    {
      quote:
        "I spend less time switching between profiles and more time having useful conversations with candidates.",
      role: "Example, boutique technical recruiter",
    },
    {
      quote:
        "The value is not just finding more names. It is quickly seeing which profiles deserve a closer look.",
      role: "Example, technical recruiting firm",
    },
    {
      quote:
        "Hirelix gives us a clearer first pass on difficult engineering searches.",
      role: "Example, AI recruiting team",
    },
  ];

  return (
    <section
      id="sample-feedback"
      data-growth-section="示例反馈"
      className="border-t border-slate-200 bg-slate-50 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Sample feedback
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            More time for the conversations that matter.
          </h2>
          <p className="mx-auto mt-4 text-base leading-7 text-slate-600">
            Illustrative feedback showing the kind of value Hirelix is designed to create for technical recruiters.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {feedback.map((item) => (
            <figure
              key={item.quote}
              className="flex min-h-48 flex-col justify-between rounded-lg border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.045)]"
            >
              <blockquote className="text-base leading-7 text-slate-800">“{item.quote}”</blockquote>
              <figcaption className="mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                {item.role}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ResourcesSection({ onStart }: { onStart: () => void }) {
  const resources = [
    {
      category: "JD examples",
      title: "Backend Engineer JD Template",
      desc: "A clear role brief with the signals Hirelix can turn into technical sourcing.",
    },
    {
      category: "Sourcing guides",
      title: "How to Source AI Engineers",
      desc: "What to check before treating model, infra, and research experience as a match.",
    },
    {
      category: "Skill signal guides",
      title: "How to Evaluate Distributed Systems Experience",
      desc: "The public and profile-level signals that separate real systems work from keyword matching.",
    },
    {
      category: "Outreach templates",
      title: "Passive Candidate Outreach Templates",
      desc: "Message structures for technical candidates when you have evidence worth referencing.",
    },
  ];

  return (
    <section id="resources" data-growth-section="资源" className="min-h-[calc(100vh-4.5rem)] scroll-mt-[4.5rem] border-t border-slate-200 bg-slate-50 pt-8 pb-16 sm:pt-8 sm:pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Resources
            </p>
            <h2 className="max-w-xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Practical references for technical sourcing.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-slate-600">
            Start with examples and checklists, then use the same role context inside Hirelix.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {resources.map((item) => (
            <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.045)]">
              <p className="inline-flex rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
                {item.category}
              </p>
              <h3 className="mt-4 text-lg font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.desc}</p>
              <button
                type="button"
                onClick={onStart}
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-950 underline-offset-4 hover:underline"
              >
                <BookOpen className="h-4 w-4 text-indigo-700" />
                Use this with Hirelix
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
