# Hirelix Google OAuth review packet — 7 October 2026

Status: prepared text and capture plan only. Fresh new-client Gmail consent and owner-only self-send/receipt succeeded at 21:06:47 +08:00 (message `1a11679402b5cb00`, SENT and INBOX). No usable recording, YouTube upload or verification submission has completed in this acceptance run. Do not resend the completed self-test merely to repeat a take; plan a separately authorized recording test if required. The scope justification was saved and read back in the Google Console on October 7. The formal submission summary now reports only the demonstration video as missing; Confirm is disabled. Do not submit a placeholder video or reuse the old-client recording.

## Production identity

| Field | Verified value |
| --- | --- |
| Project | Hirelix Production (`loyal-glass-510417-t9`) |
| OAuth client | Hirelix Production Web |
| Client ID | `639029848396-8jeiptd9uu24gnku3pca74o1jteskl2b.apps.googleusercontent.com` |
| Callback | `https://hirelix.online/api/auth/callback/google` |
| Homepage | https://hirelix.online |
| Privacy | https://hirelix.online/privacy |
| Terms | https://hirelix.online/terms |
| Authorized domain | hirelix.online |
| Scope being justified | `https://www.googleapis.com/auth/gmail.send` |

Brand verification is published; sensitive data-access verification remains incomplete. Sign-in also uses email/profile/openid. No Gmail read, modify or restricted mailbox scope is requested. Current production SHA is `9e05f45d77479d301ea8799e49cff52fe91da9ec`; verify the deployed candidate again immediately before capture.

## Scope justification

The following is below the Console's 1,000-character limit. It has been saved into the Console and read back in the formal verification summary.

> Hirelix is a personal AI assistant for headhunters. The optional Gmail integration sends a recommendation only after the user reviews the recipient, subject, body and selected CV attachments and clicks Send email. We use gmail.send only for this user-initiated send. Hirelix does not read or search inboxes, manage Gmail drafts or monitor replies. Basic sign-in scopes cannot send email; the add-on compose scope is for Workspace add-ons and cannot support this standalone web app. Broader gmail.compose, gmail.modify and mail.google.com access is unnecessary. Users can disconnect Gmail and still use copied email text or revocable client links. The demonstration sends verification text to the owner only, without candidate data or attachments.

## Actual English capture plan

Record a single dedicated Chrome window, with unrelated tabs/notifications hidden. Use the production client above, English Hirelix and English Google UI. Show the browser address bar where it identifies the OAuth client, but keep secrets, codes, cookies and unrelated account data out of the capture. The operator must personally handle the Google unverified warning and sensitive consent. Do not resume an expired callback: the October 7 attempt returned `state_mismatch` and did not persist gmail.send.

1. Show the public Hirelix homepage and its privacy link. Narration: “Hirelix helps headhunters prepare recommendations. Gmail is optional and is used only to send a message the user has reviewed.”
2. Open the prepared verification document and delivery panel. Show no CV attachments. Select Gmail and Connect Gmail. Narration: “Connecting Gmail adds send permission to basic Google sign-in.”
3. Show the actual account selection, unverified notice and full consent flow for the production client, including gmail.send. The owner completes the warning and grant. Narration: “Hirelix requests permission to send email. It does not request mailbox reading or modification.”
4. Return to Hirelix and verify Connected. Review the exact recipient (the already-authorized owner mailbox, available in the self-test preparation), subject and verification-only body below. Click Send email once. Narration: “This message goes to my own mailbox, contains no candidate data and has no attachments.”
5. Show the actual send receipt and read back the matching received self-test in Gmail, avoiding unrelated inbox content. Record the Gmail message ID privately for acceptance. Narration: “The production send has been accepted, and this matching message confirms receipt.” Say this only after actual evidence exists.
6. Show the product Disconnect Gmail control and verify disconnection when the demonstration is complete. Test ordinary sign-in and reconnect separately if needed; do not claim these based on an existing session.

Document: `d612a9e8-f057-43c1-bc1a-3378525bf3c1`.

Subject: **Hirelix Gmail connection verification — independent production client**

Body:

> This is an authorized self-test of Hirelix Gmail sending. It contains no real candidate information and no attachments. Purpose: verify the new independent Hirelix Production Gmail connection and demonstrate user-reviewed sending for Google OAuth verification. No action is required.

If the send is uncertain, check Sent/receipt before any retry. Never replay a successful or ambiguous send to make a recording look cleaner. Capture and inspect a real recording before upload; screenshots and staged UI are insufficient. The previous 96-second MOV includes unrelated desktop content and is unsuitable.

## Submission readiness

Inspect the complete recording locally for legible English consent, exact production client, scope use, reviewed send and receipt. Upload the inspected recording as unlisted only within the owner's authorized review workflow. Put the real YouTube URL and the justification into the Console, save and read back, then review the verification summary before submitting. No URL exists for this run yet.

Google's [sensitive-scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) describes the scope justification and demonstration requirements. The [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes) identifies gmail.send and its sensitivity. The live Console is the final source for requested fields and current submission state.

## Submission attempt after owner authorization

The owner explicitly requested submission. The scope justification (746/1000 characters) was saved successfully. The formal submission page confirms the correct production identity and justification, but reports only “missing demonstration video”; Confirm remains disabled. Evidence: `output/acceptance-20261007/google-submit-video-required.png`. No submission has occurred.

