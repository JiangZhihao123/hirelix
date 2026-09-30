import type { Metadata } from "next";
import { MarketingLegalPage } from "@/components/MarketingLegalPage";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: "Privacy Policy | Hirelix",
  description: "Privacy Policy for Hirelix.",
};

export default function PrivacyPage() {
  return (
    <MarketingLegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains what information Hirelix, a product operated by YieldMirror, collects, how we use it, which service providers help us operate the product, and how to contact us with privacy questions."
      effectiveDate="October 1, 2026"
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
                identifiers, task and usage records, billing state, and support information you
                send to us directly. Google sign-in provides account information needed to
                authenticate you.
              </p>
              <p>
                Your private workspace can contain uploaded CVs and candidate lists, candidate
                profiles, recruiter notes, job descriptions, client requirements and feedback,
                conversations, source records, and generated drafts with their saved versions.
                We store this material to provide your workspace and keep it available between
                visits. Optional sourcing and candidate research also process search criteria,
                public profile evidence, and related workflow records.
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
                retrieve and assess candidates for a specific role, prepare client materials,
                manage subscriptions and usage allowances,
                improve product performance, prevent abuse, and respond to support requests.
              </p>
              <p>
                AI tasks send relevant conversation text and selected workspace evidence to our
                AI providers. Candidate retrieval sends candidate text and queries to an
                embedding provider. Client drafts use the profile information and supporting
                notes selected in preparation. Preparing or copying a draft does not send it to
                a client or candidate.
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
                hosting, Google for sign-in, and a self-hosted PostgreSQL database for workspace
                files, application and authentication records. DeepSeek handles AI generation;
                OpenRouter may provide fallback model access. SiliconFlow provides embeddings
                used for candidate retrieval. Paddle handles payments and subscriptions. Resend
                supports account and configured product emails. Optional sourcing and research
                use services such as Bright Data, Serper, GitHub, Apollo and Hunter when those
                features are used and configured.
              </p>
              <p>
                Providers process the information needed for their functions under their own
                terms and privacy policies, and may operate in countries different from yours.
                Payment details are entered into Paddle checkout; Hirelix stores customer,
                subscription and transaction references rather than full card details. See{" "}
                <a href="https://www.paddle.com/legal/privacy">Paddle&apos;s privacy policy</a>
                {" "}and <a href="https://openrouter.ai/privacy">OpenRouter&apos;s privacy policy</a>.
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
          title: "Access, export and deletion requests",
          body: (
            <>
              <p>
                Candidate records can be exported from the candidate workspace, and generated
                client materials can be downloaded. For account-wide access, correction, export
                or deletion requests, email{" "}
                <a href="mailto:support@hirelix.online?subject=Hirelix%20privacy%20request">
                  support@hirelix.online
                </a>
                {" "}from the address used for your account. These requests are handled by support;
                there is no instant self-service account deletion control. We verify ownership
                before acting. Deleted information may remain in restricted backups until they
                rotate out, and billing records may need to be retained for accounting or legal
                obligations.
              </p>
              <p>
                Upload and share candidate information only when you have the authority to do
                so. Candidate availability, interest and permission to share with a client are
                separate facts; Hirelix does not infer them from a saved profile.
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
