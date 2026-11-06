-- Problems and ideas about the app itself, sent by anyone and read only by the platform admin
CREATE TABLE IF NOT EXISTS app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_name text NOT NULL DEFAULT '',
  sender_email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('problem','idea')),
  body text NOT NULL,
  page text NOT NULL DEFAULT '',
  device text NOT NULL DEFAULT '',
  app_version text NOT NULL DEFAULT '',
  photos jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','looking','planned','fixed','not_now')),
  reply text NOT NULL DEFAULT '',
  replied_at timestamptz,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_feedback_created ON app_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS app_feedback_user ON app_feedback (user_id, created_at DESC);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS feedback_on boolean NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS feedback_email boolean NOT NULL DEFAULT true;
