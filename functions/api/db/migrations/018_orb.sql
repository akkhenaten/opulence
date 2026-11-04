-- Orb: live progress while a reply is being worked on, and the small changes Orb made straight away (with Undo)

ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS turn_id uuid UNIQUE;
ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';
DO $$ BEGIN
  ALTER TABLE assistant_messages ADD CONSTRAINT assistant_messages_status_check CHECK (status IN ('working','done'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '[]';
ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS done jsonb NOT NULL DEFAULT '[]';
