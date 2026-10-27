-- Recurring reports are delegated from a real user message in their conversation.
ALTER TABLE hirelix_private_schedules
  ADD COLUMN IF NOT EXISTS authorization_message_id uuid REFERENCES hirelix_agent_messages(id),
  ADD COLUMN IF NOT EXISTS source_authorization_message_id uuid REFERENCES hirelix_agent_messages(id),
  ADD COLUMN IF NOT EXISTS authorization_quote text,
  ADD COLUMN IF NOT EXISTS source_authorization_quote text;
