# English production acceptance

Date: 2026-10-19, Asia/Shanghai. Production version: bd68f660. Real Chrome, production worker, PostgreSQL and model calls; fictional recruiting materials only.

## Verdict

The English core workflow is usable, with editorial and export-layout issues still open. This is not an unrestricted English launch sign-off: mailbox recovery remains unverified, and the exported recommendation needs more polished presentation.

## Verified

- Changed the test account interface language to English through Settings; navigation, account, email, subscription, candidate list, role list/details, recommendations, reminders and feedback form were inspected. Existing Chinese records and conversation titles stayed in their source language, correctly distinguished from interface text.
- Public homepage and contact-permission FAQ were read in English. No live registration, payment or external message was performed.
- English request retrieved the existing Cedar Production 1018 role, three candidates, saved recommendation and individual feedback. It saved a separate two-person English draft, excluding Sam, without overwriting the existing Chinese recommendation.
- Draft: `91420e71-3254-42ee-ab3d-3dc8595338ad`, language `en`, status `draft`, version 2, two people. Existing `ead5097e-9dd1-4d60-96ec-130c00a19cff` remains version 2 and `zh`.
- Conversation: `c954443a-3457-4ed3-9756-595d6cd68b82`; chat completed in 82 seconds, one attempt; document job completed in 43 seconds, one attempt. Durations overlap and must not be added.
- Correct distinctions: Mira's interview interest is not a booked interview; Alex's project coordination does not establish direct reports, and unknown is not zero; Sam remains excluded. English draft and visible tool progress are in English; the answer quotes the pre-existing Chinese document title as a reference.
- A separate English conversation (`48386658-aeb9-4783-ab16-4e3374b1079b`) retrieved the new draft and independently summarized the saved feedback. It used saved records as instructed, rather than requiring the user to provide IDs.
- PDF export was clicked in Chrome; the browser download event timed out, but the actual PDF appeared in Downloads. All three pages were rendered and inspected. Text is readable, without clipping or corrupted characters.

## Issues observed

1. **Export presentation:** the roughly 434-word draft repeats its title and spans three pages, with only a short closing section on the third. Export works, but the resulting client-facing presentation is unnecessarily long. This needs a generic heading/layout improvement, not a case-specific rewrite.
2. **English grammar:** role details display `1 sends recorded`; the role recommendation summary displays `1 saved materials`. List pages already handle singular/plural correctly, so this is inconsistent rather than a missing English locale.
3. **Terminology and style:** `Prepare submission` appears within Recommendations, while other controls use recommendation wording. Generated phrases such as `Direction fit` and `Source records` are understandable but less natural than a polished consultant-written brief. The first response was also longer than requested; the follow-up explicitly limited the output to three bullets.
4. **Mailbox boundary:** Gmail reading remains unavailable. Outlook connection checks and an attempted read within the first English task returned an explicit English failure. Saved email-derived records could still be retrieved; this does not prove fresh mailbox access or delivery. No email was sent.

## Scope and artifacts

No product code was changed or deployed during this acceptance. Findings are open, not silently marked fixed. No new share link, payment, scheduled interview, or external feedback submission was requested. The test account remains in English for review. Backup and alert configuration remains deferred per the user's instruction.

Browser PDF: `/Users/noah/Downloads/English acceptance QA — fictional candidates.pdf`.
Screenshots and supplementary evidence: local `tmp/whole-product-audit/english-acceptance-*`.

## Follow-up: local polish fixes

- English counts now distinguish `1 role`, `1 send recorded`, and `1 saved material`; preparation buttons use `Prepare recommendation`, and the document page uses recommendation terminology. The real local Chrome role page confirmed one saved material and the corrected action label; the list confirmed `1 role`.
- PDF export now omits an identical opening heading when the export title already supplies it, preserving different opening headings and later repeated headings. Reduced heading/paragraph spacing keeps the unchanged 434-word acceptance draft on two pages rather than three. Both pages were rendered and visually inspected; extracted body text matches the previous PDF after excluding titles, running headers and pagination.
- The local authenticated recommendation page also exported a real saved document through its PDF button; the downloaded two-page file was rendered and checked. No document content, client link, email or delivery status was changed.
- Validation: 5 PDF regression tests passed, including mixed-language content, long tables/text, page bounds, heading retention and short-section pagination; TypeScript and changed-file ESLint passed. The pagination fixture was lengthened to continue reaching the page boundary after the spacing reduction; it still asserts that the evidence section remains intact.
- These changes are local, not deployed. The latest user clarification treats the prior mailbox verification as accepted and Gmail review as an expected availability boundary. Historical account-specific failures above are not a newly reproduced mailbox bug; no new mailbox test or configuration change was performed.