Native Screenshot/QuickTime recording is available, but remote recording-window selection was unreliable. A 36.77-second homepage trial is incomplete. A later 46.08-second screen recording contains unrelated desktop/app content and is rejected for upload; neither has been uploaded. The owner was asked to start a recording of only the dedicated Hirelix Chrome window so the actual English OAuth and reviewed send demonstration can continue. There is no active recording at the last process check.

## Capture resumed after computer restart

The owner started a new dedicated Chrome-window recording at approximately 22:25 on October 7 (Asia/Shanghai). The real flow showed the homepage, optional Gmail privacy disclosure, disconnect and reconnect, account selection and the Google unverified warning. The owner personally completed the warning and permission grant. Google's displayed warning was Chinese; the recording still needs inspection and English explanation before it can be considered ready for review.

Creating another AI draft was rejected because this account's AI allowance had ended. No billing or allowance changes were made. Instead, the existing fictional QA draft `486fa952-0178-41a9-a169-f1c07d679eb2`, which had no selected CV, was manually revised using the product editor; earlier content remains in version history. The saved title is “Hirelix Gmail OAuth review — owner self-test 7 October 2026”. The verification-only body contains no candidate information and no attachments. One real send to the owner's same mailbox succeeded at 22:32:21. Gmail independently returned message `1a116c79941f5352` with SENT and INBOX labels and no attachments. Evidence: `output/acceptance-20261007/recorded-gmail-send-success.png`.

The Gmail browser page remained loading, so no visible inbox readback is claimed for this capture; connector receipt evidence is independent of the browser. The recording stop shortcut did not confirm completion, and the owner was asked to use the menu-bar Stop control. The new MOV must be finalized and inspected before upload. Google verification is still unsubmitted.

## Finalized recording inspection

The owner supplied the finalized `录屏2026-10-07 22.27.12.mov` after stopping capture. A copy is preserved locally as `output/acceptance-20261007/google-review-original.mov` (508.706667 seconds, 3104×1876, video only). Inspection confirmed the actual privacy disclosure, account selection, unverified warning, sign-in confirmation, Gmail send consent, callback, reviewed self-send and final receipt. Contrary to the earlier browser observation, the recording's later portion does show the exact received Gmail self-test; this has now been visually inspected.

An edited review copy is `output/acceptance-20261007/hirelix-google-oauth-review.mp4` (185.7 seconds, 6,577,139 bytes). Only real recording segments are used; waiting and the unsuccessful AI draft attempt were removed. English explanatory captions are added below the actual Chrome footage, including translations of the Chinese Google screens. The original footage and edits are retained locally. The final receipt frame visibly shows the actual owner's self-test, with no unrelated inbox message content.

YouTube Studio is signed in to the owner's existing “Noah in Shanghai” channel. Its upload dialog explicitly says submitting a video confirms acceptance of YouTube Terms of Service and Community Guidelines. Per computer-use action-time legal-agreement requirements, owner confirmation was requested before uploading. Intended visibility is unlisted. No upload URL exists yet; Google verification is still unsubmitted.

## Uploaded video and final questionnaire blocker

The owner explicitly confirmed acceptance of the upload terms. The edited video was uploaded to the existing channel, saved as **unlisted**, and verified playing at https://www.youtube.com/watch?v=b9n19mYhA7w. This real URL was saved into Google data-access configuration and read back in the verification summary. The summary's Confirm action now works and opens the final verification questionnaire; it does not itself submit the application.

Before checking the questionnaire's “read requirements / application meets all requirements” declaration, the live [Google verification requirements](https://support.google.com/cloud/answer/13464321?hl=en) were read. They explicitly require the OAuth consent screen language to be English. The current footage has Chinese consent with English explanatory captions, so the compliance declaration was **not** checked, and the questionnaire was cancelled. Earlier readiness wording treating translated captions as sufficient was incorrect. Owner was asked to start a short English consent capture; the existing send and receipt do not need replay. Google verification remains **unsubmitted**, pending actual English consent footage and replacement of the submitted video link with the completed version.


## English re-consent capture and remaining scope disclosure

The owner recorded `录屏2026-10-07 23.05.49.mov` (102.14 seconds). Inspection confirms actual English Google warning, sign-in confirmation, re-consent and successful callback. The account already has four granted services; the consent displays a collapsed “4 services” link, which was not expanded before the owner continued. The prior 23:03 capture reverted to Chinese and was rejected.

An edited 181.1-second real-footage copy, `output/acceptance-20261007/hirelix-google-oauth-review-english.mp4` (6,757,970 bytes), combines the English re-consent with the earlier actual reviewed self-send and receipt. Captions explicitly identify separate captures and the existing authorization. It was uploaded to https://www.youtube.com/watch?v=hY0rXA3FjCk with unlisted visibility selected; YouTube processing was still pending at the last observation. This URL was saved in Google configuration and read back. Additional information accurately explains the existing four services.

Final re-reading of Google's requirements confirms that the consent must show the exact requested scopes, not only English UI. As the four-service disclosure is collapsed in this capture, the “meets all requirements” attestation was not checked and the final questionnaire was cancelled again. Verification remains **unsubmitted**. A short supplementary recording must expand “4 services” on the English consent page, showing Gmail sending and basic identity permissions, before another upload and final submission. Do not report the current video as fully compliant.
