-- Orb's venue setup cards: missing address, map pin, logo or a geofence radius nobody has confirmed
ALTER TABLE ops_items DROP CONSTRAINT IF EXISTS ops_items_kind_check;
ALTER TABLE ops_items ADD CONSTRAINT ops_items_kind_check CHECK (kind IN ('cover','venue_request','reconcile','feedback','compliance','venue_setup'));

-- Set when a manager saves or confirms the geofence radius (Site setup or an Orb card)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS radius_confirmed_at timestamptz;

-- A declined venue setup issue stays quiet until the details behind it change
CREATE TABLE IF NOT EXISTS venue_setup_dismissals (
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  issue_key text NOT NULL,
  sig text,
  reason text DEFAULT '',
  dismissed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, issue_key)
);
