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

### 2026-10-17 real-chain follow-up

- Explicitly approved one Outlook-to-Gmail message, exact subject `Hirelix 邮箱接入测试`, no attachment. Microsoft accepted it once; durable receipt `30cebb15-b740-40de-9c98-997e3fe0d1da`. Conversation `70ea19ee-894a-4dc8-933c-16b63dafe5c3` shows preview, sending, acceptance and a textual result.
- Local Microsoft Mail.Read and Google gmail.readonly consent completed with the owner's approval. Real Agent search/read found the exact Outlook sent message and verified its body. Gmail matching search returned no messages; bounded related failure searches found no matching notice. Recipient delivery remains unconfirmed, and no second message was sent.
- Fixed local web/worker configuration drift: a development-only bootstrap reloads env before clients import, and the supervisor explicitly watches hidden env files. Verified an actual worker restart after touching `.env.local`; tsx `--include` alone did not restart for this hidden file.
- Vercel and `/etc/hirelix.env` have Microsoft credentials and both production read flags explicitly false. No secret values are in this record. Release `b07ecef` passed CI/CD run `39015393415`; Vercel deployment `dpl_FwdhDNZ4uCuFGjbeQDYiFcTi1fDF` is Ready on hirelix.online, and VPS worker readback is b07ecef/active. Later follow-up commits require their own release evidence.
- Google review remains unsubmitted. Do not describe saved scope configuration or local consent as review approval. Remaining submission material includes a complete real consent/read/disconnect demonstration video and verified AI processor data-use terms; restricted-scope server handling also needs the Google-required security assessment process.
- Production OAuth subsequently completed for the same Outlook mailbox: the live settings page shows the sender with sending available and reading unavailable. Screenshot: `/tmp/hirelix-production-mailboxes.png`. The controlled local read flags were restored to false after verification; OAuth grants remain stored. No new message was sent during production connection.
- Follow-up release `efc9b49`: GitHub Actions run `39015998192` completed successfully; Vercel deployment `dpl_6uGxtgeMPGbCKxVGji4qVR5VoiMP` is Ready and VPS readback confirms `efc9b49` with the scheduler active. Unit regression: 449 passed, 8 skipped; TypeScript passed.
- With explicit owner authorization, sent one data-processing inquiry from the owner's Gmail to DeepSeek's privacy contact, requesting API training opt-out, retention terms and a DPA. Gmail returned SENT (message `1a148e9d38e9c24c`). No credentials or user mail content were included. This is an inquiry, not confirmation of terms or review readiness; a reply remains required.
- Delivery investigation: Graph confirms the original test is in `Sent Items`, `isDraft=false`, sent at `2026-10-17T07:53:43Z`. A direct folder query (not search indexing) covering Inbox, Junk Email, Deleted Items and Outbox since 07:50Z found no matching failure notice and no queued outgoing message. Gmail `in:anywhere` search still found no matching test message. This narrows the evidence but does not establish a delivery cause. Two additional cross-provider control emails await explicit sending approval.
- Read results now include Microsoft folder, draft status and sent timestamp, or Google labels. The Agent is instructed not to mistake a sent copy for recipient receipt. Real Microsoft readback verified the added folder fields; four targeted mock/contract regression tests, TypeScript and targeted ESLint passed. Production read gates remain off pending data-processing readiness; no credentials or production gates changed during this investigation.
- Bidirectional follow-up approved by the owner: Gmail sent exactly one `Hirelix 双向验收 G2M` test (Gmail SENT id `1a148f66b31a2d37`). Microsoft received it in Inbox at `2026-10-17T08:24:33Z`, two seconds after its send timestamp. The real Hirelix Agent searched and read this exact incoming message in conversation `70ea19ee-894a-4dc8-933c-16b63dafe5c3`, returned the correct body, folder, time and source link. Screenshot: `/tmp/hirelix-microsoft-incoming-verified.png`. Local Microsoft read gate was temporarily enabled for this authorized test and restored false afterward.
- The approved reverse `Hirelix 双向验收 M2G` control has NOT been sent: Outlook web selected an unrelated cached account. The owner identified it as not theirs; no messages were read or sent from it. Correct-account web sign-in is pending. Do not replace the agreed web control with another API send or repeat G2M.
- Release `c96415c` Actions run `39017016754` succeeded; VPS worker readback is `c96415c`/active. Vercel readback for this release remains to be confirmed separately.
- Reverse control completed after the owner opened the correct account in Outlook for Mac (desktop client, not web). Sent `Hirelix 双向验收 M2G` once, exact approved body, no attachment or signature. Gmail confirms INBOX message `1a148fbde4a0ab2f`, received at 08:30:28Z, with SPF/DKIM/DMARC passing. Thus both provider directions work through the official clients/connectors; the original Hirelix MIME API message remains unconfirmed. No conclusion yet identifies MIME, account warm-up or provider filtering as the cause.
- The reverse message declared GB2312, while Gmail full API returned UTF-8-normalized bytes. Read decoding now first accepts valid UTF-8 and otherwise uses the MIME charset. Real Hirelix Gmail readback preserves the exact Chinese body; targeted tests cover normalized UTF-8, original GB2312 and unsupported encoding, with five tests passing and TypeScript passing. The connector's garbled full-body rendering is not evidence that the transmitted message or prior Hirelix decoding was broken.

Unit and local database regression are separate from real OAuth, mailbox send/read, Vercel deployment, and scheduler deployment. Microsoft registration is not publisher verification. Enterprise tenant consent policies can still block end users until their administrator approves or publisher requirements are fulfilled.

