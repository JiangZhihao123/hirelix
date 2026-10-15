-- Credit windows reuse verified Paddle events, including transactions delivered
-- before the subscription could be associated with its user. No data backfill.
CREATE INDEX IF NOT EXISTS hirelix_billing_paid_subscription_idx
ON hirelix_billing_events ((payload->'data'->>'subscription_id'))
WHERE event_type = 'transaction.completed';
CREATE INDEX IF NOT EXISTS hirelix_billing_subscription_history_idx
ON hirelix_billing_events ((payload->'data'->>'id'), (payload->>'occurred_at') DESC)
WHERE event_type LIKE 'subscription.%';
