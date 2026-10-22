import Link from "next/link";
import { AGENT_PLAN } from "@/lib/agent-plan";
import { firstAssignmentPrompt } from "@/lib/landing-content";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata(
  "/pricing",
  "Hirelix Pro Pricing & Free Trial",
  `Your long-term recruiting assistant: $${AGENT_PLAN.monthlyCents / 100}/month or $${AGENT_PLAN.annualCents / 100}/year. Try Hirelix for ${AGENT_PLAN.trialDays} days with ${AGENT_PLAN.trialCredits} AI credits, no card required.`,
);

export default function PricingPage() {
  return (
    <>
      <p className="ha-eyebrow">ONE ASSISTANT. WORK THAT BUILDS OVER TIME.</p>
      <h1>A personal assistant for your recruiting desk.</h1>
      <p className="hr-intro">
        Start with a {AGENT_PLAN.trialDays}-day trial and{" "}
        {AGENT_PLAN.trialCredits} AI credits. No card required. Choose a
        subscription when you are ready; the trial does not automatically become
        a paid plan.
      </p>
      <section className="hr-price-grid" aria-label="Hirelix Pro billing options">
        {[
          {
            code: "agent_monthly",
            amount: AGENT_PLAN.monthlyCents / 100,
            period: "month",
            title: "Monthly",
          },
          {
            code: "agent_annual",
            amount: AGENT_PLAN.annualCents / 100,
            period: "year",
            title: "Annual",
          },
        ].map((plan) => (
          <article key={plan.code}>
            <h2>{AGENT_PLAN.name}</h2>
            <p>{plan.title === "Monthly" ? "Billed monthly" : "Billed annually"}</p>
            <p>
              <strong>${plan.amount}</strong> / {plan.period}
            </p>
            <p>USD, plus applicable tax.</p>
            <p>
              {AGENT_PLAN.monthlyCredits.toLocaleString("en-US")} AI credits
              each monthly subscription period.
            </p>
            <Link
              className="ha-button"
              href={`/app?entry=free_trial&plan=${plan.code}&prompt=${encodeURIComponent(firstAssignmentPrompt)}`}
            >
              Start free trial
            </Link>
          </article>
        ))}
      </section>
      <section>
        <h2>What Hirelix Pro includes</h2>
        <ul>
          <li>
            A conversational assistant for your candidates, client roles, and
            client work.
          </li>
          <li>
            Saved profiles, source materials, conversation history, and explicit
            assistant preferences.
          </li>
          <li>
            CV and CSV imports, candidate rediscovery, client drafts, and
            exports.
          </li>
          <li>
            Recurring role-update drafts when you agree on the schedule and
            scope.
          </li>
        </ul>
        <p>
          Annual billing saves $
          {(AGENT_PLAN.monthlyCents * 12 - AGENT_PLAN.annualCents) / 100}{" "}
          compared with 12 monthly payments. Annual subscriptions receive
          credits each month, rather than a full year’s credits at once.
        </p>
      </section>
      <section>
        <h2>How AI credits work</h2>
        <p>
          AI work uses credits based on the services consumed. Longer or more
          complex work may use more credits. Credits are not a fixed number of
          tasks, candidates, or messages. Only completed work is charged; system
          retries, automatic indexing, and follow-on imports are included.
        </p>
        <p>
          Monthly credits reset after a successful renewal. Annual plans receive a new allowance each month on the subscription anniversary. Shorter months use their last day, and unused credits do not roll over. Your
          saved work stays available when AI access ends. The trial allowance is{" "}
          {AGENT_PLAN.trialCredits} credits for the {AGENT_PLAN.trialDays}-day
          trial, not the paid monthly allowance.
        </p>
      </section>
      <section>
        <h2>Renewal, cancellation, and support</h2>
        <p>
          Subscriptions renew until canceled. Manage cancellation from billing
          settings or contact{" "}
          <a href="mailto:support@hirelix.online">support@hirelix.online</a>.
          Read the <Link href="/refund-policy">Refund Policy</Link> and{" "}
          <Link href="/terms">Terms of Service</Link> before subscribing.
        </p>
      </section>
      <section className="hr-related">
        <h2>Get to know your assistant</h2>
        <p>
          <Link href="/product">How Hirelix builds on your saved work</Link>
        </p>
        <p>
          <Link href="/guides/candidate-rediscovery">
            A practical candidate rediscovery workflow
          </Link>
        </p>
      </section>
    </>
  );
}
