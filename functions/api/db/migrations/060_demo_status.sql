-- Where each demo request stands, so the platform team can work through them (new → contacted → won/lost)
ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';
ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS status_note text NOT NULL DEFAULT '';
