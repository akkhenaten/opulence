-- ===== Ops AI: in-app operations manager =====
ALTER TABLE settings
  ADD COLUMN ops_jobs jsonb NOT NULL DEFAULT '{"chase":true,"cover":true,"feedback":true,"venue_requests":true,"reconcile":true,"chat":true}',
  ADD COLUMN ops_escalate_minutes int NOT NULL DEFAULT 10,
  ADD COLUMN ops_offer_wait_minutes int NOT NULL DEFAULT 30,
  ADD COLUMN ops_reconcile_dow int NOT NULL DEFAULT 1,          -- 1 = Monday … 7 = Sunday (ISO)
  ADD COLUMN ops_ai_cap_credits bigint NOT NULL DEFAULT 2000000, -- monthly AI budget in credits
  ADD COLUMN ops_ai_used numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN ops_ai_month text NOT NULL DEFAULT '';

ALTER TABLE shift_assignments
  ADD COLUMN chased_at timestamptz,
  ADD COLUMN reply text CHECK (reply IN ('on_my_way','cant_make_it')),
  ADD COLUMN reply_eta_min int,
  ADD COLUMN reply_reason text DEFAULT '',
  ADD COLUMN replied_at timestamptz,
  ADD COLUMN escalated_at timestamptz;

CREATE TABLE attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('late','no_show','left_early','cant_make_it')),
  minutes int,
  reason text DEFAULT '',
  notified boolean NOT NULL DEFAULT false,
  excused boolean NOT NULL DEFAULT false,
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, kind)
);
CREATE INDEX ON attendance_events (officer_id, created_at DESC);

CREATE TABLE venue_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  rating int CHECK (rating BETWEEN 1 AND 5),
  note text DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reminded_at timestamptz,
  answered_at timestamptz,
  answered_by uuid REFERENCES users(id),
  UNIQUE (shift_id, officer_id)
);
CREATE INDEX ON venue_feedback (venue_id, answered_at);

CREATE TABLE ops_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('cover','venue_request','reconcile','feedback')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','done','expired')),
  title text NOT NULL,
  reason text DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE,
  officer_id uuid REFERENCES officers(id) ON DELETE SET NULL,
  dedupe text UNIQUE,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ops_items (status, created_at DESC);

CREATE TABLE cover_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES ops_items(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  batch int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','declined','filled_by_other','expired')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (shift_id, officer_id)
);

CREATE TABLE venue_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  text text NOT NULL,
  parsed jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','declined')),
  decline_reason text DEFAULT '',
  item_id uuid REFERENCES ops_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ops_activity (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  text text NOT NULL,
  ref_type text,
  ref_id uuid,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  credits numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ops_activity (created_at DESC);
