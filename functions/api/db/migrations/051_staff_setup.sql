-- Staff setup: one shared link (platform admin only) that officers use to send their own details;
-- each submission waits until it becomes a staff profile, then it is deleted
CREATE TABLE IF NOT EXISTS staff_setup_link (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS staff_setup_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  details jsonb NOT NULL,
  files jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_setup_submissions_ip_idx ON staff_setup_submissions (ip, created_at);

-- Upload keys handed to visitors of the form: a submission may only use its own uploads
CREATE TABLE IF NOT EXISTS staff_setup_uploads (
  key text PRIMARY KEY,
  ip text,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_setup_uploads_ip_idx ON staff_setup_uploads (ip, created_at);
