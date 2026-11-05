-- Incident reports in progress: private to the writer until they submit
CREATE TABLE IF NOT EXISTS incident_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}',
  attachments jsonb NOT NULL DEFAULT '[]',
  step int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reminded_after_shift boolean NOT NULL DEFAULT false,
  reminded_morning boolean NOT NULL DEFAULT false,
  warned_expiry boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS incident_drafts_user ON incident_drafts (user_id, updated_at DESC);
