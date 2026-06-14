import type { Metadata } from "next";
import { MarketingLegalPage } from "@/components/MarketingLegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Hirelix",
  description: "Privacy Policy for Hirelix.",
};

export default function PrivacyPage() {
  return (
    <MarketingLegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains what information Hirelix, a product operated by YieldMirror, collects, how we use it, which service providers help us operate the product, and how to contact us with privacy questions."
      effectiveDate="March 13, 2026"
      sections={[
        {
          title: "Who operates Hirelix",
          body: (
            <>
              <p>
                Hirelix is a product operated by YieldMirror. In this policy, references to
                Hirelix, we, us, and our refer to YieldMirror operating the Hirelix service.
              </p>
            </>
          ),
        },
        {
          title: "Information we collect",
          body: (
            <>
              <p>
                We collect account details such as your email address and authentication
                identifiers, product usage data such as searches, shortlist actions, and billing
                state, and support information you send to us directly.
              </p>
              <p>
                When you use Hirelix to search and enrich candidate records, we also process job
                descriptions, candidate shortlist data, company profile information, and related
                workflow metadata needed to operate the service.
              </p>
            </>
          ),
        },
        {
          title: "How we use information",
          body: (
            <>
              <p>
                We use your information to provide the Hirelix product, authenticate users,
                generate candidate matches and outreach drafts, manage subscriptions and add-ons,
                improve product performance, prevent abuse, and respond to support requests.
              </p>
              <p>
                We may also use aggregated and de-identified usage signals to understand product
                reliability and improve the onboarding and search experience.
              </p>
            </>
          ),
        },
        {
          title: "Service providers",
          body: (
            <>
              <p>
                We rely on third-party providers to operate the service, including Vercel for
                hosting, a self-hosted PostgreSQL database for application and authentication
                records, Paddle for billing, Anthropic and DeepSeek for AI generation, Serper for
                search results, Apollo and Hunter for contact enrichment, and Bright Data for web
                data access.
              </p>
              <p>
                These providers may process data on our behalf only as needed to deliver the
                product or related support and billing functions.
              </p>
            </>
          ),
        },
        {
          title: "Data retention and security",
          body: (
            <>
              <p>
                We retain information for as long as needed to operate the service, meet legal and
                accounting requirements, resolve disputes, and enforce our agreements. We take
                reasonable technical and organizational measures to protect data, but no system can
                guarantee absolute security.
              </p>
            </>
          ),
        },
        {
          title: "Contact",
          body: (
            <>
              <p>
                For privacy questions, requests, or concerns, contact YieldMirror at{" "}
                <a className="text-sky-200 hover:text-white" href="mailto:support@hirelix.online">
                  support@hirelix.online
                </a>
                .
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
