-- Chat upgrades: reply-to, @mentions in chats, pinned and must-confirm messages, voice note transcripts, search, reactions
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS must_confirm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_status text CHECK (transcript_status IN ('pending','working','retry','done','failed'));

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (to_tsvector('english', body || ' ' || coalesce(transcript, ''))) STORED;

CREATE INDEX IF NOT EXISTS messages_search ON messages USING gin (search);
CREATE INDEX IF NOT EXISTS messages_pinned ON messages (conversation_id) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conv_created ON messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like','love','laugh','wow','sad','clap')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_confirms (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
