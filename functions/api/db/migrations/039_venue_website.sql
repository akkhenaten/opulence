-- Every venue has a tile on the landing page unless the office hides it
ALTER TABLE venues ADD COLUMN IF NOT EXISTS on_website boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS website_blurb text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS website_photo_url text;
