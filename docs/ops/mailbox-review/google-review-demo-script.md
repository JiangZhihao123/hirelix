# Google Gmail readonly verification recording script

Status: an initial real demonstration is uploaded unlisted; verification is not submitted. The final questionnaire exposed a missing complete consent-screen segment, which is being recaptured. See below.

## Reviewer-visible use case

Hirelix is a personal AI assistant for independent headhunters. On an explicit user request, the assistant searches a connected mailbox for a relevant candidate/client reply or delivery failure notice and reads selected messages. It summarizes the result in the private conversation with source links. It does not synchronize the whole inbox, modify messages, delete mail, or automatically monitor replies. Sending uses the separately verified gmail.send scope and exact-message confirmation.

## Record a continuous real demonstration

1. Show https://hirelix.online and the privacy policy at /privacy. Explain optional mailbox access and AI processing.
2. Show the controlled local/preproduction deployment and mailbox settings with reading not authorized. Identify the test Google account and the application's OAuth client (no secrets).
3. Use English for the Google authorization flow. Click Allow reading and AI analysis. Show the Google account selection, the unverified-app screen (the account owner handles this step), and the full requested gmail.readonly consent. Keep the app name and OAuth client ID visible in the consent screen/address bar. Do not hide the unverified status or expose tokens, codes or secrets. Demonstrate each OAuth client included in the review.
4. Return to settings and show the read grant. Production reading stays disabled throughout this controlled demonstration.
5. In the conversation, request only a specific fictional/test message. Show search and selected-body read tool results, resulting summary and original source link. A no-match result proves a search, not a body read; the demonstration must include a real matching message.
6. Show that a send has a separate recipient/content/attachment preview and sending status. Do not send another message unless explicitly approved.
7. Disconnect the test mailbox; then show that a read attempt is denied and explain how to revoke the grant in Google account settings and request data deletion through Hirelix support.
8. Upload the real recording as an accessible unlisted video and put its URL in Google Auth Platform Data Access. Review all requested claims before submitting verification.

## Verified evidence available

- Outlook test subject: Hirelix 邮箱接入测试. One explicitly approved email was accepted by Microsoft and its sent copy was read through the real Agent tools.
- Local Google readonly OAuth consent and real scoped search succeeded. At 16:02 Asia/Shanghai, the test message was not found in Gmail. Do not manufacture a matching Gmail read result or claim receipt.
- Production Gmail and Microsoft reading flags are false. Production web and worker release efc9b49 passed their deployments (Actions 39015998192).
- Direct Microsoft folder lookup confirms the original test is in Sent Items, not Outbox or Drafts; recipient delivery is still unconfirmed. Do not use this sent copy as the Gmail incoming-read demonstration.
- A separate owner-approved Outlook for Mac control, `Hirelix 双向验收 M2G`, reached Gmail INBOX at 16:30:28 Asia/Shanghai. At 16:32, the real Hirelix Agent searched and read this exact message and returned its correct Chinese body, labels and source link. Gmail message ID: `1a148fbde4a0ab2f`; screenshot `/tmp/hirelix-gmail-incoming-verified.png`. This is now a real matching Gmail message suitable for the controlled demo; it does not prove delivery of the earlier API message. The temporary local Gmail reading gate was restored false after this test.

## Remaining review blockers

- A complete real recording covering consent, Gmail matched-message read and disconnect has not been produced.
- Document the configured AI processor's applicable data-use, retention and subprocessors terms against Google policy. Zero retention is not an assumed universal requirement. Use published applicable terms or an agreement; do not invent a no-training or zero-retention promise.
- The DeepSeek inquiry is supplementary evidence, not a prerequisite to development or preparation. Continue the demo and submission materials using verifiable published terms; identify any specific unresolved policy requirement separately. Do not claim an opt-out became effective just because it was requested.
- Initiate and complete Google's required restricted-scope security assessment process as directed by the review team; do not claim certification or pay for an assessment without approval.

Official references:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html

## Latest recording status — 2026-10-17

- Microsoft production reading is now enabled and verified; the earlier both-flags-off evidence above is historical. Google production reading remains disabled.
- Local Chrome captured genuine Gmail account selection, the unverified-app warning, successful connection, privacy disclosure, and a fresh Agent search and selected-message read of the owner-approved M2G test.
- Local assembled video: `/tmp/hirelix-google-review-demo-final.mp4` (76.7 seconds). Unrelated conversation history is masked. It combines captured segments; the owner completed the warning/consent while recording was paused, so the permission confirmation clicks are not included. Do not describe it as a continuous complete OAuth recording.
- YouTube Studio identity verification completed. Upload remains pending action-time acceptance of the terms displayed by YouTube; no video link exists yet. Google submission remains pending.
- Local Gmail reading is temporarily enabled for this demonstration; production Gmail reading was not enabled.

### Upload and final questionnaire

- Owner approved YouTube upload and its displayed terms. Initial video uploaded as unlisted: https://youtu.be/emOsyxbx1ss . Its description explicitly discloses the missing permission confirmation clicks.
- Google Data Access saved this URL and the gmail.send justification. Final submission opens a questionnaire requiring confirmation that all verification requirements are met. That confirmation has NOT been checked and the application has NOT been submitted.
- Official requirements explicitly require a complete English OAuth consent screen. A fresh local reconnect was started to capture it. The owner is asked to pass only the unverified-app warning and stop on the consent page. Local Gmail is temporarily disconnected pending this flow.
