-- What a notification is about (asg:<assignment>, shift:<shift>, ops:<card>), so it can be withdrawn when that changes
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ref text;
CREATE INDEX IF NOT EXISTS notifications_ref_idx ON notifications (ref) WHERE ref IS NOT NULL;

-- Ops AI is now called Orb, and so is the officers' chat with it
UPDATE conversations SET title = 'Orb' WHERE kind = 'ops' AND title = 'Orb Ops';
UPDATE users SET name = 'Orb' WHERE system AND name = 'Orb Ops';
