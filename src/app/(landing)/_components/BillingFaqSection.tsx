import { CircleHelp } from "lucide-react";
import { billingFaqs } from "./data";

export function BillingFaqSection() {
  return (
    <section className="border-t border-slate-200 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Billing questions answered up front
          </h2>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {billingFaqs.map((faq) => (
            <div key={faq.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{faq.title}</h3>
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
