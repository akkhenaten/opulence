-- Release 2: head doorman, one lead per shift, the shift log and the venue ban register

INSERT INTO roles (code, name, requires_sia, accepted_licences, required_docs)
SELECT 'head_door', 'Head Doorman', true, accepted_licences, required_docs FROM roles WHERE code = 'door'
ON CONFLICT (code) DO NOTHING;

ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS shift_assignments_one_lead ON shift_assignments (shift_id) WHERE is_lead;

-- One log per shift; the lead signs it off with a handover for the next team
CREATE TABLE IF NOT EXISTS shift_logs (
  shift_id uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','signed')),
  handover_summary text NOT NULL DEFAULT '',
  signed_by uuid REFERENCES users(id),
  signed_at timestamptz
);

CREATE TABLE IF NOT EXISTS shift_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note','handover','incident','ban')),
  body text NOT NULL DEFAULT '',
  photos jsonb NOT NULL DEFAULT '[]',
  state text NOT NULL DEFAULT 'kept' CHECK (state IN ('kept','removed')),
  curated_by uuid REFERENCES users(id),
  curated_at timestamptz,
  incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  ban_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shift_log_entries_shift ON shift_log_entries (shift_id, created_at);

-- Customers barred from a venue (not to be confused with venue_bans, which keeps officers away from a venue)
CREATE TABLE IF NOT EXISTS customer_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  photo_key text,
  reason text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','lapsed','revoked','rejected')),
  proposed_by uuid REFERENCES users(id),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  revoked_reason text NOT NULL DEFAULT '',
  source_entry_id uuid REFERENCES shift_log_entries(id) ON DELETE SET NULL,
  photo_purge_after date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS customer_bans_venue ON customer_bans (venue_id, status);

ALTER TABLE shift_log_entries ADD CONSTRAINT shift_log_entries_ban FOREIGN KEY (ban_id) REFERENCES customer_bans(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS log_entry_id uuid REFERENCES shift_log_entries(id) ON DELETE SET NULL;
