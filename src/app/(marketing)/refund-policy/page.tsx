import type { Metadata } from "next";
import { MarketingLegalPage } from "@/components/MarketingLegalPage";

export const metadata: Metadata = {
  title: "Refund Policy | Hirelix",
  description: "Refund Policy for Hirelix.",
};

export default function RefundPolicyPage() {
  return (
    <MarketingLegalPage
      eyebrow="Refunds"
      title="Refund Policy"
      description="This policy explains how refunds and cancellations work for Hirelix purchases made through Paddle."
      effectiveDate="March 13, 2026"
      sections={[
        {
          title: "14-day refund window",
          body: (
            <>
              <p>
                Purchases made through Paddle are eligible for a refund within 14 days of the
                transaction date.
              </p>
              <p>
                For subscriptions, refunds are available within 14 days of the initial purchase
                date or the most recent renewal date.
              </p>
              <p>
                To request a refund, contact{" "}
                <a className="text-sky-200 hover:text-white" href="mailto:support@hirelix.online">
                  support@hirelix.online
                </a>{" "}
                and include the email address used for purchase. You can also contact Paddle buyer
                support through paddle.net for transaction-related help.
              </p>
            </>
          ),
        },
        {
          title: "Cancellation timing",
          body: (
            <>
              <p>
                Subscriptions renew automatically until canceled. You can cancel at any time from
                billing settings or by emailing support. Cancellations apply at the end of the
                current billing period.
              </p>
            </>
          ),
        },
        {
          title: "Support",
          body: (
            <>
              <p>
                For billing or refund questions, contact YieldMirror at{" "}
                <a className="text-sky-200 hover:text-white" href="mailto:support@hirelix.online">
                  support@hirelix.online
                </a>
                . We aim to respond within 2 business days.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
