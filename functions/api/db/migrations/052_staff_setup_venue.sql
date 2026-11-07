-- Staff setup gets a second shared link, for venue managers: row 1 is the officers' link, row 2 the venue managers'.
-- A venue manager's submission becomes an invited Venue Manager login (no email sent), not a staff profile.
ALTER TABLE staff_setup_link DROP CONSTRAINT IF EXISTS staff_setup_link_id_check;
ALTER TABLE staff_setup_link ADD CONSTRAINT staff_setup_link_id_check CHECK (id IN (1, 2));
ALTER TABLE staff_setup_submissions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'officer';
