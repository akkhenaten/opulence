-- Timesheets as a day-by-day table: Decline (not worked: no pay, no charge), rates fixed on approval, and cancelled shifts never paid
ALTER TABLE timesheets DROP CONSTRAINT IF EXISTS timesheets_status_check;
ALTER TABLE timesheets ADD CONSTRAINT timesheets_status_check CHECK (status IN ('pending','approved','signed','disputed','declined'));

ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS charge_rate numeric(8,2);
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS pay_rate numeric(8,2);
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS charge_rate_set boolean NOT NULL DEFAULT false;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS pay_rate_set boolean NOT NULL DEFAULT false;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS rate_note text NOT NULL DEFAULT '';
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS decline_reason text NOT NULL DEFAULT '';
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS declined_by uuid REFERENCES users(id);
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS declined_at timestamptz;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS queried_by uuid REFERENCES users(id);
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS queried_at timestamptz;
CREATE INDEX IF NOT EXISTS timesheets_status_idx ON timesheets (status);

-- One place for every cancel path (rota, cover, ops, compliance, HR): a cancelled assignment or shift declines its open timesheet.
-- Already on a pay statement or invoice: left as is and flagged for a manual credit. Re-accepted: the auto-decline is undone.
CREATE OR REPLACE FUNCTION timesheet_follow_assignment(asg uuid, active boolean) RETURNS void AS $$
BEGIN
  IF active THEN
    UPDATE timesheets SET status = 'pending', decline_reason = '', declined_by = NULL, declined_at = NULL, updated_at = now()
     WHERE assignment_id = asg AND status = 'declined' AND decline_reason = 'Shift cancelled' AND statement_id IS NULL AND invoice_id IS NULL;
  ELSE
    UPDATE timesheets SET status = 'declined', decline_reason = 'Shift cancelled', declined_at = now(), updated_at = now()
     WHERE assignment_id = asg AND status <> 'declined' AND statement_id IS NULL AND invoice_id IS NULL;
    UPDATE timesheets SET flags = array_append(flags, 'cancelled_after_billing'), updated_at = now()
     WHERE assignment_id = asg AND (statement_id IS NOT NULL OR invoice_id IS NOT NULL) AND NOT ('cancelled_after_billing' = ANY(flags));
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION timesheet_on_assignment_status() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM timesheet_follow_assignment(NEW.id, NEW.status IN ('assigned','accepted')
      AND (SELECT status FROM shifts WHERE id = NEW.shift_id) <> 'cancelled');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION timesheet_on_shift_status() RETURNS trigger AS $$
DECLARE r record;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = 'cancelled' OR OLD.status = 'cancelled') THEN
    FOR r IN SELECT id, status FROM shift_assignments WHERE shift_id = NEW.id LOOP
      PERFORM timesheet_follow_assignment(r.id, NEW.status <> 'cancelled' AND r.status IN ('assigned','accepted'));
    END LOOP;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS timesheet_assignment_status ON shift_assignments;
CREATE TRIGGER timesheet_assignment_status AFTER UPDATE OF status ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION timesheet_on_assignment_status();
DROP TRIGGER IF EXISTS timesheet_shift_status ON shifts;
CREATE TRIGGER timesheet_shift_status AFTER UPDATE OF status ON shifts
  FOR EACH ROW EXECUTE FUNCTION timesheet_on_shift_status();
