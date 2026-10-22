-- Demo requests from the public landing page
CREATE TABLE IF NOT EXISTS demo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text NOT NULL,
  email text NOT NULL,
  phone text,
  sites text,
  message text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demo_requests_ip_idx ON demo_requests (ip, created_at);
