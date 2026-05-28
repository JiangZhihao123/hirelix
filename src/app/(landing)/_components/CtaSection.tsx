import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { legalLinks } from "./data";

export function CtaSection({
  onTrySample,
  onSignIn,
  desktopFooterCtaLabel,
}: {
  onTrySample: () => void;
  onSignIn: () => void;
  desktopFooterCtaLabel: string;
}) {
  return (
    <>
      <section data-growth-section="底部行动" className="relative overflow-hidden border-t border-slate-200 bg-white py-20 sm:py-28">
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Ready when you are
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Start with the role already on your desk.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Paste a client JD, review the evidence-backed shortlist, and edit outreach drafts before anything gets sent.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <a
              href="#hero-form"
              className="hidden items-center gap-2 rounded-lg bg-slate-950 px-8 py-4 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5 hover:bg-slate-800 sm:inline-flex"
            >
              {desktopFooterCtaLabel} <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onTrySample}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-8 py-4 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition-all hover:-translate-y-0.5 hover:bg-slate-800 sm:hidden"
            >
              View sample shortlist <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-sm text-slate-600">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onSignIn}
                className="font-medium text-indigo-700 hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>

          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-700" />
              Real profiles
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              Public evidence research
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Outreach drafts included
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 text-sm text-slate-600 sm:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Hirelix" width={20} height={20} />
              <span className="font-semibold text-slate-950">Hirelix</span>
            </div>
            <p>Evidence-backed technical shortlists from real LinkedIn profiles.</p>
            <p>Built for technical headhunters.</p>
            <p>Support: <a className="text-indigo-700 hover:text-indigo-900" href="mailto:support@hirelix.online">support@hirelix.online</a></p>
            <p>Subscriptions renew automatically until canceled.</p>
            <p>Cancel anytime from billing settings or by emailing support@hirelix.online.</p>
          </div>

          <div className="grid gap-2 sm:justify-self-end sm:text-right">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-slate-950">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
