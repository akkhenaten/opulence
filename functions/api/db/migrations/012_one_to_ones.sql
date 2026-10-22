-- One-to-one meetings, the goals agreed in them, and pay-rise agreements the officer signs
CREATE TABLE IF NOT EXISTS one_to_ones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES users(id),
  held_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  rating int CHECK (rating BETWEEN 1 AND 5),
  shared_with_officer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS one_to_ones_officer_idx ON one_to_ones (officer_id, held_on DESC);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  one_to_one_id uuid REFERENCES one_to_ones(id) ON DELETE SET NULL,
  title text NOT NULL,
  target text NOT NULL DEFAULT '',
  due_on date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','met','missed','dropped')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_officer_idx ON goals (officer_id, status);

CREATE TABLE IF NOT EXISTS goal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pay_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  one_to_one_id uuid REFERENCES one_to_ones(id) ON DELETE SET NULL,
  role text NOT NULL REFERENCES roles(code),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  current_rate numeric(8,2),
  new_rate numeric(8,2) NOT NULL,
  effective_from date NOT NULL,
  condition_goal_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','applied','void')),
  signed_name text,
  signature_png text,
  signed_ip text,
  signed_at timestamptz,
  applied_rate_id uuid REFERENCES officer_rates(id) ON DELETE SET NULL,
  applied_at timestamptz,
  waiting_notified_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_agreements_officer_idx ON pay_agreements (officer_id, status);

-- Ad-hoc venue ratings are not tied to a feedback prompt
ALTER TABLE venue_feedback ADD COLUMN IF NOT EXISTS adhoc boolean NOT NULL DEFAULT false;
