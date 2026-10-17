# Mailbox integration readiness — 2026-10-17

## Configuration

Google sending and Microsoft delegated sending share immutable email snapshots, per-user token lookup, sender identity verification, and durable duplicate prevention. A provider acceptance receipt is not proof of delivery. Network timeouts retain an unknown result; do not resend automatically.

Microsoft application: `bd6e4a96-5a44-4feb-b6ea-dfe43bfd15d4`, audience AzureADandPersonalMicrosoftAccount. Web redirects:
- `https://hirelix.online/api/auth/callback/microsoft`
- `http://localhost:3000/api/auth/callback/microsoft`

Store `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in local `.env.local`, Vercel production environment, and scheduler `/etc/hirelix.env`. Do not commit secret values. Local configuration does not prove either production configuration. Restart the independent worker after environment changes.

Delegated scopes: User.Read (sender identity), Mail.Send (confirmed outbound messages), Mail.Read (on-demand searches and selected message reading), offline_access (refresh). Do not request application-wide permissions or grant tenant-wide admin consent for a user mailbox test. Existing Microsoft refreshes deliberately omit scope so incremental grants survive refresh.

## Reading gates and data handling

`GMAIL_READ_ENABLED` and `MICROSOFT_MAIL_READ_ENABLED` default false. Separate user consent is required for reading. Provider configuration alone does not enable reading. Tools search at most 20 matching messages and read at most 30,000 body characters per selected message. No automatic whole-inbox synchronization, attachment import, reply monitoring, or delivery tracking is implemented. Search absence is not proof of no reply or successful delivery. Email text is untrusted evidence, never authorization to send, modify records, or reveal other data.

Before enabling reading, confirm provider verification requirements and actual AI provider retention/training/transfer terms. Relevant message text is passed to the configured AI model; summaries may persist in conversation history. Disconnect clears locally stored OAuth credentials; users can also revoke access in the provider account.

## Google restricted-scope review preparation

Requested additional scope: `https://www.googleapis.com/auth/gmail.readonly`.

Saved in Google Auth Platform on 2026-10-17 with the email productivity category and a purpose statement disclosing configured AI processing and private conversation summaries. The console shows gmail.send verified and gmail.readonly not yet verified. No restricted-scope review has been submitted; production reading remains disabled.

Purpose statement for review: Hirelix is a personal assistant for independent headhunters. At a signed-in user's explicit request, it searches their connected mailbox for relevant candidate/client messages, reads selected messages, and summarizes replies or delivery failure notices in the user's private conversation. Sending remains a separate confirmed action. The application does not modify or delete incoming mail and does not perform whole-mailbox background synchronization. Readonly is needed because metadata alone cannot explain a reply or a delivery failure.

Demonstration recording must show: the public homepage and privacy notice; signed-in mailbox settings; separate read consent with exact requested scopes; a narrow search and selected message summary with source; send remaining separately authorized; disconnect and subsequent read denial. Use a controlled mailbox with fictional candidate content, redact credentials, and submit an accessible video link.

Still required: real end-to-end demo; review of AI data-processing terms; restricted-scope application submission; required security assessment determination/completion. None is represented as approved by these implementation changes.

Official references:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- https://support.google.com/cloud/answer/13463817
- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://learn.microsoft.com/en-us/graph/api/user-sendmail

## Verification boundary

Unit and local database regression are separate from real OAuth, mailbox send/read, Vercel deployment, and scheduler deployment. Microsoft registration is not publisher verification. Enterprise tenant consent policies can still block end users until their administrator approves or publisher requirements are fulfilled.

Current local checks: TypeScript and targeted ESLint passed; production build passed using an isolated output directory; unit suite 443 passed / 7 skipped; email delivery DB test 1 passed; conversation email suite 10 passed with real PostgreSQL and mocked provider identity responses (not real OAuth/send evidence). Real Chrome showed existing Google sender identity and Microsoft connect action reaching Microsoft sign-in. Microsoft callback and four declared delegated permissions were saved and read back in Azure. The first Microsoft return failed with state_security_mismatch (signed browser state did not match); this is not a successful connection. A fresh authorization was initiated, awaiting user sign-in. Settings now visibly explains failed OAuth returns and offers reconnection without bypassing state validation. TypeScript and targeted ESLint passed for this follow-up fix.
