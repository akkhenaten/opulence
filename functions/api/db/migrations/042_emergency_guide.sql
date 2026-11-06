-- Who can open the Emergency guide (draft clinical copy): only the platform admin until it is signed off
ALTER TABLE settings ADD COLUMN IF NOT EXISTS emergency_guide text NOT NULL DEFAULT 'platform'
  CHECK (emergency_guide IN ('platform','managers','everyone'));
