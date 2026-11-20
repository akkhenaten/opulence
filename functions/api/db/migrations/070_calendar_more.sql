-- Calendar slice 3: repeating meetings and the private subscribe link.
-- A repeating meeting is one row per time, sharing series_id, so one time can be moved, cancelled or declined alone;
-- repeat keeps the rule it was made with ({freq, count} or {freq, until}) for the wording.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS series_id uuid;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS repeat jsonb;
CREATE INDEX IF NOT EXISTS calendar_events_series ON calendar_events (series_id) WHERE series_id IS NOT NULL;

-- One secret link per person for Outlook, Apple or Google to subscribe to; a reset replaces the token
CREATE TABLE IF NOT EXISTS calendar_feeds (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
