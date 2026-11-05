-- Client reviews for the public website, filed against the website's client tiles (lib/siteClients.mjs)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS site_client text;

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client text NOT NULL,
  quote text NOT NULL,
  reviewer text NOT NULL DEFAULT '',
  reviewer_role text NOT NULL DEFAULT '',
  rating int CHECK (rating BETWEEN 1 AND 5),
  received_on date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','hidden')),
  sort int NOT NULL DEFAULT 0,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_client_idx ON reviews (client, status, sort);
