import { publicMetadata } from "@/lib/seo";
import { MarketingLegalPage } from "@/components/MarketingLegalPage";

export const metadata = publicMetadata("/privacy", "Privacy Policy | Hirelix", "Privacy Policy for Hirelix.");

export default function PrivacyPage() {
  return (
    <MarketingLegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains what information Hirelix, a product operated by YieldMirror, collects, how we use it, which service providers help us operate the product, and how to contact us with privacy questions."
      effectiveDate="October 3, 2026"
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
          title: "Optional Gmail connection",
          body: (
            <>
              <p>
                Connecting Gmail is optional and separate from signing in with Google.
                We request the gmail.send permission to send a recommendation from your
                connected Google account only when you review the recipient, subject,
                message and selected attachments and choose Send email. We do not request
                permission to read your inbox, search your mailbox, or manage Gmail drafts.
                You can instead copy the email text or create a client share link without
                connecting Gmail.
              </p>
              <p>
                We store the Google access and refresh tokens needed to maintain your
                connection in our server-side authentication database. When you send,
                we transmit the reviewed recipient, subject, message and selected
                attachments to Google for delivery. We retain a delivery record containing
                the sender, recipient, reviewed message, selected attachment references,
                timestamps, delivery status and the message identifier returned by Gmail.
                This supports your delivery history and helps prevent duplicate sends.
                Gmail acceptance does not guarantee that a recipient has read the email.
              </p>
              <p>
                Disconnect Gmail in the recommendation delivery panel to remove the
                stored Google API credentials from your linked account. You can also
                revoke Hirelix access in your Google Account permissions. Disconnecting
                does not delete your Hirelix account, saved recommendations, delivery
                records, or emails already sent. To request deletion of retained
                workspace and delivery data, contact support@hirelix.online from your
                account address; the deletion and backup provisions below apply.
              </p>
              <p>
                Hirelix&apos;s use and transfer of information received from Google APIs
                adheres to the{" "}
                <a href="https://developers.google.com/terms/api-services-user-data-policy">
                  Google API Services User Data Policy
                </a>, including its Limited Use requirements. We do not sell Google
                user data, use it for advertising, or use Google API data to train
                generalized AI models. Gmail credentials and API delivery responses
                are not sent to our AI providers. AI-assisted preparation uses the
                workspace materials you provide, as described above; Gmail access
                does not supply inbox content to the AI assistant.
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
                hosting, Google for sign-in and optional Gmail sending, and a self-hosted PostgreSQL database for workspace
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