Follow-up real Chrome verification: after a fresh authorization and user sign-in, localhost returned to `/app/settings` without an OAuth error. Settings showed the actual Outlook mailbox identity with Sending enabled and Reading not authorized. This confirms the local authorization/identity chain, not a real message send, delivery, read, or production connection. Reading remains unavailable. Screenshot: `/tmp/hirelix-microsoft-connected.png`.

Current local checks: TypeScript and targeted ESLint passed; production build passed using an isolated output directory; unit suite 443 passed / 7 skipped; email delivery DB test 1 passed; conversation email suite 10 passed with real PostgreSQL and mocked provider identity responses (not real OAuth/send evidence). Real Chrome showed existing Google sender identity and Microsoft connect action reaching Microsoft sign-in. Microsoft callback and four declared delegated permissions were saved and read back in Azure. The first Microsoft return failed with state_security_mismatch (signed browser state did not match); this is not a successful connection. A fresh authorization was initiated, awaiting user sign-in. Settings now visibly explains failed OAuth returns and offers reconnection without bypassing state validation. TypeScript and targeted ESLint passed for this follow-up fix.

## 17:12 JSON delivery control

The owner approved the previously proposed single Graph JSON control. Sent exactly once from noah.jiang2@outlook.com to noahjiang2@gmail.com, subject `Hirelix Graph JSON 投递验证`, body `Hirelix API 投递验证，无需回复。`, no attachments. Identity was checked before POST; an exclusive local attempt marker prevents accidental repeat. Graph returned 202 at 09:12:20Z, request ID `4aff6d5b-1a5b-40a2-835b-70236310663a`.

Gmail confirms INBOX message `1a149223c2e7a94b`, received at 09:12:23Z, with SPF/DKIM/DMARC passing. This demonstrates that delegated Graph JSON sending can deliver from this account to Gmail. It does not isolate why the original MIME send was not received: format, message content, time, and Microsoft-generated headers differ. Production sending has not been replaced based on this one control, and the original message has not been resent. An attachment-capable production transport change still requires implementation and validation; the JSON inline attachment size constraints must be respected.

Release readback: Actions `39017785838` for `06a7237` succeeded; VPS is `06a7237` and scheduler active. A fresh Vercel confirmation is still outstanding. No DeepSeek reply was found in the bounded 2026-10-17 search. Production reading remains disabled; Google review remains unsubmitted pending actual demonstration and processor/security requirements.

## JSON implementation follow-up

Microsoft sends now use Graph JSON for both conversation and recommendation delivery. Existing snapshot ownership, attachment hashes, sender identity and duplicate-prevention checks remain shared. Binary attachments use fileAttachment/base64. Files of 3 MiB or more, or an aggregate serialized request of 4 MiB or more, are rejected before delivery reservation with an instruction to use a share link/smaller files. Large-file upload sessions are not implemented; no extra Mail.ReadWrite grant is requested. Gmail retains MIME sending. Microsoft generates its transport Message-ID; the existing snapshot message_id is only an internal correlation value for this path.

Five focused regression tests pass, covering read evidence, Unicode, binary attachment round-trip and size rejection. These are contract tests, not real attachment delivery proof. The earlier owner-approved JSON control proved no-attachment delivery. A separate exact-message attachment acceptance test has been requested. DeepSeek email confirmation is no longer treated as a prerequisite to development or review preparation; actual applicable data-use terms must still be represented accurately.

## 17:21 real attachment control

With explicit owner approval, sent exactly one `Hirelix 附件投递验收` from noah.jiang2@outlook.com to noahjiang2@gmail.com with the approved body and `hirelix-verification.txt` containing `Hirelix attachment verification`. The one-off sender invoked the production `microsoftSendBody` serializer after checking the actual connected sender; an exclusive attempt marker prevents repeat. Graph accepted at 09:21:30Z, request ID `63510168-80d2-4be9-bf50-96b3f89b6406`.

Gmail INBOX message `1a1492a9cf1fad0b` has the correct sender, recipient, subject and body snippet. SPF/DKIM/DMARC pass. The attachment was fetched through Gmail and its complete extracted text matches the approved content. This proves real JSON attachment transport and recipient retrieval, not a full UI-to-delivery replay or byte-identical MIME preservation. No extra test message was sent.

Release verification: code commit `3018b2e` passed Actions run `39020788161`; its Vercel commit status is success (deployment `66DY7kgrEFMoJq5jo11dpzF3Ex99`), and VPS readback confirms `3018b2e` with `hirelix-scheduler` active. The evidence-only follow-up commit does not change runtime behavior.

## Production Microsoft reading enabled

On explicit owner instruction, set MICROSOFT_MAIL_READ_ENABLED=true in Vercel production and /etc/hirelix.env, restarted the scheduler (active), and redeployed the existing production web release. Deployment dpl_BS2PJfxwFjV1NcepFvBCwq81xv7Q reached READY. Google production reading remains false. The production settings page shows noah.jiang2@outlook.com can send and read; no new OAuth grant was required.

A real production Agent request searched only the approved G2M test and read it successfully: correct sender, exact body, Inbox and received timestamp 2026-10-17 16:24:33 Asia/Shanghai. Evidence: /tmp/hirelix-production-read-enabled.png and /tmp/hirelix-production-read-verified.png. This is production read evidence, not just an environment change.

Google verification submission page was opened and inspected. Branding is verified; gmail.readonly remains unverified. The console explicitly blocks confirmation because the demonstration video URL is missing. Additional explanatory text was entered but not submitted. Recording capability was checked; the actual Gmail connection had meanwhile been disconnected by another task, and its OAuth tab 1961200840 is owned by that task. No attempt was made to take over or restart that OAuth flow. The incomplete recording is not submission evidence. Local Gmail read flag was restored false. A complete real demonstration video and accessible URL remain required before submission; DeepSeek email reply is not the blocker.
