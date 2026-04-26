import { CircleHelp } from "lucide-react";
import { billingFaqs } from "./data";

export function BillingFaqSection() {
  return (
    <section className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Billing FAQ
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Billing questions answered up front
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            What happens when you upgrade, cancel, or hit a usage cap.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {billingFaqs.map((faq) => (
            <div
              key={faq.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all hover:border-sky-200 hover:shadow-[0_14px_36px_rgba(14,165,233,0.1)]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                  <CircleHelp className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-950">{faq.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
