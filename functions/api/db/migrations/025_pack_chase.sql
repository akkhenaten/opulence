-- Ops AI pre-shift site pack check: each step once per booking, times set in Ops AI settings (minutes from shift start)
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS pack_chase1_at timestamptz,
  ADD COLUMN IF NOT EXISTS pack_chase2_at timestamptz,
  ADD COLUMN IF NOT EXISTS pack_escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pack_cover_at timestamptz,
  ADD COLUMN IF NOT EXISTS pack_signing_at timestamptz,   -- officer replied "Signing now"
  ADD COLUMN IF NOT EXISTS pack_settled_at timestamptz;   -- signed after cover was prepared, outcome handled

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS ops_pack_chase1 int NOT NULL DEFAULT -15,
  ADD COLUMN IF NOT EXISTS ops_pack_chase2 int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ops_pack_escalate int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS ops_pack_cover int NOT NULL DEFAULT 30;
