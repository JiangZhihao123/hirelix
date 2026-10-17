ALTER TABLE hirelix_user_settings ADD COLUMN IF NOT EXISTS default_mailbox_provider text CHECK (default_mailbox_provider IN ('google', 'microsoft'));
ALTER TABLE account ADD COLUMN IF NOT EXISTS "mailboxEmail" text;
