-- Paid meetings and tasks: a company manager ticks Paid (at each officer's usual rate, or one typed for it). After it ends
-- the organiser confirms who came and for how long; that confirmed time becomes an hours line on each officer's draft pay
-- statement (an office cost, never on a venue invoice) and follows later corrections until its pay run leaves draft.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS pay_rate numeric(8,2);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS held_at timestamptz;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS held_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS calendar_events_to_confirm ON calendar_events (organiser_id, ends_at) WHERE paid AND held_at IS NULL AND cancelled_at IS NULL;

-- One row per officer on a held paid meeting: came or not, the times they were there and what that pays
CREATE TABLE IF NOT EXISTS calendar_pay (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE RESTRICT,
  officer_id uuid NOT NULL REFERENCES officers(id),
  attended boolean NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  hours numeric(6,2) NOT NULL DEFAULT 0,
  rate numeric(8,2),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  statement_id uuid REFERENCES statements(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, officer_id)
);

-- The pay line a held meeting put on a statement (like timesheet_id for shift hours)
ALTER TABLE statement_lines ADD COLUMN IF NOT EXISTS calendar_pay_id uuid REFERENCES calendar_pay(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS statement_lines_calendar_pay_idx ON statement_lines (calendar_pay_id) WHERE calendar_pay_id IS NOT NULL;
