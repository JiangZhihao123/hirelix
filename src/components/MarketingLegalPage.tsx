import type { ReactNode } from "react";

type LegalSection = {
  title: string;
  body: ReactNode;
};

type MarketingLegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
};

export function MarketingLegalPage({
  eyebrow,
  title,
  description,
  effectiveDate,
  sections,
}: MarketingLegalPageProps) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 shadow-[0_24px_90px_rgba(4,12,24,0.28)] sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/78">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
          {description}
        </p>
        <p className="mt-4 text-sm text-slate-400">Effective date: {effectiveDate}</p>
      </div>

      <div className="mt-10 space-y-6">
        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-7 sm:p-8"
          >
            <h2 className="text-xl font-semibold text-white">{section.title}</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
