-- Venue feedback about staff, a shift, the service or anything else; seen by the office and the venue that wrote it
CREATE TABLE IF NOT EXISTS venue_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  about text NOT NULL CHECK (about IN ('staff','shift','service','other')),
  officer_id uuid REFERENCES officers(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  rating int CHECK (rating BETWEEN 1 AND 5),
  tone text NOT NULL CHECK (tone IN ('praise','suggestion','complaint')),
  comment text NOT NULL DEFAULT '',
  feedback_id uuid REFERENCES venue_feedback(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  reply text NOT NULL DEFAULT '',
  replied_by uuid REFERENCES users(id) ON DELETE SET NULL,
  replied_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  on_behalf boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_comments_venue ON venue_comments (venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS venue_comments_status ON venue_comments (status);

-- Customers through the door on the night, entered by the lead officer
ALTER TABLE shift_logs ADD COLUMN IF NOT EXISTS customers int CHECK (customers >= 0);
ALTER TABLE shift_logs ADD COLUMN IF NOT EXISTS customers_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE shift_logs ADD COLUMN IF NOT EXISTS customers_at timestamptz;
