-- Calendar: meetings with invites and replies, next to the rota. The organiser is an attendee too (accepted), so
-- reminders, lists and free/busy read one table. seq is the .ics SEQUENCE, raised whenever the time moves.
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'meeting' CHECK (kind IN ('meeting','task','block')),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  where_kind text NOT NULL DEFAULT 'none' CHECK (where_kind IN ('none','venue','hq','address','phone','video')),
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  private boolean NOT NULL DEFAULT false,
  organiser_id uuid NOT NULL REFERENCES users(id),
  seq int NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancel_note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS calendar_events_time ON calendar_events (starts_at, ends_at);

CREATE TABLE IF NOT EXISTS calendar_attendees (
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response text NOT NULL DEFAULT 'pending' CHECK (response IN ('pending','accepted','maybe','declined')),
  note text NOT NULL DEFAULT '',
  proposed_start timestamptz,
  proposed_end timestamptz,
  proposal_note text NOT NULL DEFAULT '',
  reminders int[] NOT NULL DEFAULT '{1440,30}',
  reminded int[] NOT NULL DEFAULT '{}',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS calendar_attendees_user ON calendar_attendees (user_id);
