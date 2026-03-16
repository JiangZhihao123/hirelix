import type { Metadata } from "next";
import { MarketingLegalPage } from "@/components/MarketingLegalPage";

export const metadata: Metadata = {
  title: "Contact | Hirelix",
  description: "Contact YieldMirror about Hirelix.",
};

export default function ContactPage() {
  return (
    <MarketingLegalPage
      eyebrow="Contact"
      title="Contact Hirelix"
      description="For support, billing questions, refund requests, or product feedback, contact YieldMirror about Hirelix by email."
      effectiveDate="March 13, 2026"
      sections={[
        {
          title: "Support email",
          body: (
            <>
              <p>
                Email{" "}
                <a className="text-sky-200 hover:text-white" href="mailto:support@hirelix.online">
                  support@hirelix.online
                </a>{" "}
                for technical support, billing questions, subscription cancellations, and refund
                requests.
              </p>
            </>
          ),
        },
        {
          title: "Response times",
          body: (
            <>
              <p>We aim to respond within 2 business days.</p>
            </>
          ),
        },
        {
          title: "Who you are contacting",
          body: (
            <>
              <p>Hirelix is a product operated by YieldMirror.</p>
            </>
          ),
        },
      ]}
    />
  );
}
