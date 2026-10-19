# Product feedback

Users open **Feedback** at the bottom of the workspace sidebar. They can
submit text and one optional PNG/JPEG/WebP screenshot up to 2 MB.
The receipt confirms database persistence, not email delivery or a response SLA.
Closing the form preserves the draft within the mounted workspace; reloading
an unsent form does not promise draft recovery.

The service captures the authenticated account email, sanitized route (no query,
fragment or UUID), server release version and timestamp. It does not collect CVs,
candidate records, conversation transcripts or browser logs. Images are decoded,
resized to at most 2000×2000 and re-encoded as PNG without original metadata.

## Operations

- Apply `supabase/migrations/20261018_product_feedback.sql` before deploying.
- Existing `RESEND_API_KEY` and `SEARCH_NOTIFICATIONS_FROM_EMAIL` send notifications
  to `support@hirelix.online`; `Reply-To` is the submitting user's email.
- `APP_BASE_URL` must refer to the same environment as the feedback database.
  Use the localhost port for local verification and `https://hirelix.online` in production.
- Management lives at `/admin/feedback`, reached from the independent `/admin` dashboard.
  It reuses the existing administrator username/password login and database-backed
  admin session. Product Google sessions and `ADMIN_EMAIL` never grant access.
  See [administrator configuration](product-analytics.md).
- Apply `supabase/migrations/20261019_admin_login.sql` before enabling the admin login.
  No additional role table, product-user grant or deployment is required for feedback.
- Management APIs live under `/api/admin/feedback`; screenshots require the same
  admin session. Status changes recheck authorization and same-origin requests.
  The old product list page and management endpoints are removed. The product
  `POST /api/workspace/feedback` remains submission-only, with no management link.
- The administrator can view private screenshots and mark pending / in progress /
  replied. The email link opens the operator's mail client; it does not send a reply
  or change status. Mark replied only after responding.
- Ordinary users cannot list reports, retrieve screenshots or update status.
  Feedback does not consume AI credits or require a connected user mailbox.

## Reliability

A single PostgreSQL table holds the report, optional image and notification state.
The authenticated user/request key pair makes a repeated submission idempotent;
reusing a key for different content is rejected. A per-user lock bounds accepted
reports to 10 per rolling 24 hours. Multipart bodies are bounded to 3 MB before parsing.

The route attempts notification after saving. The existing worker also checks
pending notifications on its scheduling tick. Each attempt claims one row with
`FOR UPDATE SKIP LOCKED` and a ten-minute lease; failures retry after five minutes,
up to five attempts. Expired uncertain attempts are retained as failed rather than
silently resending outside the provider's 24-hour idempotency window. See
[Resend's idempotency contract](https://resend.com/docs/dashboard/emails/idempotency-keys).
The administrator sees pending/failed notification status and can handle the saved
report directly. Provider acceptance is labelled as such, not recipient receipt.

## Verification

- `npx tsx --test tests/product-feedback.test.ts`
- Against an isolated local `hirelix_workspace_qa_*` database with the migration:
  `FEEDBACK_INTEGRATION=true node --env-file=.env.local --import tsx --test tests/product-feedback.integration.test.ts`
- `node --env-file=.env.local --import tsx scripts/qa/verify-admin-feedback.ts`: real local database, HTTP and Chrome; creates a temporary admin session, verifies screenshots, status persistence, cross-origin rejection and revocation, then deletes its fixtures. This does not retest the password-entry flow.
- Real Chrome: submit fictional text and screenshot, observe receipt, open the
  administrator list, read back screenshot, change status and reload.
- Real notification: verify the matching subject and body in the support inbox;
  verify Reply-To. A provider receipt alone does not prove mailbox arrival.
- Verify ordinary-user and signed-out access denial independently of admin access.

The initial local real-chain report `cf63d6df` was saved with notifications
unconfigured, then sent after restoring configuration. Zoho received the matching
support notification with the correct body and Reply-To. No real candidate data
or automatic support reply was sent. This is local evidence, not production proof.
