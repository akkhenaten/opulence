-- Online applications from the public Apply page ("Join the team"). An applicant is an officers row with
-- status 'applicant'; this table holds what came with the application and the AI read of the CV and SIA badge.
ALTER TABLE officers DROP CONSTRAINT IF EXISTS officers_status_check;
ALTER TABLE officers ADD CONSTRAINT officers_status_check CHECK (status IN ('applicant','onboarding','active','suspended','left','rejected'));

CREATE TABLE IF NOT EXISTS applications (
  officer_id uuid PRIMARY KEY REFERENCES officers(id) ON DELETE CASCADE,
  roles text[] NOT NULL DEFAULT '{}',
  availability text[] NOT NULL DEFAULT '{}',
  availability_note text,
  rtw_confirmed boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  ip text,
  ai jsonb,
  ai_status text NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','done','failed')),
  ai_error text,
  ai_at timestamptz,
  read_token text,
  sia_checked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  sia_checked_at timestamptz,
  rejected_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_ip_idx ON applications (ip, created_at);
CREATE INDEX IF NOT EXISTS applications_ai_idx ON applications (ai_status);

-- Upload keys handed to visitors of the Apply page: an application may only use its own uploads
CREATE TABLE IF NOT EXISTS apply_uploads (
  key text PRIMARY KEY,
  ip text,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apply_uploads_ip_idx ON apply_uploads (ip, created_at);
