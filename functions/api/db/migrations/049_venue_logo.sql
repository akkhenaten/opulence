-- A venue's logo: shown next to its name in the app (found on its website by Orb, or uploaded by a manager)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS logo_key text,
                   ADD COLUMN IF NOT EXISTS logo_url text;
