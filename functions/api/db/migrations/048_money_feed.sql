-- Invoices fed live from approved timesheets: an approved timesheet sits on its venue's draft invoice and the officer's draft
-- statement straight away and follows every change while the draft is open. "Locked" now means billed: on an issued invoice,
-- or on a statement that is issued or whose pay run has left draft. Lines on an open draft move with their timesheet.

-- Billed: the one rule the table, clock rebuilds and the cancel trigger share
CREATE OR REPLACE FUNCTION timesheet_billed(st uuid, inv uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM invoices WHERE id = inv AND status <> 'draft')
      OR EXISTS (SELECT 1 FROM statements s LEFT JOIN pay_runs r ON r.id = s.pay_run_id
                  WHERE s.id = st AND (s.status <> 'draft' OR COALESCE(r.status, 'draft') <> 'draft'))
$$ LANGUAGE sql STABLE;

-- Needs a look by the feed: set on any change that moves money, cleared once its draft lines match
-- (every existing timesheet starts marked: the first sweep after go-live pulls the approved backlog onto drafts).
-- feed_since is when a change marked it; requests sync those straight away, the backlog (no feed_since) is left to the sweep.
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS feed_dirty boolean NOT NULL DEFAULT true;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS feed_since timestamptz;
CREATE INDEX IF NOT EXISTS timesheets_feed_dirty_idx ON timesheets (id) WHERE feed_dirty;
CREATE INDEX IF NOT EXISTS invoice_lines_timesheet_idx ON invoice_lines (timesheet_id) WHERE timesheet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS statement_lines_timesheet_idx ON statement_lines (timesheet_id) WHERE timesheet_id IS NOT NULL;

CREATE OR REPLACE FUNCTION timesheet_mark_feed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.hours IS DISTINCT FROM OLD.hours
     OR NEW.actual_start IS DISTINCT FROM OLD.actual_start OR NEW.actual_end IS DISTINCT FROM OLD.actual_end
     OR NEW.charge_rate IS DISTINCT FROM OLD.charge_rate OR NEW.pay_rate IS DISTINCT FROM OLD.pay_rate THEN
    NEW.feed_dirty := true;
    NEW.feed_since := now();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS timesheet_feed_dirty ON timesheets;
CREATE TRIGGER timesheet_feed_dirty BEFORE INSERT OR UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION timesheet_mark_feed();

-- Pay runs the feed opens itself
ALTER TABLE pay_runs DROP CONSTRAINT IF EXISTS pay_runs_created_via_check;
ALTER TABLE pay_runs ADD CONSTRAINT pay_runs_created_via_check CHECK (created_via IN ('user','ai','auto'));

-- A cancelled assignment or shift declines its timesheet unless it is billed (then it is flagged for a credit).
-- Lines on open drafts are dropped by the feed straight after (the decline marks the timesheet for it).
CREATE OR REPLACE FUNCTION timesheet_follow_assignment(asg uuid, active boolean) RETURNS void AS $$
BEGIN
  IF active THEN
    UPDATE timesheets SET status = 'pending', decline_reason = '', declined_by = NULL, declined_at = NULL, updated_at = now()
     WHERE assignment_id = asg AND status = 'declined' AND decline_reason = 'Shift cancelled' AND NOT timesheet_billed(statement_id, invoice_id);
  ELSE
    UPDATE timesheets SET status = 'declined', decline_reason = 'Shift cancelled', declined_at = now(), updated_at = now()
     WHERE assignment_id = asg AND status <> 'declined' AND NOT timesheet_billed(statement_id, invoice_id);
    UPDATE timesheets SET flags = array_append(flags, 'cancelled_after_billing'), updated_at = now()
     WHERE assignment_id = asg AND timesheet_billed(statement_id, invoice_id) AND NOT ('cancelled_after_billing' = ANY(flags));
  END IF;
END $$ LANGUAGE plpgsql;
