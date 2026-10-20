-- Managers and venue users get a profile photo too (officers keep theirs on the staff record)
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_key text;

-- Fast duplicate checks when adding staff
CREATE INDEX IF NOT EXISTS officers_email_lower_idx ON officers (lower(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS officers_sia_number_idx ON officers (sia_number) WHERE sia_number <> '';
UPDATE officers SET email = lower(trim(email)) WHERE email <> lower(trim(email));
