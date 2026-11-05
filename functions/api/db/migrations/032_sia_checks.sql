-- SIA register checks: a manager looks the licence up on the SIA public register and records what it shows.
-- The officer row keeps the latest result (it blocks rostering when not active); sia_checks is the history.
ALTER TABLE officers
  ADD COLUMN IF NOT EXISTS sia_status text NOT NULL DEFAULT 'pending'
    CHECK (sia_status IN ('pending','active','expired','suspended','revoked','investigation','not_found')),
  ADD COLUMN IF NOT EXISTS sia_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS sia_last_verified_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS sia_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  checked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active','expired','suspended','revoked','investigation','not_found')),
  expiry date,
  sector text,
  licence_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sia_checks_officer ON sia_checks (officer_id, created_at DESC);

-- Applicants already marked "SIA checked" carry over as an active check
INSERT INTO sia_checks (officer_id, checked_by, status, licence_number, notes, created_at)
SELECT a.officer_id, a.sia_checked_by, 'active', o.sia_number, 'Marked checked before the assistant', a.sia_checked_at
  FROM applications a JOIN officers o ON o.id = a.officer_id
 WHERE a.sia_checked_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sia_checks c WHERE c.officer_id = a.officer_id);
UPDATE officers o SET sia_status = 'active', sia_last_verified_at = a.sia_checked_at, sia_last_verified_by = a.sia_checked_by
  FROM applications a
 WHERE a.officer_id = o.id AND a.sia_checked_at IS NOT NULL AND o.sia_last_verified_at IS NULL;
