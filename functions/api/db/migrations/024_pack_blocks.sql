-- Clock-ins refused because the venue pack was not signed: one row per shift assignment, kept after they sign
CREATE TABLE IF NOT EXISTS pack_blocks (
  assignment_id uuid PRIMARY KEY REFERENCES shift_assignments(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  pack_status text NOT NULL,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
