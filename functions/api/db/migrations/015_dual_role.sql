-- One person, two roles: a manager login with a linked staff record.
-- When nobody else could approve a manager's own hours or pay, they may approve it themselves; it is stamped here.
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false;
ALTER TABLE statements ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false;
