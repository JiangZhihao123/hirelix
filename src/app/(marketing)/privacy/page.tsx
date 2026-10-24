import { publicMetadata } from "@/lib/seo";
import { MarketingLegalPage } from "@/components/MarketingLegalPage";

export const metadata = publicMetadata("/privacy", "Privacy Policy | Hirelix", "Privacy Policy for Hirelix.");

export default function PrivacyPage() {
  return (
    <MarketingLegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains what information Hirelix, a product operated by YieldMirror, collects, how we use it, which service providers help us operate the product, and how to contact us with privacy questions."
      effectiveDate="October 19, 2026"
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
                Product feedback includes the text and optional screenshot you submit, your
                account email, the page route, product version, and submission time. It is
                available to our support administrator, and a notification containing your
                feedback is sent to our support mailbox. We do not automatically attach your
                CVs, candidate records, or conversation content. Screenshots are stored privately;
                please remove information you do not wish to share before submitting them.
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
          title: "Website and product analytics",
          body: (<><p>We use first-party analytics to understand visits, referral sources, page engagement, product actions, document views and exports, and technical failures. A random browser identifier and a session identifier help count visits. First and most recent acquisition labels are kept in your browser for up to 90 days. A first-party cookie carries these labels and random identifiers through sign-in so that account creation can be attributed without recording your email in analytics. We also record request IP addresses, browser user agents, and approximate country information for traffic quality and diagnostics. When you sign in, server-verified account identifiers link usage to your account so we can understand activation and return visits.</p><p>Analytics events do not include your conversation text, CV contents, candidate names, email bodies, form input values, or private sharing tokens. We use saved business records to calculate aggregate outcomes and account creation counts. Browser blocking or missing referral information can limit these measurements. Analytics access is restricted to operators.</p><p>Website and private workspace interaction events are recorded by our own service; the application does not load Google Analytics or Google Ads tracking scripts. You can ask us about your analytics data or request account deletion using the contact details below.</p></>),
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
          title: "Optional email connections",
          body: (
            <>
              <p>Connecting a mailbox is optional and separate from signing in. Hirelix supports
                Google Gmail / Google Workspace and, when configured, Microsoft Outlook / Microsoft 365.
                Sending uses gmail.send or Microsoft Mail.Send. You review the sender, recipient,
                subject, message and attachments before confirming a send. Provider acceptance
                does not confirm recipient delivery or that a message was read.</p>
              <p>Mailbox reading is a separate, optional permission, offered only when enabled for
                the provider. It uses gmail.readonly or Microsoft Mail.Read to search messages and
                read selected messages relevant to your requests, including replies and delivery
                failure notices. We do not request permission to delete mail, modify labels or
                manage server-side drafts. We do not automatically copy your entire mailbox.</p>
              <p>When you enable reading and request email assistance, relevant message headers
                and content are processed by our AI providers to answer your request. Raw retrieved
                email is not stored as a separate mailbox archive. Summaries, quoted excerpts and
                records you ask us to save may remain in your Hirelix conversation or workspace.
                We do not use Google or Microsoft mailbox data to train generalized AI models.
                Read access remains unavailable until the provider verification and appropriate
                AI data-processing arrangements are in place.</p>
              <p>Access and refresh tokens are held in our server-side authentication database;
                they are never supplied to the AI assistant. We retain reviewed outgoing messages,
                attachment references, sender, recipient, timestamps and send receipts to show
                history and prevent duplicate sends. Microsoft may accept a send without returning
                a provider message identifier.</p>
              <p>Use Email connections in Settings to disconnect a mailbox and remove its stored
                API credentials. You can also revoke access in your Google or Microsoft account.
                Disconnecting stops future API access but does not delete messages already sent,
                your Hirelix account, conversations or saved records. For deletion of retained
                workspace data, contact support@hirelix.online from your account address; the
                deletion and backup provisions below apply.</p>
              <p>Hirelix&apos;s use and transfer of information received from Google APIs adheres to
                the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google
                API Services User Data Policy</a>, including its Limited Use requirements.
                We do not sell mailbox data, use it for advertising or use it to train generalized
                AI models. Relevant email content is transferred only to provide the user-facing
                assistance you request, subject to your consent.</p>
            </>
          ),
        },
        {
          title: "Service providers",
          body: (
            <>
              <p>
                We rely on third-party providers to operate the service, including Vercel for
                hosting, Google for sign-in and optional Gmail access, Microsoft for optional Outlook access, and a self-hosted PostgreSQL database for workspace
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
