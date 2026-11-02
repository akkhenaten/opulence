-- App style chosen by the company: 'classic' (light, iOS feel) or 'control' (dark "Control Room")
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ui_style text NOT NULL DEFAULT 'classic';
DO $$ BEGIN
  ALTER TABLE settings ADD CONSTRAINT settings_ui_style_check CHECK (ui_style IN ('classic', 'control'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
