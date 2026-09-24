ALTER TABLE hirelix_user_settings
  ADD COLUMN IF NOT EXISTS ui_locale text NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hirelix_user_settings_ui_locale_check'
      AND conrelid = 'hirelix_user_settings'::regclass
  ) THEN
    ALTER TABLE hirelix_user_settings
      ADD CONSTRAINT hirelix_user_settings_ui_locale_check
      CHECK (ui_locale IN ('en', 'zh'));
  END IF;
END $$;
