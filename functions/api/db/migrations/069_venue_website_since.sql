-- When a venue first appeared on the website: the landing page welcomes it as new for a week (siteVenues.isNewVenue).
-- Set once, the first time it is active and shown; hiding and showing it again doesn't make it new again.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS website_since timestamptz;
UPDATE venues SET website_since = created_at WHERE website_since IS NULL AND active AND on_website;

CREATE OR REPLACE FUNCTION venues_website_since() RETURNS trigger AS $$
BEGIN
  IF NEW.active AND NEW.on_website AND NEW.website_since IS NULL THEN NEW.website_since := now(); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venues_website_since ON venues;
CREATE TRIGGER venues_website_since BEFORE INSERT OR UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION venues_website_since();
