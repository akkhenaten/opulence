-- Incident reports written as one page, signed by the officer, their manager and the venue
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS title text DEFAULT '';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS body jsonb NOT NULL DEFAULT '[]';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS orb_versions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS manager_statement text DEFAULT '';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS venue_comment text DEFAULT '';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sign_stage text CHECK (sign_stage IN ('officer','manager','venue','complete'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resign_reason text DEFAULT '';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reference text UNIQUE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS pdf_sha256 text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS pdf_document_id uuid;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sealed_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS stage_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS venue_reminded_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS manager_reminded boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS incidents_sign_stage ON incidents (sign_stage) WHERE sign_stage IN ('officer','manager','venue');

ALTER TABLE incident_attachments ADD COLUMN IF NOT EXISTS caption text DEFAULT '';
ALTER TABLE incident_attachments ADD COLUMN IF NOT EXISTS section text DEFAULT '';

CREATE TABLE IF NOT EXISTS incident_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  version int NOT NULL,
  role text NOT NULL CHECK (role IN ('officer','manager','venue')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  title text DEFAULT '',
  png text NOT NULL,
  ip text,
  ua text,
  at timestamptz NOT NULL DEFAULT now(),
  void_at timestamptz
);
CREATE INDEX IF NOT EXISTS incident_signatures_incident ON incident_signatures (incident_id, at);
