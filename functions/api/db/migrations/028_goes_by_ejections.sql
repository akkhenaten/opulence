-- "Goes by" names, and the ejection log: every ejection / refusal is recorded; a ban is optional on top,
-- with a length, a scope (this venue, all the client's venues, every venue) and a reason category
ALTER TABLE users    ADD COLUMN IF NOT EXISTS goes_by text NOT NULL DEFAULT '';
ALTER TABLE officers ADD COLUMN IF NOT EXISTS goes_by text NOT NULL DEFAULT '';

ALTER TABLE customer_bans
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ban' CHECK (kind IN ('ejection','ban')),
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('ejected','refused_entry')),
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'venue' CHECK (scope IN ('venue','client','all'));
ALTER TABLE customer_bans ALTER COLUMN starts_on DROP NOT NULL;
ALTER TABLE customer_bans DROP CONSTRAINT IF EXISTS customer_bans_ban_dates;
ALTER TABLE customer_bans ADD CONSTRAINT customer_bans_ban_dates CHECK (kind = 'ejection' OR starts_on IS NOT NULL);
CREATE INDEX IF NOT EXISTS customer_bans_kind ON customer_bans (venue_id, kind, status);

-- Shift log entries can be ejections too (replace whatever the kind CHECK from 010 is called)
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'shift_log_entries'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%'
  LOOP EXECUTE format('ALTER TABLE shift_log_entries DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE shift_log_entries ADD CONSTRAINT shift_log_entries_kind_check CHECK (kind IN ('note','handover','incident','ban','ejection'));
