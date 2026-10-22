-- Recurring cover requests, in-app Messages and the Orb Ops system sender

CREATE TABLE cover_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role text NOT NULL REFERENCES roles(code),
  kind text NOT NULL DEFAULT 'one_off' CHECK (kind IN ('one_off','recurring')),
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly','fortnightly')),
  days jsonb NOT NULL DEFAULT '[]',
  start_date date NOT NULL,
  end_date date,
  expanded_to date,
  accepted_all boolean NOT NULL DEFAULT false,
  root_id uuid,
  open boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  requested_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON cover_series (venue_id);

ALTER TABLE cover_requests
  ADD COLUMN series_id uuid REFERENCES cover_series(id) ON DELETE CASCADE,
  ADD COLUMN occurs_on date,
  ADD COLUMN change_status text NOT NULL DEFAULT 'none' CHECK (change_status IN ('none','pending','approved','declined')),
  ADD COLUMN change_scope text CHECK (change_scope IN ('one','future')),
  ADD COLUMN change_payload jsonb,
  ADD COLUMN change_by uuid REFERENCES users(id),
  ADD COLUMN change_reason text DEFAULT '';
CREATE INDEX ON cover_requests (series_id, occurs_on);

-- Every existing request becomes a one-off series of its own
DO $$
DECLARE r record; sid uuid;
BEGIN
  FOR r IN SELECT * FROM cover_requests WHERE series_id IS NULL LOOP
    INSERT INTO cover_series (venue_id, role, kind, days, start_date, end_date, notes, status, requested_by, created_at)
    VALUES (r.venue_id, r.role, 'one_off',
      jsonb_build_array(jsonb_build_object(
        'dow', extract(isodow FROM r.starts_at AT TIME ZONE 'Europe/London')::int,
        'start', to_char(r.starts_at AT TIME ZONE 'Europe/London', 'HH24:MI'),
        'end', to_char(r.ends_at AT TIME ZONE 'Europe/London', 'HH24:MI'),
        'headcount', r.headcount)),
      (r.starts_at AT TIME ZONE 'Europe/London')::date, (r.starts_at AT TIME ZONE 'Europe/London')::date,
      r.notes, CASE WHEN r.status = 'cancelled' THEN 'cancelled' ELSE 'active' END, r.requested_by, r.created_at)
    RETURNING id INTO sid;
    UPDATE cover_requests SET series_id = sid, occurs_on = (r.starts_at AT TIME ZONE 'Europe/London')::date WHERE id = r.id;
  END LOOP;
END $$;

-- Messages
ALTER TABLE users ADD COLUMN system boolean NOT NULL DEFAULT false;
INSERT INTO users (email, name, role, status, system) VALUES ('ops@system.orb', 'Orb Ops', 'company', 'disabled', true) ON CONFLICT (email) DO NOTHING;

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('direct','group','cover','shift','ops','pay')),
  ref_id uuid,
  title text DEFAULT '',
  created_by uuid REFERENCES users(id),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversations_ref ON conversations (kind, ref_id) WHERE ref_id IS NOT NULL;

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  muted boolean NOT NULL DEFAULT false,
  left_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX ON conversation_members (user_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]',
  quick jsonb,
  quick_used text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at);

CREATE TABLE message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
