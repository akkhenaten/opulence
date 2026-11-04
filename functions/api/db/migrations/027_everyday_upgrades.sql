-- Everyday upgrades: richer posts (video, link, place, tags, topics, captions), shout-outs, polls, events,
-- celebrations, announcement seen/acknowledge, saved posts, search, comment photos and share-to-chat
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'post' CHECK (kind IN ('post','shoutout','poll','event','celebration')),
  ADD COLUMN IF NOT EXISTS video jsonb,                       -- { key, poster_key, duration, w, h }
  ADD COLUMN IF NOT EXISTS link jsonb,                        -- { url, title, description, site, image_key }
  ADD COLUMN IF NOT EXISTS place jsonb,                       -- { name, address, lat, lng, venue_id }
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shoutout jsonb,                    -- { badge, to: [uuid] }
  ADD COLUMN IF NOT EXISTS celebration jsonb,                 -- { type, user_id, key, years? }
  ADD COLUMN IF NOT EXISTS announced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS must_ack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ack_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS removed_reason text;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (
    to_tsvector('english', body || ' ' || coalesce(place->>'name', '') || ' ' || coalesce(link->>'title', ''))) STORED;

CREATE INDEX IF NOT EXISTS posts_search ON posts USING gin (search);
CREATE INDEX IF NOT EXISTS posts_topics ON posts USING gin (topics);
CREATE INDEX IF NOT EXISTS posts_tags ON posts USING gin (tags);
CREATE INDEX IF NOT EXISTS posts_venue ON posts (venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_kind ON posts (kind, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS posts_celebration_key ON posts ((celebration->>'key')) WHERE kind = 'celebration';

ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS photo jsonb,                       -- { key, w, h }
  ADD COLUMN IF NOT EXISTS ai_check jsonb,
  ADD COLUMN IF NOT EXISTS hidden_reason text,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id);
ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED;
CREATE INDEX IF NOT EXISTS post_comments_search ON post_comments USING gin (search);

CREATE TABLE IF NOT EXISTS post_polls (
  post_id uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  options jsonb NOT NULL,                                     -- [{ id, text }]
  multi boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT false,
  show_results text NOT NULL DEFAULT 'after_vote' CHECK (show_results IN ('after_vote','always')),
  closes_at timestamptz,
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS poll_votes (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, option_id)
);

CREATE TABLE IF NOT EXISTS feed_events (
  post_id uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  capacity int CHECK (capacity IS NULL OR capacity > 0),
  cancelled_at timestamptz,
  reminded_day_at timestamptz,
  reminded_hour_at timestamptz
);
CREATE INDEX IF NOT EXISTS feed_events_starts ON feed_events (starts_at) WHERE cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS event_rsvps (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('going','maybe','no','waitlist')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Who has seen / acknowledged a pinned announcement
CREATE TABLE IF NOT EXISTS post_audience (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at timestamptz,
  acked_at timestamptz,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS saved_posts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS link_previews (
  url text PRIMARY KEY,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Personal Everyday choices: { birthday: false, welcome: true }
ALTER TABLE users ADD COLUMN IF NOT EXISTS feed_prefs jsonb NOT NULL DEFAULT '{}';

ALTER TABLE settings ADD COLUMN IF NOT EXISTS everyday jsonb NOT NULL
  DEFAULT '{"shoutouts":true,"celebrations":{"birthday":true,"anniversary":true,"welcome":true,"qualification":true},"featured_topics":[]}';

ALTER TABLE messages ADD COLUMN IF NOT EXISTS share jsonb;  -- { type: 'post', id }

-- Posts that were sent as announcements before this change keep showing under the Announcements filter
UPDATE posts p SET announced = true
  WHERE NOT p.announced AND EXISTS (SELECT 1 FROM audit_log a WHERE a.action = 'everyday.pin' AND a.entity_id = p.id::text AND (a.detail->>'announce')::boolean);
