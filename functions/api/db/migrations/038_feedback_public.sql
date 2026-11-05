-- Praise the office has ticked onto the venue's website tile
ALTER TABLE venue_comments ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE INDEX IF NOT EXISTS venue_comments_public_idx ON venue_comments (venue_id) WHERE public;
