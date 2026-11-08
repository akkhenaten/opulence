-- Grace periods: a company manager lets an officer who can't work (compliance) keep working for a set time while they
-- send their documents. One open grace per officer; the officer row carries a copy of it (grace_until, grace_covers) so
-- every compliance check sees it without a join. grace_lapsed_on marks a grace that ran out with the documents still missing.
CREATE TABLE IF NOT EXISTS compliance_grace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  covers text[] NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text NOT NULL,
  risk_ack boolean NOT NULL DEFAULT false,
  renewals int NOT NULL DEFAULT 0,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ended_at timestamptz,
  ended_by uuid REFERENCES users(id) ON DELETE SET NULL,
  end_reason text,
  reminded_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_grace_open ON compliance_grace (officer_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS compliance_grace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grace_id uuid NOT NULL REFERENCES compliance_grace(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ends_on date,
  covers text[],
  reason text,
  by_user uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_grace_events_grace ON compliance_grace_events (grace_id, created_at);

ALTER TABLE officers ADD COLUMN IF NOT EXISTS grace_until date;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS grace_covers text[];
ALTER TABLE officers ADD COLUMN IF NOT EXISTS grace_lapsed_on date;
