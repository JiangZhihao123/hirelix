import { publicMetadata } from "@/lib/seo";
import { MarketingLegalPage } from "@/components/MarketingLegalPage";

export const metadata = publicMetadata("/terms", "Terms of Service | Hirelix", "Terms of Service for Hirelix.");

export default function TermsPage() {
  return (
    <MarketingLegalPage
      eyebrow="Terms"
      title="Terms of Service"
      description="These terms govern your use of Hirelix, a product operated by YieldMirror, including your account, subscriptions, and product usage."
      effectiveDate="October 1, 2026"
      sections={[
        {
          title: "Using the service",
          body: (
            <>
              <p>
                Hirelix is a personal AI workspace operated by YieldMirror for professional
                headhunters to work with candidate information, client roles and reviewed client
                materials. Optional sourcing and research support this work. These terms form an agreement between you
                and YieldMirror for your use of Hirelix.
              </p>
              <p>
                You agree to use the service only for lawful business purposes and in a way that
                does not interfere with other users or the integrity of the platform.
              </p>
            </>
          ),
        },
        {
          title: "Accounts and access",
          body: (
            <>
              <p>
                You are responsible for your account, login method, and all activity under your
                account. You must provide accurate information and keep your access credentials
                secure.
              </p>
            </>
          ),
        },
        {
          title: "Your information and AI-assisted work",
          body: (
            <>
              <p>
                You are responsible for having permission to upload and process candidate and
                client information, and for checking the facts, suitability and sharing permission
                before using an AI-generated assessment or draft. Generated content can be
                incomplete or inaccurate and does not establish a candidate&apos;s interest,
                availability or consent. You remain responsible for recruiting decisions.
              </p>
              <p>
                Creating, saving, exporting or copying a draft does not send it to a client or
                candidate. Recording a submission is a record of an action you took outside
                Hirelix. Task allowances and any additional sourcing limits are shown in the
                product and billing settings; access to stored material is separate from the
                allowance to start new AI tasks.
              </p>
            </>
          ),
        },
        {
          title: "Subscriptions, renewals, and cancellations",
          body: (
            <>
              <p>
                Paid plans renew automatically until canceled. You can cancel at any time from your
                billing settings or by contacting{" "}
                <a className="text-sky-200 hover:text-white" href="mailto:support@hirelix.online">
                  support@hirelix.online
                </a>
                .
              </p>
              <p>
                Unless otherwise required by law, cancellations take effect at the end of the
                current billing period, and access to paid features remains available through that
                period.
              </p>
            </>
          ),
        },
        {
          title: "Refunds",
          body: (
            <>
              <p>
                Purchases made through Paddle are eligible for a refund within 14 days of the
                transaction date. For subscriptions, refunds are available within 14 days of the
                initial purchase date or the most recent renewal date. Additional details are
                described in the Refund Policy.
              </p>
            </>
          ),
        },
        {
          title: "Restrictions",
          body: (
            <>
              <p>
                You may not use Hirelix to violate laws, infringe rights, abuse external services,
                scrape or export data beyond plan limits, bypass usage controls, or resell access
                to the product without permission from YieldMirror.
              </p>
            </>
          ),
        },
        {
          title: "Disclaimer and limitation of liability",
          body: (
            <>
              <p>
                Hirelix is provided on an as-is and as-available basis. To the maximum extent
                permitted by law, YieldMirror disclaims warranties and is not liable for indirect,
                incidental, special, consequential, or punitive damages arising from your use of
                the service.
              </p>
            </>
          ),
        },
        {
          title: "Contact",
          body: (
            <>
              <p>
                Questions about these terms can be sent to YieldMirror at{" "}
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
