-- Create user settings table for storing API keys
CREATE TABLE IF NOT EXISTS hirelix_user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdl_api_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE hirelix_user_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own settings"
  ON hirelix_user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON hirelix_user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON hirelix_user_settings FOR UPDATE
  USING (auth.uid() = user_id);
