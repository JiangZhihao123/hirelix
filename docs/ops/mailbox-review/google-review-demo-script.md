# Google Gmail readonly verification recording script

Status: preparation only; no video uploaded and no review submitted.

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

## Remaining review blockers

- A complete real recording covering consent, Gmail matched-message read and disconnect has not been produced.
- Confirm the configured AI processor's applicable no-training, retention and subprocessors terms. Do not equate an application privacy statement with an upstream contractual guarantee.
- The owner-approved DeepSeek inquiry has been sent. No response was found during the follow-up check; do not claim an opt-out is effective merely because it was requested.
- Initiate and complete Google's required restricted-scope security assessment process as directed by the review team; do not claim certification or pay for an assessment without approval.

Official references:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html
